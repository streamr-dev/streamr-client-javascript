import crypto from 'crypto'
import assert from 'assert'

import sinon from 'sinon'
import { MessageLayer } from 'streamr-client-protocol'

import KeyExchangeUtil from '../../src/KeyExchangeUtil'
import EncryptionUtil from '../../src/EncryptionUtil'
import KeyStorageUtil from '../../src/KeyStorageUtil'
import InvalidGroupKeyResponseError from '../../src/errors/InvalidGroupKeyResponseError'
import InvalidGroupKeyRequestError from '../../src/errors/InvalidGroupKeyRequestError'
import InvalidGroupKeyResetError from '../../src/errors/InvalidGroupKeyResetError'

const { StreamMessage } = MessageLayer
const subscribers = ['0xb8CE9ab6943e0eCED004cDe8e3bBed6568B2Fa01'.toLowerCase(), 'subscriber2', 'subscriber3']
const subscribersMap = {}
subscribers.forEach((p) => {
    subscribersMap[p] = true
})

async function setupClient() {
    const client = {}
    client.getStreamSubscribers = sinon.stub()
    client.getStreamSubscribers.withArgs('streamId').resolves(subscribers)
    client.isStreamSubscriber = sinon.stub()
    client.isStreamSubscriber.withArgs('streamId', 'subscriber4').resolves(true)
    client.isStreamSubscriber.withArgs('streamId', 'subscriber5').resolves(false)
    client.keyStorageUtil = KeyStorageUtil.getKeyStorageUtil()
    client.keyStorageUtil.addKey('streamId', crypto.randomBytes(32), 5)
    client.keyStorageUtil.addKey('streamId', crypto.randomBytes(32), 12)
    client.keyStorageUtil.addKey('streamId', crypto.randomBytes(32), 17)
    client.keyStorageUtil.addKey('streamId', crypto.randomBytes(32), 25)
    client.keyStorageUtil.addKey('streamId', crypto.randomBytes(32), 35)
    client.subscribedStreamPartitions = {
        streamId0: { // 'streamId' + 0 (stream partition)
            setSubscriptionsGroupKey: sinon.stub(),
        },
    }
    client.encryptionUtil = new EncryptionUtil()
    await client.encryptionUtil.onReady()
    return client
}

