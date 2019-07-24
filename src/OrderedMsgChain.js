import debugFactory from 'debug'
import Heap from 'heap'
import { Errors, MessageLayer } from 'streamr-client-protocol'

const debug = debugFactory('StreamrClient::OrderedMsgChain')
const { MessageRef } = MessageLayer

const DEFAULT_GAPFILL_TIMEOUT = 5000
const MAX_GAP_REQUESTS = 10

export default class OrderedMsgChain {
    constructor(publisherId, msgChainId, inOrderHandler, gapHandler, gapFillTimeout = DEFAULT_GAPFILL_TIMEOUT) {
        this.publisherId = publisherId
        this.msgChainId = msgChainId
        this.inOrderHandler = inOrderHandler
        this.gapHandler = gapHandler
        this.lastReceivedMsgRef = null
        this.gapFillTimeout = gapFillTimeout
        this.queue = new Heap((msg1, msg2) => {
            return msg1.getMessageRef().compareTo(msg2.getMessageRef())
        })
    }

    add(unorderedStreamMessage) {
        const msgRef = unorderedStreamMessage.getMessageRef()
        if (this.lastReceivedMsgRef && msgRef.compareTo(this.lastReceivedMsgRef) < 0) {
            // Prevent double-processing of messages for any reason
            debug('Already received message: %o, lastReceivedMsgRef: %d. Ignoring message.', msgRef, this.lastReceivedMsgRef)
        }

        if (this._isNextMessage(unorderedStreamMessage)) {
            this._process(unorderedStreamMessage)
        } else {
            if (!this.gap) {
                this._scheduleGap()
            }
            this._insertInOrderedQueue(unorderedStreamMessage)
        }
    }

    addError(err) {
        if (err.streamMessage) {
            if (err instanceof Errors.InvalidJsonError && this._isNextMessage(err.streamMessage)) {
                this.lastReceivedMsgRef = err.streamMessage.getMessageRef()
            }
        }
    }

    clearGap() {
        clearInterval(this.gap)
        this.gap = undefined
    }

    _isNextMessage(unorderedStreamMessage) {
        const isFirstMessage = this.lastReceivedMsgRef === null && unorderedStreamMessage.prevMsgRef == null
        return isFirstMessage
            || (this.lastReceivedMsgRef !== null
                && unorderedStreamMessage.prevMsgRef !== null
                && unorderedStreamMessage.prevMsgRef.compareTo(this.lastReceivedMsgRef) === 0)
    }

    _insertInOrderedQueue(unorderedStreamMessage) {
        this.queue.push(unorderedStreamMessage)
    }

    _getTopMsgInQueue() {
        return this.queue.peek()
    }

    _popQueue() {
        return this.queue.pop()
    }

    _checkQueue() {
        const msg = this._getTopMsgInQueue()
        if (msg && this._isNextMessage(msg)) {
            this._popQueue()
            this.clearGap()
            this._process(msg)
        }
    }

    _process(msg) {
        this.lastReceivedMsgRef = msg.getMessageRef()
        this.inOrderHandler(msg)
        this._checkQueue()
    }

    _scheduleGap() {
        this.gapRequestCount = 0
        this.gap = setInterval(() => {
            const from = this.lastReceivedMsgRef == null ? this._getTopMsgInQueue().prevMsgRef
                : new MessageRef(this.lastReceivedMsgRef.timestamp, this.lastReceivedMsgRef.sequenceNumber + 1)
            const to = this._getTopMsgInQueue().prevMsgRef
            if (this.gapRequestCount < MAX_GAP_REQUESTS) {
                this.gapRequestCount += 1
                this.gapHandler(from, to, this.publisherId, this.msgChainId)
            } else {
                this.clearGap()
                throw new Error(
                    `Failed to fill gap between ${from.serialize()} and ${to.serialize()}`
                    + ` for ${this.publisherId}-${this.msgChainId} after ${MAX_GAP_REQUESTS} trials`
                )
            }
        }, this.gapFillTimeout)
    }
}
OrderedMsgChain.MAX_GAP_REQUESTS = MAX_GAP_REQUESTS
