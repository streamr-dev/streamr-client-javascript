import assert from 'assert'
import sinon from 'sinon'
import KeyExchangeUtil from '../../src/KeyExchangeUtil'

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
})
