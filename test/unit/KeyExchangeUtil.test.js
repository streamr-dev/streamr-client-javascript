import crypto from 'crypto'
import assert from 'assert'
import sinon from 'sinon'
import { MessageLayer } from 'streamr-client-protocol'
import KeyExchangeUtil from '../../src/KeyExchangeUtil'
import EncryptionUtil from '../../src/EncryptionUtil'

const { StreamMessage } = MessageLayer
const subscribers = ['0xb8CE9ab6943e0eCED004cDe8e3bBed6568B2Fa01'.toLowerCase(), 'subscriber2', 'subscriber3']
const subscribersMap = {}
subscribers.forEach((p) => {
    subscribersMap[p] = true
})

function setupClient() {
    const client = {}
    client.getStreamSubscribers = sinon.stub()
    client.getStreamSubscribers.withArgs('streamId').resolves(subscribers)
    client.isStreamSubscriber = sinon.stub()
    client.isStreamSubscriber.withArgs('streamId', 'subscriber4').resolves(true)
    client.isStreamSubscriber.withArgs('streamId', 'subscriber5').resolves(false)
    client.options = {}
    client.options.publisherGroupKeys = {
        streamId: crypto.randomBytes(32),
    }
    client.subscribedStreams = {
        streamId: {
            setSubscriptionsGroupKey: sinon.stub(),
        },
    }
    client.encryptionUtil = new EncryptionUtil()
    return client
}

