import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'

import VerificationFailedError from './errors/VerificationFailedError'
import InvalidSignatureError from './errors/InvalidSignatureError'

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
        propagationTimeout = DEFAULT_PROPAGATION_TIMEOUT, resendTimeout = DEFAULT_RESEND_TIMEOUT
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
        this.propagationTimeout = propagationTimeout
        this.resendTimeout = resendTimeout
        this.state = AbstractSubscription.State.unsubscribed
    }

    getState() {
        return this.state
    }

    setState(state) {
        debug(`Subscription: Stream ${this.streamId} state changed ${this.state} => ${state}`)
        this.state = state
        this.emit(state)
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
