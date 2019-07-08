import EncryptionUtil from './EncryptionUtil'

const SUBSCRIBERS_EXPIRATION_TIME = 5 * 60 * 1000 // 5 minutes
export default class KeyExchangeUtil {
    constructor(client) {
        this._client = client
        this.isSubscriberPromises = {}
    }

    async handleGroupKeyRequest(streamMessage) {
        // if it was signed, the StreamrClient already checked the signature. If not, StreamrClient accepted it since the stream
        // does not require signed data for all types of messages.
        if (!streamMessage.signature) {
            throw new Error('Received unsigned group key request (the public key must be signed to avoid MitM attacks).')
        }
        // No need to check if parsedContent contains the necessary fields because it was already checked during deserialization
        const parsedContent = streamMessage.getParsedContent()
        const groupKey = this._client.options.publisherGroupKeys[parsedContent.streamId]
        if (!groupKey) {
            throw new Error(`Received group key request for stream '${parsedContent.streamId}' but no group key is set`)
        }
        const subscriberId = streamMessage.getPublisherId()
        const valid = await this.isValidSubscriber(parsedContent.streamId, subscriberId)
        if (!valid) {
            throw new Error(`Received group key request for stream '${parsedContent.streamId}' from invalid address '${subscriberId}'`)
        }
        const encryptedGroupKey = EncryptionUtil.encryptWithPublicKey(groupKey, parsedContent.publicKey, true)
        const response = await this._client.msgCreationUtil.createGroupKeyResponse(subscriberId, parsedContent.streamId, [{
            groupKey: encryptedGroupKey,
            start: 0, // TODO: real start time
        }])
        return this._client.publishStreamMessage(response)
    }

    async getSubscribers(streamId) {
        if (!this.subscribersPromise || (Date.now() - this.lastAccess) > SUBSCRIBERS_EXPIRATION_TIME) {
            this.subscribersPromise = this._client.getStreamSubscribers(streamId).then((subscribers) => {
                const map = {}
                subscribers.forEach((s) => {
                    map[s] = true
                })
                return map
            })
            this.lastAccess = Date.now()
        }
        return this.subscribersPromise
    }

    async isSubscriber(streamId, subscriberId) {
        if (!this.isSubscriberPromises[streamId]) {
            this.isSubscriberPromises[streamId] = {}
        }
        if (!this.isSubscriberPromises[streamId][subscriberId]) {
            this.isSubscriberPromises[streamId][subscriberId] = this._client.isStreamSubscriber(streamId, subscriberId)
        }
        return this.isSubscriberPromises[streamId][subscriberId]
    }

    async isValidSubscriber(streamId, ethAddress) {
        const cache = await this.getSubscribers(streamId)
        if (cache[ethAddress]) {
            return cache[ethAddress]
        }
        const isValid = await this.isSubscriber(streamId, ethAddress)
        cache[ethAddress] = isValid
        return isValid
    }
}
KeyExchangeUtil.SUBSCRIBERS_EXPIRATION_TIME = SUBSCRIBERS_EXPIRATION_TIME
