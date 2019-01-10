import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import { MessageLayer, Errors } from 'streamr-client-protocol'

const debug = debugFactory('StreamrClient::Subscription')

let subId = 0
function generateSubscriptionId() {
    const id = subId
    subId += 1
    return id.toString()
}

export default class Subscription extends EventEmitter {
    static get State() {
        return {
            unsubscribed: 'unsubscribed',
            subscribing: 'subscribing',
            subscribed: 'subscribed',
            unsubscribing: 'unsubscribing',
        }
    }

    constructor(streamId, streamPartition, callback, options) {
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
        this.callback = callback
        this.options = options || {}
        this.queue = []
        this.state = Subscription.State.unsubscribed
        this.resending = false
        this.lastReceivedMsgRef = null

        // Check that multiple resend options are not given
        let resendOptionCount = 0
        if (this.options.resend_from != null) {
            if (!(this.options.resend_from instanceof MessageLayer.MessageRef)) {
                throw new Error(`resend_from option needs to be a MessageRef: ${this.options.resend_from}`)
            }
            resendOptionCount += 1
        }
        if (this.options.resend_last != null) {
            resendOptionCount += 1
        }
        if (resendOptionCount > 1) {
            throw new Error(`Multiple resend options active! Please use only one: ${JSON.stringify(options)}`)
        }

        /** * Message handlers ** */

        this.on('unsubscribed', () => {
            this.setResending(false)
        })

        this.on('no_resend', (response) => {
            debug('Sub %s no_resend: %o', this.id, response)
            this.setResending(false)
            this.checkQueue()
        })

        this.on('resent', (response) => {
            debug('Sub %s resent: %o', this.id, response)
            this.setResending(false)
            this.checkQueue()
        })

        this.on('connected', () => {

        })

        this.on('disconnected', () => {
            this.setState(Subscription.State.unsubscribed)
            this.setResending(false)
        })
    }

    /**
     * Gap check: If the msg contains the previousMsgRef, and we know the lastReceivedMsgRef,
     * and the previousMsgRef is larger than what has been received, we have a gap!
     */
    checkForGap(previousMsgRef) {
        return previousMsgRef != null &&
            this.lastReceivedMsgRef != null &&
            Subscription.compareMessageRefs(previousMsgRef, this.lastReceivedMsgRef) === 1
    }

    handleMessage(msg, isResend = false) {
        if (msg.version !== 30) {
            throw new Error(`Can handle only StreamMessageV30, not version ${msg.version}`)
        }
        if (msg.prevMsgRef == null) {
            debug('handleMessage: prevOffset is null, gap detection is impossible! message: %o', msg)
        }

        // TODO: check this.options.resend_last ?
        // If resending, queue broadcast messages
        if (this.resending && !isResend) {
            this.queue.push(msg)
        } else if (this.checkForGap(msg.prevMsgRef) && !this.resending) {
            // Queue the message to be processed after resend
            this.queue.push(msg)

            const from = this.lastReceivedMsgRef // cannot know the first missing message so there will be a duplicate received
            const to = msg.prevMsgRef
            debug('Gap detected, requesting resend for stream %s from %o to %o', this.streamId, from, to)
            this.emit('gap', from, to)
        } else {
            const messageRef = new MessageLayer.MessageRef(msg.messageId.timestamp, msg.messageId.sequenceNumber)
            let res
            if (this.lastReceivedMsgRef != null) {
                res = Subscription.compareMessageRefs(messageRef, this.lastReceivedMsgRef)
            }
            if (res && (res === -1 || res === 0)) {
                // Prevent double-processing of messages for any reason
                debug('Sub %s already received message: %o, lastReceivedMsgRef: %d. Ignoring message.', this.id, messageRef, this.lastReceivedMsgRef)
            } else {
                // Normal case where prevMsgRef == null || lastReceivedMsgRef == null || prevMsgRef === lastReceivedMsgRef
                this.lastReceivedMsgRef = messageRef
                this.callback(msg.getParsedContent(), msg)
                if (msg.isByeMessage()) {
                    this.emit('done')
                }
            }
        }
    }

    checkQueue() {
        if (this.queue.length) {
            debug('Attempting to process %d queued messages for stream %s', this.queue.length, this.streamId)

            const originalQueue = this.queue
            this.queue = []

            originalQueue.forEach((msg) => this.handleMessage(msg, false))
        }
    }

    hasResendOptions() {
        return this.options.resend_from || this.options.resend_last > 0
    }

    /**
     * Resend needs can change if messages have already been received.
     * This function always returns the effective resend options:
     *
     * If messages have been received:
     * - resend_from becomes resend_from the latest received message
     * - resend_last stays the same
     */
    getEffectiveResendOptions() {
        if (this.hasReceivedMessages() && this.hasResendOptions()
            && (this.options.resend_from)) {
            const res = {
                resend_from: this.lastReceivedMsgRef, // cannot know the first missing message so there will be a duplicate received
            }
            if (this.options.resend_publisher) {
                res.resend_publisher = this.options.resend_publisher
            }
            return res
        }

        // Pick resend options from the options
        const result = {}
        Object.keys(this.options).forEach((key) => {
            if (key.startsWith('resend_')) {
                result[key] = this.options[key]
            }
        })
        return result
    }

    hasReceivedMessages() {
        return this.lastReceivedMsgRef != null
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
        return this.resending
    }

    setResending(resending) {
        debug(`Subscription: Stream ${this.streamId} resending: ${resending}`)
        this.resending = resending
    }

    handleError(err) {
        /**
         * If parsing the (expected) message failed, we should still mark it as received. Otherwise the
         * gap detection will think a message was lost, and re-request the failing message.
         */
        if (err instanceof Errors.InvalidJsonError && !this.checkForGap(err.streamMessage.prevMsgRef)) {
            this.lastReceivedMsgRef = new MessageLayer.MessageRef(err.streamMessage.timestamp, err.streamMessage.sequenceNumber)
        }
        this.emit('error', err)
    }

    static compareMessageRefs(messageRef1, messageRef2) {
        if (messageRef1.timestamp < messageRef2.timestamp) {
            return -1
        } else if (messageRef1.timestamp > messageRef2.timestamp) {
            return 1
        }
        if (messageRef1.sequenceNumber < messageRef2.sequenceNumber) {
            return -1
        } else if (messageRef1.sequenceNumber > messageRef2.sequenceNumber) {
            return 1
        }
        return 0
    }
}
