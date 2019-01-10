import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import debugFactory from 'debug'
import Stream from './rest/domain/Stream'
import FailedToPublishError from './errors/FailedToPublishError'

const debug = debugFactory('StreamrClient')

export default class Publisher {
    constructor(client, publisherId) {
        this._client = client
        this.publishQueue = []
        this.publishedStreams = {}
        this.publisherId = this._client.signer ? this._client.signer.address : publisherId
    }

    getNextSequenceNumber(streamId, timestamp) {
        if (timestamp !== this.getPrevTimestamp(streamId)) {
            return 0
        }
        return this.getPrevSequenceNumber(streamId) + 1
    }

    async publish(streamObjectOrId, data, timestamp = Date.now()) {
        const sessionToken = await this._client.session.getSessionToken()
        // Validate streamObjectOrId
        let streamId
        if (streamObjectOrId instanceof Stream) {
            streamId = streamObjectOrId.id
        } else if (typeof streamObjectOrId === 'string') {
            streamId = streamObjectOrId
        } else {
            throw new Error(`First argument must be a Stream object or the stream id! Was: ${streamObjectOrId}`)
        }

        if (!this.publishedStreams[streamId]) {
            this.publishedStreams[streamId] = {
                prevTimestamp: null,
                prevSequenceNumber: 0,
            }
        }

        // Validate data
        if (typeof data !== 'object') {
            throw new Error(`Message data must be an object! Was: ${data}`)
        }

        // If connected, emit a publish request
        if (this._client.isConnected()) {
            const sequenceNumber = this.getNextSequenceNumber(streamId, timestamp)
            const streamMessage = new MessageLayer.StreamMessageV30(
                [streamId, 0, timestamp, sequenceNumber, this.publisherId],
                [this.getPrevTimestamp(streamId), this.getPrevSequenceNumber(streamId)], 0,
                MessageLayer.StreamMessage.CONTENT_TYPES.JSON, data, MessageLayer.StreamMessage.SIGNATURE_TYPES.NONE,
            )
            this.publishedStreams[streamId].prevTimestamp = timestamp
            this.publishedStreams[streamId].prevSequenceNumber = sequenceNumber
            if (this._client.signer) {
                await this._client.signer.signStreamMessage(streamMessage)
            }
            this._requestPublish(streamMessage, sessionToken)
        } else if (this._client.options.autoConnect) {
            this.publishQueue.push([streamId, data, timestamp])
            this._client.connect().catch(() => {}) // ignore
        } else {
            throw new FailedToPublishError(
                streamId,
                data,
                'Wait for the "connected" event before calling publish, or set autoConnect to true!',
            )
        }
    }

    getPrevTimestamp(streamId) {
        return this.publishedStreams[streamId].prevTimestamp
    }

    getPrevSequenceNumber(streamId) {
        return this.publishedStreams[streamId].prevSequenceNumber
    }

    sendPendingPublishRequests() {
        const publishQueueCopy = this.publishQueue.slice(0)
        this.publishQueue = []
        publishQueueCopy.forEach((args) => {
            this.publish(...args)
        })
    }

    _requestPublish(streamMessage, sessionToken) {
        const request = new ControlLayer.PublishRequestV1(streamMessage, sessionToken)
        debug('_requestResend: %o', request)
        return this._client.connection.send(request)
    }
}
