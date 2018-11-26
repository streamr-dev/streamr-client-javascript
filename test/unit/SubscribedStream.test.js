import assert from 'assert'
import sinon from 'sinon'
import { StreamMessage } from 'streamr-client-protocol'
import StreamrClient from '../../src/StreamrClient'
import SubscribedStream from '../../src/SubscribedStream'

describe('SubscribedStream', () => {
    let client
    let stream
    const producers = ['producer1', 'producer2', 'producer3']
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
        it('should set verifySignatures to false', () => {
            client = new StreamrClient({
                verifySignatures: 'auto',
            })
            stream = new SubscribedStream(client, 'streamId')
            assert.strictEqual(stream.verifySignatures, stream.requireSignedData)
        })
    })
    describe('signature verification', () => {
        beforeEach(() => {
            client = new StreamrClient()
            client.signer = sinon.stub()
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
        describe('verifyStreamMessage', () => {
            let msg
            beforeEach(() => {
                msg = new StreamMessage()
                client.signer.verifyStreamMessage = sinon.stub()
                client.signer.verifyStreamMessage.withArgs(msg, producers).returns(true)
            })
            it('should return true', async () => {
                stream.verifySignatures = true
                const valid = await stream.verifyStreamMessage(msg)
                assert.strictEqual(valid, true)
                assert(client.signer.verifyStreamMessage.calledOnce)
            })
            it('should return true without verifying', async () => {
                stream.verifySignatures = false
                const valid = await stream.verifyStreamMessage(msg)
                assert.strictEqual(valid, true)
                assert(client.signer.verifyStreamMessage.notCalled)
            })
        })
    })
})