describe('KeyExchangeUtil', () => {
    let client
    let util
    beforeEach(async () => {
        client = await setupClient()
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
    describe('nbSubscribersToRevoke', () => {
        it('correctly returns the number of subscribers to revoke at each call', async () => {
            client.getStreamSubscribers.withArgs('streamId1').onCall(0).resolves(['subscriberId1', 'subscriberId2'])
            client.getStreamSubscribers.withArgs('streamId1').onCall(1).resolves(['subscriberId1', 'subscriberId3'])
            client.getStreamSubscribers.withArgs('streamId1').onCall(2).resolves(['subscriberId1', 'subscriberId3', 'subscriber8'])
            client.getStreamSubscribers.withArgs('streamId1').onCall(3).resolves(['subscriberId4', 'subscriberId3', 'subscriberId2'])
            client.getStreamSubscribers.withArgs('streamId2').onCall(0).resolves(['subscriberId1', 'subscriberId2'])
            client.getStreamSubscribers.withArgs('streamId2').onCall(1).resolves(['subscriberId1', 'subscriberId2'])
            client.getStreamSubscribers.withArgs('streamId2').onCall(2).resolves(['subscriberId5', 'subscriberId3', 'subscriberId8'])
            client.getStreamSubscribers.withArgs('streamId2').onCall(3).resolves(['subscriberId9', 'subscriberId10', 'subscriberId11'])

            assert.strictEqual(await util.nbSubscribersToRevoke('streamId1'), 0)
            assert.strictEqual(await util.nbSubscribersToRevoke('streamId2'), 0)
            assert.strictEqual(await util.nbSubscribersToRevoke('streamId1'), 1)
            assert.strictEqual(await util.nbSubscribersToRevoke('streamId2'), 0)
            assert.strictEqual(await util.nbSubscribersToRevoke('streamId1'), 0)
            assert.strictEqual(await util.nbSubscribersToRevoke('streamId2'), 2)
            assert.strictEqual(await util.nbSubscribersToRevoke('streamId1'), 2)
            assert.strictEqual(await util.nbSubscribersToRevoke('streamId2'), 3)
        })
    })
    describe('keyRevocationNeeded', () => {
        it('should not revoke if checked recently', async () => {
            let res = await util.keyRevocationNeeded('streamId')
            assert(client.getStreamSubscribers.calledOnce)
            assert(!res)
            res = await util.keyRevocationNeeded('streamId')
            assert(client.getStreamSubscribers.calledOnce)
            assert(!res)
        })
        it('should not revoke if enough time elapsed but less than threshold', async () => {
            const clock = sinon.useFakeTimers()
            const initialSubscribers = []
            for (let i = 0; i < KeyExchangeUtil.REVOCATION_THRESHOLD - 1; i++) {
                initialSubscribers.push(`subscriberId${i}`)
            }
            client.getStreamSubscribers.withArgs('streamId3').onCall(0).resolves(initialSubscribers)
            client.getStreamSubscribers.withArgs('streamId3').onCall(1).resolves([]) // all subscribers need to be revoked
            let res = await util.keyRevocationNeeded('streamId3')
            assert(client.getStreamSubscribers.calledOnce)
            assert(!res)
            clock.tick(KeyExchangeUtil.REVOCATION_DELAY + 1000)
            res = await util.keyRevocationNeeded('streamId3')
            assert(client.getStreamSubscribers.calledTwice)
            assert(!res)
            clock.restore()
        })
        it('should revoke if threshold reached', async () => {
            const clock = sinon.useFakeTimers()
            const initialSubscribers = []
            for (let i = 0; i < KeyExchangeUtil.REVOCATION_THRESHOLD; i++) {
                initialSubscribers.push(`subscriberId${i}`)
            }
            client.getStreamSubscribers.withArgs('streamId3').onCall(0).resolves(initialSubscribers)
            client.getStreamSubscribers.withArgs('streamId3').onCall(1).resolves([]) // all subscribers need to be revoked
            let res = await util.keyRevocationNeeded('streamId3')
            assert(client.getStreamSubscribers.calledOnce)
            assert(!res)
            clock.tick(KeyExchangeUtil.REVOCATION_DELAY + 1000)
            res = await util.keyRevocationNeeded('streamId3')
            assert(client.getStreamSubscribers.calledTwice)
            assert(res)
            clock.restore()
        })
    })
    describe('revoke', () => {
        it('should rekey by sending group key resets', async () => {
            client.isStreamSubscriber.withArgs('streamId4', 'subscriber1').resolves(true)
            client.isStreamSubscriber.withArgs('streamId4', 'subscriber2').resolves(true)
            client.isStreamSubscriber.withArgs('streamId4', 'subscriber3').resolves(true)
            client.getStreamSubscribers.withArgs('streamId4').resolves([])
            client.keyStorageUtil.addKey('streamId4', crypto.randomBytes(32), 5)
            util.localSubscribers.streamId4 = ['subscriber1', 'subscriber3'] // fake call to 'keyRevocationNeeded', subscriber2 must be revoked

            const subscriberKeyPair1 = new EncryptionUtil()
            await subscriberKeyPair1.onReady()
            const request1 = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'subscriber1', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST, StreamMessage.ENCRYPTION_TYPES.NONE, {
                    streamId: 'streamId4',
                    publicKey: subscriberKeyPair1.getPublicKey(),
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            const subscriberKeyPair2 = new EncryptionUtil()
            await subscriberKeyPair2.onReady()
            const request2 = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'subscriber2', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST, StreamMessage.ENCRYPTION_TYPES.NONE, {
                    streamId: 'streamId4',
                    publicKey: subscriberKeyPair2.getPublicKey(),
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            const subscriberKeyPair3 = new EncryptionUtil()
            await subscriberKeyPair3.onReady()
            const request3 = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'subscriber3', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST, StreamMessage.ENCRYPTION_TYPES.NONE, {
                    streamId: 'streamId4',
                    publicKey: subscriberKeyPair3.getPublicKey(),
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )

            let resetKeySent1 = null
            let resetKeySent3 = null

            client.msgCreationUtil = {
                createGroupKeyResponse: sinon.stub().resolves({}),
                createGroupKeyReset: (subscriberId, streamId, key) => {
                    assert.strictEqual(streamId, 'streamId4')
                    if (subscriberId === 'subscriber1') {
                        resetKeySent1 = {
                            groupKey: subscriberKeyPair1.decryptWithPrivateKey(key.groupKey, true),
                            start: key.start
                        }
                        return Promise.resolve('fake reset 1')
                    }
                    assert.strictEqual(subscriberId, 'subscriber3')
                    resetKeySent3 = {
                        groupKey: subscriberKeyPair3.decryptWithPrivateKey(key.groupKey, true),
                        start: key.start
                    }
                    return Promise.resolve('fake reset 3')
                },
            }

            const published = []
            client.publishStreamMessage = (msg) => {
                published.push(msg)
                return Promise.resolve()
            }

            await util.handleGroupKeyRequest(request1)
            await util.handleGroupKeyRequest(request2)
            await util.handleGroupKeyRequest(request3)
            await util.rekey('streamId4')
            assert.deepStrictEqual(resetKeySent1, resetKeySent3)
            assert.deepStrictEqual(resetKeySent1, client.keyStorageUtil.getLatestKey('streamId4'))
            assert((published[3] === 'fake reset 1' && published[4] === 'fake reset 3')
                || (published[3] === 'fake reset 3' && published[4] === 'fake reset 1'))
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
                assert(err instanceof InvalidGroupKeyRequestError)
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
                assert(err instanceof InvalidGroupKeyRequestError)
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
                assert(err instanceof InvalidGroupKeyRequestError)
                assert.strictEqual(err.message, 'Received group key request for stream \'streamId\' from invalid address \'subscriber5\'')
                done()
            })
        })
        it('should send group key response (latest key)', (done) => {
            const subscriberKeyPair = new EncryptionUtil()
            subscriberKeyPair.onReady().then(() => {
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
                        const expectedKeyObj = client.keyStorageUtil.getLatestKey('streamId')
                        assert.deepStrictEqual(subscriberKeyPair.decryptWithPrivateKey(keyObject.groupKey, true), expectedKeyObj.groupKey)
                        assert.deepStrictEqual(keyObject.start, expectedKeyObj.start)
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
        it('should send group key response (range of keys)', (done) => {
            const subscriberKeyPair = new EncryptionUtil()
            subscriberKeyPair.onReady().then(() => {
                const streamMessage = StreamMessage.create(
                    ['clientInboxAddress', 0, Date.now(), 0, 'subscriber2', ''], null,
                    StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST, StreamMessage.ENCRYPTION_TYPES.NONE, {
                        streamId: 'streamId',
                        publicKey: subscriberKeyPair.getPublicKey(),
                        range: {
                            start: 15,
                            end: 27
                        }
                    }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
                )
                client.msgCreationUtil = {
                    createGroupKeyResponse: (subscriberId, streamId, keys) => {
                        assert.strictEqual(subscriberId, 'subscriber2')
                        assert.strictEqual(streamId, 'streamId')
                        const decryptedKeys = []
                        keys.forEach((keyObj) => {
                            const decryptedKey = subscriberKeyPair.decryptWithPrivateKey(keyObj.groupKey, true)
                            decryptedKeys.push({
                                groupKey: decryptedKey,
                                start: keyObj.start
                            })
                        })
                        assert.deepStrictEqual(decryptedKeys, client.keyStorageUtil.getKeysBetween('streamId', 15, 27))
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
        it('should send group key response (latest key and no storage of past keys)', (done) => {
            const subscriberKeyPair = new EncryptionUtil()
            subscriberKeyPair.onReady().then(() => {
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
                        const expectedKeyObj = client.keyStorageUtil.getLatestKey('streamId')
                        assert.deepStrictEqual(subscriberKeyPair.decryptWithPrivateKey(keyObject.groupKey, true), expectedKeyObj.groupKey)
                        assert.deepStrictEqual(keyObject.start, expectedKeyObj.start)
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
    })
    describe('handleGroupKeyResponse', () => {
        it('should reject unsigned response', () => {
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
                assert(err instanceof InvalidGroupKeyResponseError)
                assert.strictEqual(err.message, 'Received unsigned group key response (it must be signed to avoid MitM attacks).')
            }
        })
        it('should reject response for a stream to which the client is not subscribed', () => {
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
                assert(err instanceof InvalidGroupKeyResponseError)
                assert.strictEqual(err.message, 'Received group key response for a stream to which the client is not subscribed.')
            }
        })
        it('should reject response with invalid group key', () => {
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
                assert(err instanceof InvalidGroupKeyResponseError)
                assert.strictEqual(err.message, 'Group key must have a size of 256 bits, not 128')
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
            /* eslint-disable no-underscore-dangle */
            client._setGroupKeys = (streamId, publisherId, keys) => {
                assert.strictEqual(streamId, 'streamId')
                assert.strictEqual(publisherId, 'publisherId')
                assert.deepStrictEqual(keys, [{
                    groupKey,
                    start: 54256
                }])
                done()
            }
            /* eslint-enable no-underscore-dangle */
            return util.handleGroupKeyResponse(streamMessage)
        })
    })
    describe('handleGroupKeyReset', () => {
        it('should reject unsigned reset', () => {
            const streamMessage = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'publisherId', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_RESET_SIMPLE, StreamMessage.ENCRYPTION_TYPES.RSA, {
                    streamId: 'streamId',
                    groupKey: 'encrypted-group-key',
                    start: 54256,
                }, StreamMessage.SIGNATURE_TYPES.NONE, null,
            )
            try {
                util.handleGroupKeyReset(streamMessage)
            } catch (err) {
                assert(err instanceof InvalidGroupKeyResetError)
                assert.strictEqual(err.message, 'Received unsigned group key reset (it must be signed to avoid MitM attacks).')
            }
        })
        it('should reject reset for a stream to which the client is not subscribed', () => {
            const streamMessage = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'publisherId', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_RESET_SIMPLE, StreamMessage.ENCRYPTION_TYPES.RSA, {
                    streamId: 'wrong-streamId',
                    groupKey: 'encrypted-group-key',
                    start: 54256,
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            try {
                util.handleGroupKeyReset(streamMessage)
            } catch (err) {
                assert(err instanceof InvalidGroupKeyResetError)
                assert.strictEqual(err.message, 'Received group key reset for a stream to which the client is not subscribed.')
            }
        })
        it('should reject reset with invalid group key', () => {
            const encryptedGroupKey = EncryptionUtil.encryptWithPublicKey(crypto.randomBytes(16), client.encryptionUtil.getPublicKey(), true)
            const streamMessage = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'publisherId', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_RESET_SIMPLE, StreamMessage.ENCRYPTION_TYPES.RSA, {
                    streamId: 'streamId',
                    groupKey: encryptedGroupKey,
                    start: 54256,
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            try {
                util.handleGroupKeyReset(streamMessage)
            } catch (err) {
                assert(err instanceof InvalidGroupKeyResetError)
                assert.strictEqual(err.message, 'Group key must have a size of 256 bits, not 128')
            }
        })
        it('should update client options and subscriptions after reset with received group key', (done) => {
            const groupKey = crypto.randomBytes(32)
            const encryptedGroupKey = EncryptionUtil.encryptWithPublicKey(groupKey, client.encryptionUtil.getPublicKey(), true)
            const streamMessage = StreamMessage.create(
                ['clientInboxAddress', 0, Date.now(), 0, 'publisherId', ''], null,
                StreamMessage.CONTENT_TYPES.GROUP_KEY_RESET_SIMPLE, StreamMessage.ENCRYPTION_TYPES.RSA, {
                    streamId: 'streamId',
                    groupKey: encryptedGroupKey,
                    start: 54256,
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            /* eslint-disable no-underscore-dangle */
            client._setGroupKeys = (streamId, publisherId, keys) => {
                assert.strictEqual(streamId, 'streamId')
                assert.strictEqual(publisherId, 'publisherId')
                assert.deepStrictEqual(keys, [{
                    groupKey,
                    start: 54256
                }])
                done()
            }
            /* eslint-enable no-underscore-dangle */
            return util.handleGroupKeyReset(streamMessage)
        })
    })
})
