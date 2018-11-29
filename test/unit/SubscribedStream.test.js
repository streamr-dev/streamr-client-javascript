import assert from 'assert'
import sinon from 'sinon'
import { PublishRequest, StreamMessage } from 'streamr-client-protocol'
import StreamrClient from '../../src/StreamrClient'
import SubscribedStream from '../../src/SubscribedStream'
import Signer from '../../src/Signer'

describe('SubscribedStream', () => {
    let client
    let stream
    const producers = ['0x9f93732db3a246b18805aa745dbd494e6784e811', 'producer2', 'producer3']
    describe('constructor', () => {
        it('should set verifySignatures to true', () => {
            client = new StreamrClient({
                verifySignatures: 'always',
            })
            stream = new SubscribedStream(client, 'streamId')
            assert.strictEqual(stream.verifySignatures, true)
        })
        it('should set verifySignatures to false', () => {
            client = new StreamrClient({
                verifySignatures: 'never',
            })
            stream = new SubscribedStream(client, 'streamId')
            assert.strictEqual(stream.verifySignatures, false)
        })
        it('should set verifySignatures to undefined at construction', () => {
            client = new StreamrClient({
                verifySignatures: 'auto',
            })
            stream = new SubscribedStream(client, 'streamId')
            assert.strictEqual(stream.verifySignatures, undefined)
        })
    })
    describe('signature verification', () => {
        beforeEach(() => {
            client = new StreamrClient()
            client.getStreamProducers = sinon.stub()
            client.getStreamProducers.withArgs('streamId').resolves(producers)
            stream = new SubscribedStream(client, 'streamId')
        })
        describe('getProducers', () => {
            it('should use endpoint to retrieve producers', async () => {
                const retrievedProducers = await stream.getProducers()
                assert(client.getStreamProducers.calledOnce)
                assert.deepStrictEqual(producers, retrievedProducers)
                assert.deepStrictEqual(stream.producers, producers)
            })
            it('should use stored producers and not the endpoint', async () => {
                stream.producers = producers
                const retrievedProducers = await stream.getProducers()
                assert(client.getStreamProducers.notCalled)
                assert.deepStrictEqual(producers, retrievedProducers)
            })
        })
        describe('getVerifySignatures', () => {
            it('should set signature verification flag to true', async () => {
                client.getStream = sinon.stub().resolves({
                    requireSignedData: true,
                })
                assert.strictEqual(stream.verifySignatures, undefined)
                const retrievedFlag = await stream.getVerifySignatures()
                assert(client.getStream.calledOnce)
                assert.strictEqual(retrievedFlag, true)
                assert.strictEqual(stream.verifySignatures, true)
            })
            it('should set signature verification flag to false', async () => {
                client.getStream = sinon.stub().resolves({
                    requireSignedData: false,
                })
                assert.strictEqual(stream.verifySignatures, undefined)
                const retrievedFlag = await stream.getVerifySignatures()
                assert(client.getStream.calledOnce)
                assert.strictEqual(retrievedFlag, false)
                assert.strictEqual(stream.verifySignatures, false)
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
                stream.verifySignatures = true
                const valid = await stream.verifyStreamMessage(msg)
                assert.strictEqual(valid, true)
                assert(spiedVerifyStreamMessage.calledOnce)
                spiedVerifyStreamMessage.restore()
            })
            it('should return true without verifying', async () => {
                const spiedVerifyStreamMessage = sinon.spy(Signer, 'verifyStreamMessage')
                stream.verifySignatures = false
                const valid = await stream.verifyStreamMessage(msg)
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
            stream = new SubscribedStream(client, 'streamId')
            sub1 = {
                id: 'sub1Id',
            }
        })
        it('should add subscription to object', () => {
            stream.addSubscription(sub1)
            assert(stream.subscriptions[sub1.id] === sub1)
        })
        it('should remove subscription', () => {
            stream.subscriptions[sub1.id] = sub1
            stream.removeSubscription(sub1)
            assert(stream.subscriptions[sub1.id] === undefined)
        })
        it('should get subscriptions array', () => {
            stream.subscriptions[sub1.id] = sub1
            const sub2 = {
                id: 'sub2Id',
            }
            stream.subscriptions[sub2.id] = sub2
            assert.deepStrictEqual(stream.getSubscriptions(), [sub1, sub2])
        })
        it('should return true', () => {
            assert.strictEqual(stream.emptySubscriptionsSet(), true)
        })
    })
})
