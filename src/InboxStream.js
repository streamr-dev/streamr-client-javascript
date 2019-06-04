import debugFactory from 'debug'
import { MessageLayer } from 'streamr-client-protocol'

const debug = debugFactory('InboxStream')
const { StreamMessage } = MessageLayer
const SUBSCRIBERS_EXPIRATION_TIME = 5 * 60 * 1000 // 5 minutes
export default class InboxStream {
    constructor(client) {
        this._client = client
        this._client.getPublisherId().then((ethAddress) => this._client.subscribe(ethAddress, async (parsedContent, streamMessage) => {
            if (streamMessage.contentType === StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST) {
                const groupKey = this._client.options.publisherGroupKeys[parsedContent.streamId]
                const subscriberId = streamMessage.getPublisherId()
                const valid = await this.isValidSubscriber(parsedContent.streamId, subscriberId)
                if (!valid) {
                    debug('WARN: Received group key request for stream %s from invalid address %s', parsedContent.streamId, subscriberId)
                }
                if (groupKey && valid) {
                    if (!this._client.encryptionUtil) {
                        throw new Error('Cannot handle group key requests without setting the "keyExchange" options in the constructor.')
                    }
                    const encryptedGroupKey = this._client.encryptionUtil.encryptWithPublicKey(groupKey, true)
                    this._client.publishStreamMessage(this._client.msgCreationUtil.createGroupKeyResponse(subscriberId, encryptedGroupKey, 0))
                }
            }
        }))
    }

    getSubscribers(streamId) {
        if (!this.publishersPromise || (Date.now() - this.lastAccess) > SUBSCRIBERS_EXPIRATION_TIME) {
            this.publishersPromise = this._client.getStreamSubscribers(streamId)
            this.lastAccess = Date.now()
        }
        return this.publishersPromise
    }

    async isValidSubscriber(streamId, ethAddress) {
        let validSubscribers = new Set(await this.getSubscribers(streamId))
        // if the address belongs to the cached set it's considered valid even if
        // it might have been unsubscribed. It won't be considered valid once the cached set expires.
        if (validSubscribers.has(ethAddress.toLowerCase())) {
            return true
        }
        // if the address is not in the cached set, it might be a new subscriber
        // who asks for the group key milliseconds after being subscribed. So we
        // evict the cache and fetch the latest set in order to not reject a valid subscriber
        this.publishersPromise = undefined
        validSubscribers = new Set(await this.getSubscribers(streamId))
        return validSubscribers.has(ethAddress.toLowerCase())
    }
}
