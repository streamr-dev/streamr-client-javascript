import debugFactory from 'debug'
import { Errors, Utils } from 'streamr-client-protocol'

import VerificationFailedError from './errors/VerificationFailedError'
import InvalidSignatureError from './errors/InvalidSignatureError'
import EncryptionUtil from './EncryptionUtil'
import Subscription from './Subscription'
import UnableToDecryptError from './errors/UnableToDecryptError'

const { OrderingUtil } = Utils
const debug = debugFactory('StreamrClient::AbstractSubscription')

const defaultUnableToDecrypt = (error) => {
    const ciphertext = error.streamMessage.getSerializedContent()
    const toDisplay = ciphertext.length > 100 ? `${ciphertext.slice(0, 100)}...` : ciphertext
    console.warn(`Unable to decrypt: ${toDisplay}`)
}

export default class AbstractSubscription extends Subscription {
    constructor(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout, orderMessages = true,
        onUnableToDecrypt = defaultUnableToDecrypt) {
        super(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout)
        this.callback = callback
        this.onUnableToDecrypt = onUnableToDecrypt
        this.pendingResendRequestIds = {}
        this.orderingUtil = (orderMessages) ? new OrderingUtil(streamId, streamPartition, (orderedMessage) => {
            this._inOrderHandler(orderedMessage)
        }, (from, to, publisherId, msgChainId) => {
            this.emit('gap', from, to, publisherId, msgChainId)
        }, this.propagationTimeout, this.resendTimeout) : undefined

        /** * Message handlers ** */

        this.on('unsubscribed', () => {
            this._clearGaps()
            this.setResending(false)
        })

        this.on('disconnected', () => {
            this.setState(Subscription.State.unsubscribed)
            this._clearGaps()
            this.setResending(false)
        })

        this.on('error', () => {
            this._clearGaps()
        })

        this.encryptedMsgsQueue = []
        this.alreadyFailedToDecrypt = {}
        this.waitingForGroupKey = {}
    }

    _inOrderHandler(orderedMessage) {
        return this._catchAndEmitErrors(() => {
            if (!this.waitingForGroupKey[orderedMessage.getPublisherId()]) {
                this._decryptAndHandle(orderedMessage)
            } else {
                this.encryptedMsgsQueue.push(orderedMessage)
            }
        })
    }

    _decryptAndHandle(orderedMessage) {
        try {
            const success = this._decryptOrRequestGroupKey(orderedMessage, orderedMessage.getPublisherId().toLowerCase())
            if (success) {
                this.callback(orderedMessage.getParsedContent(), orderedMessage)
                if (orderedMessage.isByeMessage()) {
                    this.emit('done')
                }
            } else {
                console.warn('Failed to decrypt. Requested the correct decryption key(s) and going to try again.')
            }
        } catch (err) {
            if (err instanceof UnableToDecryptError) {
                this.onUnableToDecrypt(err)
            } else {
                throw err
            }
        }
    }

    _requestGroupKeyAndQueueMessage(msg, start, end) {
        this.emit('groupKeyMissing', msg.getPublisherId(), start, end)
        this.waitingForGroupKey[msg.getPublisherId()] = true
        this.encryptedMsgsQueue.push(msg)
    }

    _handleEncryptedQueuedMsgs(publisherId) {
        delete this.waitingForGroupKey[publisherId]
        while (this.encryptedMsgsQueue.length > 0 && !this.waitingForGroupKey[this.encryptedMsgsQueue[0].getPublisherId()]) {
            this._decryptAndHandle(this.encryptedMsgsQueue[0])
            this.encryptedMsgsQueue.shift()
        }
    }

    addPendingResendRequestId(requestId) {
        this.pendingResendRequestIds[requestId] = true
    }

    async handleResentMessage(msg, verifyFn) {
        return this._catchAndEmitErrors(() => {
            if (!this.isResending()) {
                throw new Error(`There is no resend in progress, but received resent message ${msg.serialize()}`)
            } else {
                const handleMessagePromise = this._handleMessage(msg, verifyFn)
                this._lastMessageHandlerPromise = handleMessagePromise
                return handleMessagePromise
            }
        })
    }

    async handleResending(response) {
        return this._catchAndEmitErrors(() => {
            if (!this.pendingResendRequestIds[response.requestId]) {
                throw new Error(`Received unexpected ResendResponseResending message ${response.serialize()}`)
            }
            this.emit('resending', response)
        })
    }

    async handleResent(response) {
        return this._catchAndEmitErrors(async () => {
            if (!this.pendingResendRequestIds[response.requestId]) {
                throw new Error(`Received unexpected ResendResponseResent message ${response.serialize()}`)
            }

            if (!this._lastMessageHandlerPromise) {
                throw new Error('Attempting to handle ResendResponseResent, but no messages have been received!')
            }

            // Delay event emission until the last message in the resend has been handled
            await this._lastMessageHandlerPromise
            try {
                this.emit('resent', response)
            } finally {
                delete this.pendingResendRequestIds[response.requestId]
                this.finishResend()
            }
        })
    }

    async handleNoResend(response) {
        return this._catchAndEmitErrors(async () => {
            if (!this.pendingResendRequestIds[response.requestId]) {
                throw new Error(`Received unexpected ResendResponseNoResend message ${response.serialize()}`)
            }
            try {
                this.emit('no_resend', response)
            } finally {
                delete this.pendingResendRequestIds[response.requestId]
                this.finishResend()
            }
        })
    }

    _clearGaps() {
        if (this.orderingUtil) {
            this.orderingUtil.clearGaps()
        }
    }

    stop() {
        this._clearGaps()
    }

    getState() {
        return this.state
    }

    setState(state) {
        debug(`Subscription: Stream ${this.streamId} state changed ${this.state} => ${state}`)
        this.state = state
        this.emit(state)
    }

    handleError(err) {
        /**
         * If parsing the (expected) message failed, we should still mark it as received. Otherwise the
         * gap detection will think a message was lost, and re-request the failing message.
         */
        if (err instanceof Errors.InvalidJsonError && err.streamMessage && this.orderingUtil) {
            this.orderingUtil.markMessageExplicitly(err.streamMessage)
        }
        this.emit('error', err)
    }

    async _catchAndEmitErrors(fn) {
        try {
            return await fn()
        } catch (err) {
            console.error(err)
            this.emit('error', err)
            // Swallow rejection
            return Promise.resolve()
        }
    }

    static async validate(msg, verifyFn) {
        // Make sure the verification is successful before proceeding
        let valid
        try {
            valid = await verifyFn()
        } catch (cause) {
            throw new VerificationFailedError(msg, cause)
        }

        if (!valid) {
            throw new InvalidSignatureError(msg)
        }
    }

    async _handleMessage(msg, verifyFn) {
        await AbstractSubscription.validate(msg, verifyFn)
        this.emit('message received')
        if (this.orderingUtil) {
            this.orderingUtil.add(msg)
        } else {
            this._inOrderHandler(msg)
        }
    }
}
AbstractSubscription.defaultUnableToDecrypt = defaultUnableToDecrypt
