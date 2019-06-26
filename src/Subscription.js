import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import { Errors } from 'streamr-client-protocol'
import InvalidSignatureError from './errors/InvalidSignatureError'
import VerificationFailedError from './errors/VerificationFailedError'
import EncryptionUtil from './EncryptionUtil'
import OrderingUtil from './OrderingUtil'

const debug = debugFactory('StreamrClient::Subscription')

let subId = 0
function generateSubscriptionId() {
    const id = subId
    subId += 1
    return id.toString()
}

const DEFAULT_GAPFILL_TIMEOUT = 5000

class Subscription extends EventEmitter {
    constructor(streamId, streamPartition, callback, options, groupKeys, gapFillTimeout = DEFAULT_GAPFILL_TIMEOUT) {
        super()

        if (!streamId) {
            throw new Error('No stream id given!')
        }
        if (!callback) {
            throw new Error('No callback given!')
        }

        this.id = generateSubscriptionId()
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.resendOptions = options || {}
        this.state = Subscription.State.unsubscribed
        this.groupKeys = groupKeys || {}
        this.orderingUtil = new OrderingUtil(streamId, streamPartition, (orderedMessage) => {
            const newGroupKey = EncryptionUtil.decryptStreamMessage(orderedMessage, this.groupKeys[orderedMessage.getPublisherId()])
            if (newGroupKey) {
                this.groupKeys[orderedMessage.getPublisherId()] = newGroupKey
            }
            callback(orderedMessage.getParsedContent(), orderedMessage)
            if (orderedMessage.isByeMessage()) {
                this.emit('done')
            }
        }, (from, to, publisherId, msgChainId) => {
            this.emit('gap', from, to, publisherId, msgChainId)
        }, {
            gapFillTimeout,
        })

        if (this.resendOptions.from != null && this.resendOptions.last != null) {
            throw new Error(`Multiple resend options active! Please use only one: ${JSON.stringify(this.resendOptions)}`)
        }
        if (this.resendOptions.msgChainId != null && typeof this.resendOptions.publisherId === 'undefined') {
            throw new Error('publisherId must be defined as well if msgChainId is defined.')
        }
        if (this.resendOptions.from == null && this.resendOptions.to != null) {
            throw new Error('"from" must be defined as well if "to" is defined.')
        }

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
    }

    _clearGaps() {
        this.orderingUtil.clearGaps()
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

    // All the handle* methods should:
    // - return a promise for consistency
    // - swallow exceptions and emit them as 'error' events

    async handleBroadcastMessage(msg, verifyFn) {
        return this._catchAndEmitErrors(() => this._handleMessage(msg, verifyFn, false))
    }

    async handleResentMessage(msg, verifyFn) {
        return this._catchAndEmitErrors(() => {
            if (!this.isResending()) {
                throw new Error(`There is no resend in progress, but received resent message ${msg.serialize()}`)
            } else {
                const handleMessagePromise = this._handleMessage(msg, verifyFn, true)
                this._lastMessageHandlerPromise = handleMessagePromise
                return handleMessagePromise
            }
        })
    }

    async handleResending(response) {
        return this._catchAndEmitErrors(() => {
            if (!this.isResending()) {
                throw new Error(`There should be no resend in progress, but received ResendResponseResending message ${response.serialize()}`)
            }
            this.emit('resending', response)
        })
    }

    async handleResent(response) {
        return this._catchAndEmitErrors(async () => {
            if (!this.isResending()) {
                throw new Error(`There should be no resend in progress, but received ResendResponseResent message ${response.serialize()}`)
            }
            if (!this._lastMessageHandlerPromise) {
                throw new Error('Attempting to handle ResendResponseResent, but no messages have been received!')
            }

            // Delay event emission until the last message in the resend has been handled
            await this._lastMessageHandlerPromise.then(async () => {
                try {
                    this.emit('resent', response)
                } finally {
                    await this._finishResend()
                }
            })
        })
    }

    async handleNoResend(response) {
        return this._catchAndEmitErrors(async () => {
            if (!this.isResending()) {
                throw new Error(`There should be no resend in progress, but received ResendResponseNoResend message ${response.serialize()}`)
            }
            try {
                this.emit('no_resend', response)
            } finally {
                await this._finishResend()
            }
        })
    }

    async _finishResend() {
        this._lastMessageHandlerPromise = null
        this.setResending(false)
        await this.checkQueue()
    }

    async _handleMessage(msg, verifyFn, isResend = false) {
        if (msg.version !== 31) {
            throw new Error(`Can handle only StreamMessageV31, not version ${msg.version}`)
        }
        if (msg.prevMsgRef == null) {
            debug('handleMessage: prevOffset is null, gap detection is impossible! message: %o', msg)
        }

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

        this.emit('message received')
        this.orderingUtil.add(msg, isResend)
    }

    async checkQueue() {
        return this.orderingUtil.checkQueue()
    }

    hasResendOptions() {
        return this.resendOptions.from || this.resendOptions.last > 0
    }

    /**
     * Resend needs can change if messages have already been received.
     * This function always returns the effective resend options:
     *
     * If messages have been received:
     * - 'from' option becomes 'from' option the latest received message
     * - 'last' option stays the same
     */
    getEffectiveResendOptions() {
        const key = this.resendOptions.publisherId + this.resendOptions.msgChainId
        if (this.hasReceivedMessagesFrom(key) && this.hasResendOptions()
            && (this.resendOptions.from)) {
            return {
                // cannot know the first missing message so there will be a duplicate received
                from: {
                    timestamp: this.orderingUtil.lastReceivedMsgRef[key].timestamp,
                    sequenceNumber: this.orderingUtil.lastReceivedMsgRef[key].sequenceNumber,
                },
                publisherId: this.resendOptions.publisherId,
                msgChainId: this.resendOptions.msgChainId,
            }
        }
        return this.resendOptions
    }

    hasReceivedMessagesFrom(key) {
        return this.orderingUtil.lastReceivedMsgRef[key] !== undefined
    }

    getState() {
        return this.state
    }

    setState(state) {
        debug(`Subscription: Stream ${this.streamId} state changed ${this.state} => ${state}`)
        this.state = state
        this.emit(state)
    }

    isResending() {
        return this.orderingUtil.resending
    }

    setResending(resending) {
        debug(`Subscription: Stream ${this.streamId} resending: ${resending}`)
        this.orderingUtil.resending = resending
    }

    handleError(err) {
        /**
         * If parsing the (expected) message failed, we should still mark it as received. Otherwise the
         * gap detection will think a message was lost, and re-request the failing message.
         */
        let key
        if (err.streamMessage) {
            key = err.streamMessage.getPublisherId() + err.streamMessage.messageId.msgChainId
        }
        if (err instanceof Errors.InvalidJsonError && !this.orderingUtil.checkForGap(err.streamMessage.prevMsgRef, key)) {
            this.orderingUtil.lastReceivedMsgRef[key] = err.streamMessage.getMessageRef()
        }
        this.emit('error', err)
    }
}

Subscription.State = {
    unsubscribed: 'unsubscribed',
    subscribing: 'subscribing',
    subscribed: 'subscribed',
    unsubscribing: 'unsubscribing',
}

export default Subscription
