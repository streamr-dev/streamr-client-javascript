import assert from 'assert'

import StreamrClient from '../../src'
import config from './config'

/**
 * These tests should be run in sequential order!
 */
describe('StreamEndpoints', () => {
    const name = `StreamEndpoints-integration-${Date.now()}`

    let client
    let createdStream

    const createClient = (opts = {}) => new StreamrClient({
        url: config.websocketUrl,
        restUrl: config.restUrl,
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    beforeAll(() => {
        client = createClient({
            auth: {
                privateKey: '12345564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            },
        })
    })

    describe('Stream creation', () => {
        it('createStream', () => client.createStream({
            name,
        })
            .then((stream) => {
                createdStream = stream
                assert(stream.id)
                assert.equal(stream.name, name)
            }))

        it('getOrCreate an existing Stream', () => client.getOrCreateStream({
            name,
        })
            .then((existingStream) => {
                assert.equal(existingStream.id, createdStream.id)
                assert.equal(existingStream.name, createdStream.name)
            }))

        it('getOrCreate a new Stream', () => {
            const newName = Date.now()
                .toString()
            return client.getOrCreateStream({
                name: newName,
            })
                .then((newStream) => {
                    assert.notEqual(newStream.id, createdStream.id)
                })
        })
    })

    it('client.getStreamProducers should retrieve itself', async () => {
        const producers = await client.getStreamProducers(createdStream.id)
        assert.deepStrictEqual(producers, [client.signer.address])
    })

    describe('Stream.update', () => {
        it('can change stream name', () => {
            createdStream.name = 'New name'
            return createdStream.update()
        })
    })

    describe('Stream configuration', () => {
        it('Stream.detectFields', (done) => {
            client.connect().then(() => {
                client.produceToStream(createdStream.id, {
                    foo: 'bar',
                    count: 0,
                }).then(() => {
                    // Need time to propagate to storage
                    setTimeout(() => {
                        createdStream.detectFields().then((stream) => {
                            assert.deepEqual(
                                stream.config.fields,
                                [
                                    {
                                        name: 'foo',
                                        type: 'string',
                                    },
                                    {
                                        name: 'count',
                                        type: 'number',
                                    },
                                ],
                            )
                            done()
                        })
                    }, 5000)
                })
            })
        }, 10000)
    })

    describe('Stream permissions', () => {
        it('Stream.getPermissions', () => createdStream.getPermissions().then((permissions) => {
            assert.equal(permissions.length, 3) // read, write, share for the owner
        }))
    })

    describe('Stream deletion', () => {
        it('Stream.delete', () => createdStream.delete())
    })
})
