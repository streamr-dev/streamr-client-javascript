import EventEmitter from 'eventemitter3'
import debug from 'debug'

import {isByeMessage} from './Protocol'

let subId = 0
function generateSubscriptionId() {
    let id = subId++
    return id.toString()
}

export default class Subscription extends EventEmitter {

    constructor(streamId, streamPartition, authKey, callback, options) {
        super()

        if (!streamId) {
            throw 'No stream id given!'
        }
        if (!callback) {
            throw 'No callback given!'
        }

        this.id = generateSubscriptionId()
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.authKey = authKey
        this.callback = callback
        this.options = options || {}
        this.queue = []
        this.subscribing = false
        this.subscribed = false
        this.lastReceivedOffset = null

        // Check that multiple resend options are not given
        let resendOptionCount = 0
        if (this.options.resend_all) {
            resendOptionCount++
        }
        if (this.options.resend_from != null) {
            resendOptionCount++
        }
        if (this.options.resend_last != null) {
            resendOptionCount++
        }
        if (this.options.resend_from_time != null) {
            resendOptionCount++
        }
        if (resendOptionCount > 1) {
            throw 'Multiple resend options active! Please use only one: ' + JSON.stringify(options)
        }

        // Automatically convert Date objects to numbers for resend_from_time
        if (this.options.resend_from_time != null
            && typeof this.options.resend_from_time !== 'number') {

            if (typeof this.options.resend_from_time.getTime === 'function') {
                this.options.resend_from_time = this.options.resend_from_time.getTime()
            } else {
                throw 'resend_from_time option must be a Date object or a number representing time!'
            }
        }

        /*** Message handlers ***/

        this.on('subscribed', () => {
            debug('Sub %s subscribed to stream: %s', this.id, this.streamId)
            this.subscribed = true
            this.subscribing = false
        })

        this.on('unsubscribed', () => {
            debug('Sub %s unsubscribed: %s', this.id, this.streamId)
            this.subscribed = false
            this.subscribing = false
            this.unsubscribing = false
            this.resending = false
        })

        this.on('resending', (response) => {
            debug('Sub %s resending: %o', this.id, response)
            // this.resending = true was set elsewhere before making the request
        })

        this.on('no_resend', (response) => {
            debug('Sub %s no_resend: %o', this.id, response)
            this.resending = false
            this.checkQueue()
        })

        this.on('resent', (response) => {
            debug('Sub %s resent: %o', this.id, response)
            this.resending = false
            this.checkQueue()
        })

        this.on('connected', () => {

        })

        this.on('disconnected', () => {
            this.subscribed = false
            this.subscribing = false
            this.resending = false
        })
    }

    handleMessage(msg, isResend) {
        let content = msg.content
        let offset = msg.offset
        let previousOffset = msg.previousOffset

        if (previousOffset == null) {
            debug('handleMessage: prevOffset is null, gap detection is impossible! message: %o', msg)
        }

        // TODO: check this.options.resend_last ?
        // If resending, queue broadcasted messages
        if (this.resending && !isResend) {
            this.queue.push(msg)
        } else {
            // Gap check
            if (previousOffset != null && 					// previousOffset is required to check for gaps
                this.lastReceivedOffset != null &&  		// and we need to know what msg was the previous one
                previousOffset > this.lastReceivedOffset &&	// previous message had larger offset than our previous msg => gap!
                !this.resending) {

                // Queue the message to be processed after resend
                this.queue.push(msg)

                let from = this.lastReceivedOffset + 1
                let to = previousOffset
                debug('Gap detected, requesting resend for stream %s from %d to %d', this.streamId, from, to)
                this.emit('gap', from, to)
            } else if (this.lastReceivedOffset != null && offset <= this.lastReceivedOffset) {
                // Prevent double-processing of messages for any reason
                debug('Sub %s already received message: %d, lastReceivedOffset: %d. Ignoring message.', this.id, offset, this.lastReceivedOffset)
            } else {
                // Normal case where prevOffset == null || lastReceivedOffset == null || prevOffset === lastReceivedOffset
                this.lastReceivedOffset = offset
                this.callback(content, msg)
                if (isByeMessage(content)) {
                    this.emit('done')
                }
            }
        }
    }

    checkQueue() {
        if (this.queue.length) {
            debug('Attempting to process %d queued messages for stream %s', this.queue.length, this.streamId)

            let i
            let length = this.queue.length

            let originalQueue = this.queue
            this.queue = []

            for (i = 0; i < length; i++) {
                let msg = originalQueue[i]
                this.handleMessage(msg, false)
            }
        }
    }

    hasResendOptions() {
        return this.options.resend_all === true || this.options.resend_from >= 0 || this.options.resend_from_time >= 0 || this.options.resend_last > 0
    }

    /**
     * Resend needs can change if messages have already been received.
     * This function always returns the effective resend options:
     *
     * If messages have been received:
     * - resend_all becomes resend_from
     * - resend_from becomes resend_from the latest received message
     * - resend_from_time becomes resend_from the latest received message
     * - resend_last stays the same
     */
    getEffectiveResendOptions() {
        if (this.hasReceivedMessages() && this.hasResendOptions()) {
            if (this.options.resend_all || this.options.resend_from || this.options.resend_from_time) {
                return {
                    resend_from: this.lastReceivedOffset + 1
                }
            } else if (this.options.resend_last) {
                return this.options
            }
        } else {
            return this.options
        }
    }

    hasReceivedMessages() {
        return this.lastReceivedOffset != null
    }

    isSubscribed() {
        return this.subscribed
    }
}
