import assert from 'assert'
import sinon from 'sinon'
import { PublishRequest, StreamMessage } from 'streamr-client-protocol'
import SubscribedStream from '../../src/SubscribedStream'
import Signer from '../../src/Signer'

describe('SubscribedStream', () => {
    let subscribedStream
    const producers = ['0x9f93732db3a246b18805aa745dbd494e6784e811', 'producer2', 'producer3']

    function setupClientAndStream(verifySignatures = 'auto', requireSignedData = true) {
        const client = {
            options: {
                verifySignatures,
            },
        }
        client.getStreamProducers = sinon.stub()
        client.getStreamProducers.withArgs('streamId').resolves(producers)
        client.getStream = sinon.stub()
        const stream = {
            requireSignedData,
        }
        client.getStream.withArgs('streamId').resolves(stream)
        return {
            client,
            stream,
        }
    }
    describe('signature verification', () => {
        describe('helper methods', () => {
            let client
            let stream
            beforeEach(() => {
                ({ client, stream } = setupClientAndStream())
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
        })
        describe('verifyStreamMessage', () => {
            let msg
            let client
            let spiedVerifyStreamMessage
            let spiedExpectedCall
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
                spiedVerifyStreamMessage = sinon.spy(Signer, 'verifyStreamMessage')
            })
            afterEach(async () => {
                subscribedStream = new SubscribedStream(client, 'streamId')
                const valid = await subscribedStream.verifyStreamMessage(msg)
                assert.strictEqual(valid, true)
                assert(spiedExpectedCall)
                spiedVerifyStreamMessage.restore()
            })
            it('should verify when "auto" verification and stream requires signed data', async () => {
                ({ client } = setupClientAndStream('auto', true))
                spiedExpectedCall = () => spiedVerifyStreamMessage.calledOnce
            })
            it('should return true without verifying when "auto" verification and stream does not require signed data', async () => {
                ({ client } = setupClientAndStream('auto', false))
                spiedExpectedCall = () => spiedVerifyStreamMessage.notCalled
            })
            it('should verify with "always" verification mode even if stream does not require signed data', async () => {
                ({ client } = setupClientAndStream('auto', true))
                spiedExpectedCall = () => spiedVerifyStreamMessage.calledOnce
            })
            it('should return true without verifying with "never" verification mode even if stream requires signed data', async () => {
                ({ client } = setupClientAndStream('never', true))
                spiedExpectedCall = () => spiedVerifyStreamMessage.notCalled
            })
        })
    })
    describe('subscriptions', () => {
        let client
        let sub1
        beforeEach(() => {
            ({ client } = setupClientAndStream())
            subscribedStream = new SubscribedStream(client, 'streamId')
            sub1 = {
                id: 'sub1Id',
            }
        })
        it('should add and remove subscription correctly', () => {
            assert(subscribedStream.getSubscription(sub1.id) === undefined)
            subscribedStream.addSubscription(sub1)
            assert(subscribedStream.getSubscription(sub1.id) === sub1)
            subscribedStream.removeSubscription(sub1)
            assert(subscribedStream.getSubscription(sub1.id) === undefined)
        })
        it('should get subscriptions array', () => {
            subscribedStream.addSubscription(sub1)
            const sub2 = {
                id: 'sub2Id',
            }
            subscribedStream.addSubscription(sub2)
            assert.deepStrictEqual(subscribedStream.getSubscriptions(), [sub1, sub2])
        })
        it('should return true', () => {
            assert.strictEqual(subscribedStream.emptySubscriptionsSet(), true)
        })
    })
})
