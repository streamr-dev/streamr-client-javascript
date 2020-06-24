import { Utils } from 'streamr-client-protocol'
import memoize from 'promise-memoize'

import Signer from './Signer'

const { StreamMessageValidator } = Utils

const memoizeOpts = {
    maxAge: 15 * 60 * 1000,
    maxErrorAge: 60 * 1000,
}

export default class SubscribedStreamPartition {
    constructor(client, streamId, streamPartition) {
        this._client = client
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.subscriptions = {}
        this.getStream = memoize(this.getStream.bind(this), memoizeOpts)
        this.validator = new StreamMessageValidator({
            getStream: this.getStream.bind(this),
            isPublisher: async (publisherId, _streamId) => (
                this._client.isStreamPublisher(_streamId, publisherId)
            ),
            isSubscriber: async (ethAddress, _streamId) => (
                this._client.isStreamSubscriber(_streamId, ethAddress)
            ),
        })
        this.getPublishers = memoize(this.getPublishers.bind(this), memoizeOpts)
        this.getSubscribers = memoize(this.getSubscribers.bind(this), memoizeOpts)
        this.isValidPublisher = memoize(this.isValidPublisher.bind(this), memoizeOpts)
        this.isValidSubscriber = memoize(this.isValidSubscriber.bind(this), memoizeOpts)
    }

    async getPublishers() {
        const publishers = await this._client.getStreamPublishers(this.streamId)
        return publishers.reduce((obj, key) => (
            Object.assign(obj, {
                [key]: true
            })
        ), {})
    }

    async getSubscribers() {
        const subscribers = await this._client.getStreamSubscribers(this.streamId)
        return subscribers.reduce((obj, key) => (
            Object.assign(obj, {
                [key]: true
            })
        ), {})
    }

    async isValidPublisher(publisherId) {
        return this._client.isStreamPublisher(this.streamId, publisherId)
    }

    async isValidSubscriber(ethAddress) {
        return this._client.isStreamSubscriber(this.streamId, ethAddress)
    }

    async _verifyStreamMessage(msg) {
        try {
            await this.validator.validate(msg)
        } catch (err) {
            // store error for possible introspection later
            // doesn't ever clear value because can't be async safe without complication
            this.lastValidationError = err
            return false
        }
        return true
    }

    async verifyStreamMessage(msg) {
        if (this._client.options.verifySignatures === 'never') {
            return true
        }

        if (this._client.options.verifySignatures === 'always') {
            if (msg.signatureType && msg.signatureType !== 0 && msg.signature) {
                return this._verifyStreamMessage(msg)
            }
            return false
        }

        if (this._client.options.verifySignatures === 'auto') {
            if (msg.signatureType && msg.signatureType !== 0 && msg.signature) { // always verify in case the message is signed
                return this._verifyStreamMessage(msg)
            }
        }

        return !(await this.getVerifySignatures())
    }

    async getStream() {
        return this._client.getStream(this.streamId)
    }

    async getVerifySignatures() {
        if (this.requireSignedData === undefined) {
            // use cached validator.getStream
            const stream = await this.validator.getStream(this.streamId)
            this.requireSignedData = stream.requireSignedData
        }
        return this.requireSignedData
    }

    getSubscription(requestId) {
        return this.subscriptions[requestId]
    }

    getSubscriptions() {
        return Object.values(this.subscriptions) || []
    }

    isSubscribing() {
        return this.subscribing
    }

    setSubscribing(value) {
        this.subscribing = value
    }

    emptySubscriptionsSet() {
        return Object.keys(this.subscriptions).length === 0
    }

    addSubscription(sub) {
        this.subscriptions[sub.id] = sub
    }

    removeSubscription(sub) {
        if (this.subscriptions[sub.id]) {
            this.subscriptions[sub.id].stop()
            delete this.subscriptions[sub.id]
        }
    }

    setSubscriptionsGroupKeys(publisherId, groupKeys) {
        Object.values(this.subscriptions).forEach((sub) => {
            sub.setGroupKeys(publisherId, groupKeys)
        })
    }
}

SubscribedStreamPartition.memoizeOpts = memoizeOpts