describe('KeyExchangeUtil', () => {
    let client
    let util
    beforeEach(() => {
        client = setupClient()
        util = new KeyExchangeUtil(client)
    })
    describe('getSubscribers', () => {
        it('should use endpoint to retrieve subscribers', async () => {
            const retrievedSubscribers = await util.getSubscribers('streamId')
            assert(client.getStreamSubscribers.calledOnce)
            assert.deepStrictEqual(subscribersMap, retrievedSubscribers)
            assert.deepStrictEqual(await util.subscribersPromise, subscribersMap)
        })
        it('should use stored subscribers and not the endpoint', async () => {
            util.subscribersPromise = Promise.resolve(subscribersMap)
            const retrievedSubscribers = await util.getSubscribers('streamId')
            assert(client.getStreamSubscribers.notCalled)
            assert.deepStrictEqual(subscribersMap, retrievedSubscribers)
        })
        it('should call getStreamPublishers only once when multiple calls made simultaneously', () => {
            const p1 = util.getSubscribers('streamId')
            const p2 = util.getSubscribers('streamId')
            return Promise.all([p1, p2]).then(([subscribers1, subscribers2]) => {
                assert(client.getStreamSubscribers.calledOnce)
                assert.deepStrictEqual(subscribers1, subscribers2)
            })
        })
        it('should use endpoint again after the list of locally stored publishers expires', async () => {
            const clock = sinon.useFakeTimers()
            await util.getSubscribers('streamId')
            util.subscribersPromise = Promise.resolve(subscribersMap)
            await util.getSubscribers('streamId')
            clock.tick(KeyExchangeUtil.SUBSCRIBERS_EXPIRATION_TIME + 100)
            await util.getSubscribers('streamId')
            assert(client.getStreamSubscribers.calledTwice)
            clock.restore()
        })
    })
    describe('isValidSubscriber', () => {
        it('should return cache result if cache hit', async () => {
            const valid = await util.isValidSubscriber('streamId', 'subscriber2')
            assert.strictEqual(valid, true)
            assert(client.getStreamSubscribers.calledOnce)
            assert(client.isStreamSubscriber.notCalled)
        })
        it('should fetch if cache miss and store result in cache', async () => {
            const valid4 = await util.isValidSubscriber('streamId', 'subscriber4')
            assert.strictEqual(valid4, true)
            const valid5 = await util.isValidSubscriber('streamId', 'subscriber5')
            assert.strictEqual(valid5, false)
            // calling the function again should use the cache
            await util.isValidSubscriber('streamId', 'subscriber4')
            await util.isValidSubscriber('streamId', 'subscriber5')
            assert(client.getStreamSubscribers.calledOnce)
            assert(client.isStreamSubscriber.calledTwice)
        })
    })
    describe('handleGroupKeyRequest', () => {
        it('should reject unsigned request', (done) => {
            const streamMessage = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'subscriber2', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST, StreamMessage.ENCRYPTION_TYPES.NONE, {
                    streamId: 'streamId',
                    publicKey: 'rsa-public-key',
                }, StreamMessage.SIGNATURE_TYPES.NONE, null,
            )
            util.handleGroupKeyRequest(streamMessage).catch((err) => {
                assert.strictEqual(err.message, 'Received unsigned group key request (the public key must be signed to avoid MitM attacks).')
                done()
            })
        })
        it('should reject request for a stream for which the client does not have a group key', (done) => {
            const streamMessage = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'subscriber2', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST, StreamMessage.ENCRYPTION_TYPES.NONE, {
                    streamId: 'wrong-streamId',
                    publicKey: 'rsa-public-key',
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            util.handleGroupKeyRequest(streamMessage).catch((err) => {
                assert.strictEqual(err.message, 'Received group key request for stream \'wrong-streamId\' but no group key is set')
                done()
            })
        })
        it('should reject request from invalid subscriber', (done) => {
            const streamMessage = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'subscriber5', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST, StreamMessage.ENCRYPTION_TYPES.NONE, {
                    streamId: 'streamId',
                    publicKey: 'rsa-public-key',
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            util.handleGroupKeyRequest(streamMessage).catch((err) => {
                assert.strictEqual(err.message, 'Received group key request for stream \'streamId\' from invalid address \'subscriber5\'')
                done()
            })
        })
        it('should send group key response', (done) => {
            const subscriberKeyPair = new EncryptionUtil()
            const streamMessage = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'subscriber2', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST, StreamMessage.ENCRYPTION_TYPES.NONE, {
                    streamId: 'streamId',
                    publicKey: subscriberKeyPair.getPublicKey(),
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            client.msgCreationUtil = {
                createGroupKeyResponse: (subscriberId, streamId, keys) => {
                    assert.strictEqual(subscriberId, 'subscriber2')
                    assert.strictEqual(streamId, 'streamId')
                    assert.strictEqual(keys.length, 1)
                    const keyObject = keys[0]
                    const expectedKey = client.options.publisherGroupKeys.streamId
                    assert.deepStrictEqual(subscriberKeyPair.decryptWithPrivateKey(keyObject.groupKey, true), expectedKey)
                    // TODO: assert start time
                    return Promise.resolve('fake response')
                },
            }
            client.publishStreamMessage = (response) => {
                assert.strictEqual(response, 'fake response')
                done()
            }
            return util.handleGroupKeyRequest(streamMessage)
        })
    })
    describe('handleGroupKeyResponse', () => {
        it('should reject unsigned response', (done) => {
            const streamMessage = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'publisherId', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE, StreamMessage.ENCRYPTION_TYPES.RSA, {
                    streamId: 'streamId',
                    keys: [{
                        groupKey: 'encrypted-group-key',
                        start: 54256,
                    }],
                }, StreamMessage.SIGNATURE_TYPES.NONE, null,
            )
            try {
                util.handleGroupKeyResponse(streamMessage)
            } catch (err) {
                assert.strictEqual(err.message, 'Received unsigned group key response (it must be signed to avoid MitM attacks).')
                done()
            }
        })
        it('should reject response for a stream to which the client is not subscribed', (done) => {
            const streamMessage = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'publisherId', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE, StreamMessage.ENCRYPTION_TYPES.RSA, {
                    streamId: 'wrong-streamId',
                    keys: [{
                        groupKey: 'encrypted-group-key',
                        start: 54256,
                    }],
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            try {
                util.handleGroupKeyResponse(streamMessage)
            } catch (err) {
                assert.strictEqual(err.message, 'Received group key for a stream to which the client is not subscribed.')
                done()
            }
        })
        it('should reject response with invalid group key', (done) => {
            const encryptedGroupKey = EncryptionUtil.encryptWithPublicKey(crypto.randomBytes(16), client.encryptionUtil.getPublicKey(), true)
            const streamMessage = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'publisherId', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE, StreamMessage.ENCRYPTION_TYPES.RSA, {
                    streamId: 'streamId',
                    keys: [{
                        groupKey: encryptedGroupKey,
                        start: 54256,
                    }],
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            try {
                util.handleGroupKeyResponse(streamMessage)
            } catch (err) {
                assert.strictEqual(err.message, 'Group key must have a size of 256 bits, not 128')
                done()
            }
        })
        it('should update client options and subscriptions with received group key', (done) => {
            const groupKey = crypto.randomBytes(32)
            const encryptedGroupKey = EncryptionUtil.encryptWithPublicKey(groupKey, client.encryptionUtil.getPublicKey(), true)
            const streamMessage = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'publisherId', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE, StreamMessage.ENCRYPTION_TYPES.RSA, {
                    streamId: 'streamId',
                    keys: [{
                        groupKey: encryptedGroupKey,
                        start: 54256,
                    }],
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            client.setGroupKey = (streamId, publisherId, key) => {
                assert.strictEqual(streamId, 'streamId')
                assert.strictEqual(publisherId, 'publisherId')
                assert.deepStrictEqual(key, groupKey)
                done()
            }
            util.handleGroupKeyResponse(streamMessage)
        })
    })
})
