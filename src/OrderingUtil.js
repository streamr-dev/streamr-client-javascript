import debugFactory from 'debug'
import { Errors } from 'streamr-client-protocol'

const debug = debugFactory('StreamrClient::OrderingUtil')

export default class OrderingUtil {
    constructor(streamId, streamPartition, inOrderHandler, gapHandler, options) {
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.inOrderHandler = inOrderHandler
        this.gapHandler = gapHandler
        this.options = options || {}
        this.queue = []
        this.resending = false
        this.lastReceivedMsgRef = {}
        this.gaps = {}
    }

    add(unorderedStreamMessage, isResend = false) {
        const key = unorderedStreamMessage.getPublisherId() + unorderedStreamMessage.messageId.msgChainId

        if (this.resending && !isResend) {
            this.queue.push(unorderedStreamMessage)
        } else if (this.checkForGap(unorderedStreamMessage.prevMsgRef, key) && !this.resending) {
            setTimeout(() => {
                // if there is still a gap after 'firstGapTimeout', a gap fill request is sent
                if (this.checkForGap(unorderedStreamMessage.prevMsgRef, key) && !this.resending) {
                    // Queue the message to be processed after resend
                    this.queue.push(unorderedStreamMessage)

                    const from = this.lastReceivedMsgRef[key] // cannot know the first missing message so there will be a duplicate received
                    const fromObject = {
                        timestamp: from.timestamp,
                        sequenceNumber: from.sequenceNumber,
                    }
                    const to = unorderedStreamMessage.prevMsgRef
                    const toObject = {
                        timestamp: to.timestamp,
                        sequenceNumber: to.sequenceNumber,
                    }
                    debug('Gap detected, requesting resend for stream %s from %o to %o', this.streamId, from, to)
                    this.gapHandler(fromObject, toObject, unorderedStreamMessage.getPublisherId(), unorderedStreamMessage.messageId.msgChainId)

                    // If for some reason the missing messages are not received, the gap filling request is resent every 'gapFillTimeout' seconds
                    // until a message is received, at which point the gap will be filled or
                    // a new different gap request will be sent and resent every 'gapFillTimeout' seconds.
                    clearInterval(this.gaps[key])
                    this.gaps[key] = setInterval(() => {
                        if (this.lastReceivedMsgRef[key].compareTo(to) === -1) {
                            this.gapHandler(
                                fromObject, toObject,
                                unorderedStreamMessage.getPublisherId(), unorderedStreamMessage.messageId.msgChainId,
                            )
                        } else {
                            clearInterval(this.gaps[key])
                        }
                    }, this.options.gapFillTimeout)
                }
            }, this.options.firstGapTimeout || 0)
        } else {
            const messageRef = unorderedStreamMessage.getMessageRef()
            let res
            if (this.lastReceivedMsgRef[key] !== undefined) {
                res = messageRef.compareTo(this.lastReceivedMsgRef[key])
            }
            if (res <= 0) {
                // Prevent double-processing of messages for any reason
                debug(
                    'Sub %s already received message: %o, lastReceivedMsgRef: %d. Ignoring message.', this.id, messageRef,
                    this.lastReceivedMsgRef[key],
                )
            } else {
                // Normal case where prevMsgRef == null || lastReceivedMsgRef == null || prevMsgRef === lastReceivedMsgRef
                this.lastReceivedMsgRef[key] = messageRef
                this.inOrderHandler(unorderedStreamMessage)
            }
        }
    }

    addError(err) {
        let key
        if (err.streamMessage) {
            key = err.streamMessage.getPublisherId() + err.streamMessage.messageId.msgChainId
        }
        if (err instanceof Errors.InvalidJsonError && !this.checkForGap(err.streamMessage.prevMsgRef, key)) {
            this.lastReceivedMsgRef[key] = err.streamMessage.getMessageRef()
        }
    }

    /**
     * Gap check: If the msg contains the previousMsgRef, and we know the lastReceivedMsgRef,
     * and the previousMsgRef is larger than what has been received, we have a gap!
     */
    checkForGap(previousMsgRef, key) {
        return previousMsgRef != null &&
            this.lastReceivedMsgRef[key] !== undefined &&
            previousMsgRef.compareTo(this.lastReceivedMsgRef[key]) === 1
    }

    async checkQueue() {
        if (this.queue.length) {
            debug('Attempting to process %d queued messages for stream %s', this.queue.length, this.streamId)

            const originalQueue = this.queue
            this.queue = []

            // Queued messages are already verified, so pass true as the verificationPromise
            const promises = originalQueue.map((msg) => this.add(msg, false))
            await Promise.all(promises)
        }
    }

    clearGaps() {
        Object.keys(this.gaps).forEach((key) => {
            clearInterval(this.gaps[key])
            delete this.gaps[key]
        })
    }
}
