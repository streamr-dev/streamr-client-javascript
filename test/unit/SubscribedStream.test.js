import assert from 'assert'
import sinon from 'sinon'
import { PublishRequest, StreamMessage } from 'streamr-client-protocol'
import StreamrClient from '../../src/StreamrClient'
import SubscribedStream from '../../src/SubscribedStream'
import Signer from '../../src/Signer'

describe('SubscribedStream', () => {
    let client
    let subscribedStream
    const producers = ['0x9f93732db3a246b18805aa745dbd494e6784e811', 'producer2', 'producer3']
    describe('constructor', () => {
        it('should set verifySignatures to true', () => {
            client = new StreamrClient({
                verifySignatures: 'always',
            })
            subscribedStream = new SubscribedStream(client, 'streamId')
            assert.strictEqual(subscribedStream.verifySignatures, true)
        })
        it('should set verifySignatures to false', () => {
            client = new StreamrClient({
                verifySignatures: 'never',
            })
            subscribedStream = new SubscribedStream(client, 'streamId')
            assert.strictEqual(subscribedStream.verifySignatures, false)
        })
        it('should set verifySignatures to undefined at construction', () => {
            client = new StreamrClient({
                verifySignatures: 'auto',
            })
            subscribedStream = new SubscribedStream(client, 'streamId')
            assert.strictEqual(subscribedStream.verifySignatures, undefined)
        })
    })
    describe('signature verification', () => {
        let stream
        beforeEach(() => {
            client = new StreamrClient()
            client.getStreamProducers = sinon.stub()
            client.getStreamProducers.withArgs('streamId').resolves(producers)
            client.getStream = sinon.stub()
            stream = {
                requireSignedData: true,
            }
            client.getStream.withArgs('streamId').resolves(stream)
            subscribedStream = new SubscribedStream(client, 'streamId')
        })
        describe('getProducers', () => {
            it('should use endpoint to retrieve producers', async () => {
                const retrievedProducers = await subscribedStream.getProducers()
                assert(client.getStreamProducers.calledOnce)
                assert.deepStrictEqual(producers, retrievedProducers)
                assert.deepStrictEqual(await subscribedStream.producersPromise, producers)
            })
            it('should use stored producers and not the endpoint', async () => {
                subscribedStream.producersPromise = Promise.resolve(producers)
                const retrievedProducers = await subscribedStream.getProducers()
                assert(client.getStreamProducers.notCalled)
                assert.deepStrictEqual(producers, retrievedProducers)
            })
            it('should call getStreamProducers only once when multiple calls made simultaneously', () => {
                const p1 = subscribedStream.getProducers()
                const p2 = subscribedStream.getProducers()
                return Promise.all([p1, p2]).then(([producers1, producers2]) => {
                    assert(client.getStreamProducers.calledOnce)
                    assert.deepStrictEqual(producers1, producers2)
                })
            })
        })
        describe('getStream', () => {
            it('should use endpoint to retrieve stream', async () => {
                const retrievedStream = await subscribedStream.getStream()
                assert(client.getStream.calledOnce)
                assert.strictEqual(stream, retrievedStream)
                assert.strictEqual(stream, await subscribedStream.streamPromise)
            })
            it('should use stored stream and not the endpoint', async () => {
                subscribedStream.streamPromise = Promise.resolve(stream)
                const retrievedStream = await subscribedStream.getStream()
                assert(client.getStream.notCalled)
                assert.strictEqual(stream, retrievedStream)
            })
            it('should call the endpoint only once when multiple calls made simultaneously', () => {
                const p1 = subscribedStream.getStream()
                const p2 = subscribedStream.getStream()
                return Promise.all([p1, p2]).then(([stream1, stream2]) => {
                    assert(client.getStream.calledOnce)
                    assert.deepStrictEqual(stream1, stream2)
                })
            })
        })
        describe('getVerifySignatures', () => {
            it('should set signature verification flag to true', async () => {
                assert.strictEqual(subscribedStream.verifySignatures, undefined)
                const retrievedFlag = await subscribedStream.getVerifySignatures()
                assert(client.getStream.calledOnce)
                assert.strictEqual(retrievedFlag, true)
                assert.strictEqual(subscribedStream.verifySignatures, true)
            })
            it('should set signature verification flag to false', async () => {
                client.getStream = sinon.stub()
                client.getStream.withArgs('streamId').resolves({
                    requireSignedData: false,
                })
                assert.strictEqual(subscribedStream.verifySignatures, undefined)
                const retrievedFlag = await subscribedStream.getVerifySignatures()
                assert(client.getStream.calledOnce)
                assert.strictEqual(retrievedFlag, false)
                assert.strictEqual(subscribedStream.verifySignatures, false)
            })
        })
        describe('verifyStreamMessage', () => {
            let msg
            beforeEach(async () => {
                const signer = new Signer({
                    privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
                })
                const streamId = 'streamId'
                const data = {
                    field: 'some-data',
                }
                const timestamp = Date.now()
                const request = new PublishRequest(streamId, undefined, undefined, data, timestamp)
                const signedRequest = await signer.getSignedPublishRequest(request)
                msg = new StreamMessage(
                    streamId, 0, timestamp, 0, 0, 0, StreamMessage.CONTENT_TYPES.JSON,
                    data, 1, signedRequest.publisherAddress, signedRequest.signature,
                )
            })
            it('should return true', async () => {
                const spiedVerifyStreamMessage = sinon.spy(Signer, 'verifyStreamMessage')
                subscribedStream.verifySignatures = true
                const valid = await subscribedStream.verifyStreamMessage(msg)
                assert.strictEqual(valid, true)
                assert(spiedVerifyStreamMessage.calledOnce)
                spiedVerifyStreamMessage.restore()
            })
            it('should return true without verifying', async () => {
                const spiedVerifyStreamMessage = sinon.spy(Signer, 'verifyStreamMessage')
                subscribedStream.verifySignatures = false
                const valid = await subscribedStream.verifyStreamMessage(msg)
                assert.strictEqual(valid, true)
                assert(spiedVerifyStreamMessage.notCalled)
                spiedVerifyStreamMessage.restore()
            })
        })
    })
    describe('subscriptions', () => {
        let sub1
        beforeEach(() => {
            client = new StreamrClient()
            subscribedStream = new SubscribedStream(client, 'streamId')
            sub1 = {
                id: 'sub1Id',
            }
        })
        it('should add subscription to object', () => {
            subscribedStream.addSubscription(sub1)
            assert(subscribedStream.subscriptions[sub1.id] === sub1)
        })
        it('should remove subscription', () => {
            subscribedStream.subscriptions[sub1.id] = sub1
            subscribedStream.removeSubscription(sub1)
            assert(subscribedStream.subscriptions[sub1.id] === undefined)
        })
        it('should get subscriptions array', () => {
            subscribedStream.subscriptions[sub1.id] = sub1
            const sub2 = {
                id: 'sub2Id',
            }
            subscribedStream.subscriptions[sub2.id] = sub2
            assert.deepStrictEqual(subscribedStream.getSubscriptions(), [sub1, sub2])
        })
        it('should return true', () => {
            assert.strictEqual(subscribedStream.emptySubscriptionsSet(), true)
        })
    })
})
