import debugFactory from 'debug'

import OrderedMsgChain from './OrderedMsgChain'

const debug = debugFactory('StreamrClient::OrderingUtil')

export default class OrderingUtil {
    constructor(streamId, streamPartition, inOrderHandler, gapHandler, gapFillTimeout) {
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.inOrderHandler = inOrderHandler
        this.gapHandler = gapHandler
        this.gapFillTimeout = gapFillTimeout
        this.queue = []
        this.lastReceivedMsgRef = {}
        this.gaps = {}
        this.orderedChains = {}
    }

    /*
    async add(unorderedStreamMessage) {
        const key = unorderedStreamMessage.getPublisherId() + unorderedStreamMessage.getMsgChainId()
        if (!this._checkForGap(unorderedStreamMessage.prevMsgRef, key)) { // if it is the next message, process it
            this._processMsg(key, unorderedStreamMessage)
            await this._checkQueue()
        } else {
            if (!this.gaps[key]) { // send a gap fill request only if there is not one already in progress
                this._scheduleGapFillRequests(key, unorderedStreamMessage)
            }
            this.queue.push(unorderedStreamMessage)
        }
    } */

    add(unorderedStreamMessage) {
        const chain = this._getChain(unorderedStreamMessage.getPublisherId(), unorderedStreamMessage.getMsgChainId())
        chain.add(unorderedStreamMessage)
    }

    _getChain(publisherId, msgChainId) {
        const key = publisherId + msgChainId
        if (!this.orderedChains[key]) {
            this.orderedChains[key] = new OrderedMsgChain(publisherId, msgChainId, this.inOrderHandler, this.gapHandler, this.gapFillTimeout)
        }
        return this.orderedChains[key]
    }

    _processMsg(key, unorderedStreamMessage) {
        const messageRef = unorderedStreamMessage.getMessageRef()
        let res
        if (this.lastReceivedMsgRef[key] !== undefined) {
            res = messageRef.compareTo(this.lastReceivedMsgRef[key])
        }

        if (res <= 0) {
            // Prevent double-processing of messages for any reason
            debug('Already received message: %o, lastReceivedMsgRef: %d. Ignoring message.', messageRef, this.lastReceivedMsgRef[key])
        } else {
            // Normal case where prevMsgRef == null || lastReceivedMsgRef == null || prevMsgRef === lastReceivedMsgRef
            this.lastReceivedMsgRef[key] = messageRef
            this.inOrderHandler(unorderedStreamMessage)
        }
    }

    _scheduleGapFillRequests(key, unorderedStreamMessage) {
        setTimeout(() => {
            // if there is still a gap after 'firstGapTimeout', a gap fill request is sent
            if (this._checkForGap(unorderedStreamMessage.prevMsgRef, key)) {
                const from = this.lastReceivedMsgRef[key]
                const fromObject = {
                    timestamp: from.timestamp,
                    sequenceNumber: from.sequenceNumber,
                }
                const to = unorderedStreamMessage.prevMsgRef
                const toObject = {
                    timestamp: to.timestamp,
                    sequenceNumber: to.sequenceNumber,
                }

                // If for some reason the missing messages are not received, the gap filling request is resent every 'gapFillTimeout' seconds
                // until a message is received, at which point the gap will be filled or
                // a new different gap request will be sent and resent every 'gapFillTimeout' seconds.
                clearInterval(this.gaps[key])
                this.gaps[key] = setInterval(() => {
                    if (this.lastReceivedMsgRef[key].compareTo(to) === -1) {
                        this.gapHandler(
                            fromObject, toObject,
                            unorderedStreamMessage.getPublisherId(), unorderedStreamMessage.getMsgChainId(),
                        )
                    } else {
                        clearInterval(this.gaps[key])
                    }
                }, this.gapFillTimeout)

                debug('Gap detected, requesting resend for stream %s from %o to %o', this.streamId, from, to)
                this.gapHandler(fromObject, toObject, unorderedStreamMessage.getPublisherId(), unorderedStreamMessage.getMsgChainId())
            }
        }, this.firstGapTimeout || 0)
    }

    addError(err) {
        if (err.streamMessage) {
            const chain = this._getChain(err.streamMessage.getPublisherId(), err.streamMessage.getMsgChainId())
            chain.addError(err)
        }
    }

    /**
     * Gap check: If the msg contains the previousMsgRef, and we know the lastReceivedMsgRef,
     * and the previousMsgRef is larger than what has been received, we have a gap!
     */
    _checkForGap(previousMsgRef, key) {
        return previousMsgRef != null
            && this.lastReceivedMsgRef[key] !== undefined
            && previousMsgRef.compareTo(this.lastReceivedMsgRef[key]) === 1
    }

    async _checkQueue() {
        if (this.queue.length) {
            debug('Attempting to process %d queued messages for stream %s', this.queue.length, this.streamId)

            const originalQueue = this.queue
            this.queue = []

            const promises = originalQueue.map((msg) => this.add(msg))
            await Promise.all(promises)
        }
    }

    clearGaps() {
        Object.keys(this.orderedChains).forEach((key) => {
            this.orderedChains[key].clearGap()
        })
    }
}
