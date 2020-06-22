import debugFactory from 'debug'

import EncryptionUtil from './EncryptionUtil'
import InvalidGroupKeyRequestError from './errors/InvalidGroupKeyRequestError'
import InvalidGroupKeyResponseError from './errors/InvalidGroupKeyResponseError'
import InvalidGroupKeyError from './errors/InvalidGroupKeyError'

const debug = debugFactory('KeyExchangeUtil')
const SUBSCRIBERS_EXPIRATION_TIME = 5 * 60 * 1000 // 5 minutes
export default class KeyExchangeUtil {
    static getKeyExchangeStreamId(publisherId) {
        if (!publisherId || typeof publisherId !== 'string') { throw new Error(`non-empty publisherId string required: ${publisherId}`) }
        return `SYSTEM/keyexchange/${publisherId.toLowerCase()}`
    }

    constructor(client) {
        this._client = client
        this.isSubscriberPromises = {}
    }

    async handleGroupKeyRequest(streamMessage) {
        // if it was signed, the StreamrClient already checked the signature. If not, StreamrClient accepted it since the stream
        // does not require signed data for all types of messages.
        if (!streamMessage.signature) {
            throw new InvalidGroupKeyRequestError('Received unsigned group key request (the public key must be signed to avoid MitM attacks).')
        }
        // No need to check if parsedContent contains the necessary fields because it was already checked during deserialization
        const { streamId, range, requestId, publicKey } = streamMessage.getParsedContent()
        let keys = []
        if (range) {
            keys = this._client.keyStorageUtil.getKeysBetween(streamId, range.start, range.end)
        } else {
            const groupKeyObj = this._client.keyStorageUtil.getLatestKey(streamId, true)
            if (groupKeyObj) {
                keys.push(groupKeyObj)
            }
        }

        if (keys.length === 0) {
            throw new InvalidGroupKeyRequestError(`Received group key request for stream '${streamId}' but no group key is set`)
        }
        const subscriberId = streamMessage.getPublisherId()
        const valid = await this.isValidSubscriber(streamId, subscriberId)
        if (!valid) {
            throw new InvalidGroupKeyRequestError(
                `Received group key request for stream '${streamId}' from invalid address '${subscriberId}'`
            )
        }

        const encryptedGroupKeys = []
        keys.forEach((keyObj) => {
            const encryptedGroupKey = EncryptionUtil.encryptWithPublicKey(keyObj.groupKey, publicKey, true)
            encryptedGroupKeys.push({
                groupKey: encryptedGroupKey,
                start: keyObj.start,
            })
        })
        const response = await this._client.msgCreationUtil.createGroupKeyResponse({
            subscriberAddress: subscriberId,
            streamId,
            encryptedGroupKeys,
            requestId,
        })
        return this._client.publishStreamMessage(response)
    }

    handleGroupKeyResponse(streamMessage) {
        // if it was signed, the StreamrClient already checked the signature. If not, StreamrClient accepted it since the stream
        // does not require signed data for all types of messages.
        if (!streamMessage.signature) {
            throw new InvalidGroupKeyResponseError('Received unsigned group key response (it must be signed to avoid MitM attacks).')
        }
        // No need to check if parsedContent contains the necessary fields because it was already checked during deserialization
        const parsedContent = streamMessage.getParsedContent()
        // TODO: fix this hack in other PR
        if (!this._client.subscribedStreamPartitions[parsedContent.streamId + '0']) {
            throw new InvalidGroupKeyResponseError('Received group key response for a stream to which the client is not subscribed.')
        }

        if (!this._client.encryptionUtil) {
            throw new InvalidGroupKeyResponseError('Cannot decrypt group key response without the private key.')
        }
        const decryptedGroupKeys = []
        parsedContent.keys.forEach((encryptedGroupKeyObj) => {
            const groupKey = this._client.encryptionUtil.decryptWithPrivateKey(encryptedGroupKeyObj.groupKey, true)
            try {
                EncryptionUtil.validateGroupKey(groupKey)
            } catch (err) {
                if (err instanceof InvalidGroupKeyError) {
                    throw new InvalidGroupKeyResponseError(err.message)
                } else {
                    throw err
                }
            }
            decryptedGroupKeys.push({
                groupKey,
                start: encryptedGroupKeyObj.start
            })
        })
        /* eslint-disable no-underscore-dangle */
        this._client._setGroupKeys(parsedContent.streamId, streamMessage.getPublisherId(), decryptedGroupKeys)
        /* eslint-enable no-underscore-dangle */
        debug('INFO: Updated group key for stream "%s" and publisher "%s"', parsedContent.streamId, streamMessage.getPublisherId())
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
