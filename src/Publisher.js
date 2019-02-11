import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import sha256 from 'js-sha256'
import debugFactory from 'debug'
import Stream from './rest/domain/Stream'
import FailedToPublishError from './errors/FailedToPublishError'

const murmur = require('murmurhash-native').murmurHash
const Web3 = require('web3')

const debug = debugFactory('StreamrClient')
const { StreamMessage } = MessageLayer
const web3 = new Web3()

export default class Publisher {
    constructor(client) {
        this._client = client
        this.auth = this._client.options.auth
        this.publishQueue = []
        this.publishedStreams = {}
    }

    async getPublisherId() {
        if (!this.publisherId) {
            if (this.auth.privateKey !== undefined) {
                this.publisherId = web3.eth.accounts.privateKeyToAccount(this.auth.privateKey).address
            } else if (this.auth.provider !== undefined) {
                const w3 = new Web3(this.auth.provider)
                const accounts = await w3.eth.getAccounts()
                /* eslint-disable prefer-destructuring */
                this.publisherId = accounts[0]
            } else if (this.auth.apiKey !== undefined) {
                this.publisherId = sha256(await this.getUsername())
            } else if (this.auth.username !== undefined) {
                this.publisherId = sha256(this.auth.username)
            } else if (this.auth.sessionToken !== undefined) {
                this.publisherId = sha256(await this.getUsername())
            } else {
                throw new Error('Need either "privateKey", "provider", "apiKey", "username"+"password" or "sessionToken" to derive the publisher Id.')
            }
        }
        return this.publisherId
    }

    async getUsername() {
        const userInfo = await this._client.getUserInfo()
        return userInfo.username
    }

    getNextSequenceNumber(key, timestamp) {
        if (timestamp !== this.getPrevTimestamp(key)) {
            return 0
        }
        return this.getPrevSequenceNumber(key) + 1
    }

    async publish(streamObjectOrId, data, timestamp = Date.now(), partitionKey = null) {
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

        // Validate data
        if (typeof data !== 'object') {
            throw new Error(`Message data must be an object! Was: ${data}`)
        }

        // If connected, emit a publish request
        if (this._client.isConnected()) {
            const stream = await this._client.getStream(streamId)
            const streamPartition = Publisher.computeStreamPartition(stream.partitions, partitionKey)
            const publisherId = await this.getPublisherId()

            const key = streamId + streamPartition
            if (!this.publishedStreams[key]) {
                this.publishedStreams[key] = {
                    prevTimestamp: null,
                    prevSequenceNumber: 0,
                }
            }

            const sequenceNumber = this.getNextSequenceNumber(key, timestamp)
            const streamMessage = StreamMessage.create(
                [streamId, streamPartition, timestamp, sequenceNumber, publisherId], this.getPrevMsgRef(key),
                StreamMessage.CONTENT_TYPES.JSON, data, StreamMessage.SIGNATURE_TYPES.NONE, null,
            )
            this.publishedStreams[key].prevTimestamp = timestamp
            this.publishedStreams[key].prevSequenceNumber = sequenceNumber
            if (this._client.signer) {
                await this._client.signer.signStreamMessage(streamMessage)
            }
            return this._requestPublish(streamMessage, sessionToken)
        } else if (this._client.options.autoConnect) {
            this.publishQueue.push([streamId, data, timestamp, partitionKey])
            return this._client.connect().catch(() => {}) // ignore
        }
        throw new FailedToPublishError(
            streamId,
            data,
            'Wait for the "connected" event before calling publish, or set autoConnect to true!',
        )
    }

    getPrevMsgRef(key) {
        const prevTimestamp = this.getPrevTimestamp(key)
        if (!prevTimestamp) {
            return null
        }
        const prevSequenceNumber = this.getPrevSequenceNumber(key)
        return [prevTimestamp, prevSequenceNumber]
    }

    getPrevTimestamp(key) {
        return this.publishedStreams[key].prevTimestamp
    }

    getPrevSequenceNumber(key) {
        return this.publishedStreams[key].prevSequenceNumber
    }

    async sendPendingPublishRequests() {
        const publishQueueCopy = this.publishQueue.slice(0)
        this.publishQueue = []
        const promises = []
        publishQueueCopy.forEach((args) => {
            promises.push(this.publish(...args))
        })
        return Promise.all(promises)
    }

    static computeStreamPartition(partitionCount, partitionKey) {
        if (!partitionCount) {
            throw new Error('partitionCount is falsey!')
        } else if (partitionCount === 1) {
            // Fast common case
            return 0
        } else if (partitionKey) {
            const bytes = Buffer.from(partitionKey, 'utf8')
            const resultBytes = murmur(bytes, 0, 'buffer')
            const intHash = resultBytes.readInt32LE()
            return Math.abs(intHash) % partitionCount
        } else {
            // Fallback to random partition if no key
            return Math.floor(Math.random() * partitionCount)
        }
    }

    _requestPublish(streamMessage, sessionToken) {
        const request = ControlLayer.PublishRequest.create(streamMessage, sessionToken)
        debug('_requestResend: %o', request)
        return this._client.connection.send(request)
    }
}
