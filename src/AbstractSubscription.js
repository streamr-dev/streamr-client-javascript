import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import { Errors, Utils } from 'streamr-client-protocol'

import VerificationFailedError from './errors/VerificationFailedError'
import InvalidSignatureError from './errors/InvalidSignatureError'
import EncryptionUtil from './EncryptionUtil'

const { OrderingUtil } = Utils
const debug = debugFactory('StreamrClient::AbstractSubscription')

let subId = 0
function generateSubscriptionId() {
    const id = subId
    subId += 1
    return id.toString()
}

const DEFAULT_PROPAGATION_TIMEOUT = 5000
const DEFAULT_RESEND_TIMEOUT = 5000

export default class AbstractSubscription extends EventEmitter {
    constructor(
        streamId, streamPartition, callback, groupKeys,
        propagationTimeout = DEFAULT_PROPAGATION_TIMEOUT, resendTimeout = DEFAULT_RESEND_TIMEOUT, isCombined = false
    ) {
        super()
        if (!streamId) {
            throw new Error('No stream id given!')
        }

        if (!callback) {
            throw new Error('No callback given!')
        }
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.id = generateSubscriptionId()
        this.groupKeys = groupKeys || {}

        if (!isCombined) {
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
            }, propagationTimeout, resendTimeout)
        }
        this.state = AbstractSubscription.State.unsubscribed
    }

    _clearGaps() {
        this.orderingUtil.clearGaps()
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
        if (err instanceof Errors.InvalidJsonError && err.streamMessage) {
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
    }
}

AbstractSubscription.State = {
    unsubscribed: 'unsubscribed',
    subscribing: 'subscribing',
    subscribed: 'subscribed',
    unsubscribing: 'unsubscribing',
}
