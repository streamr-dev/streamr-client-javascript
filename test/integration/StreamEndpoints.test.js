import 'babel-polyfill' // Needed because of mocha
import assert from 'assert'

import StreamrClient from '../../src'
import config from './config'

/**
 * These tests should be run in sequential order!
 */
describe('StreamEndpoints', () => {
    const name = `StreamEndpoints-integration-${Date.now()}`

    let client
    let clientPrivateKey
    let clientUsernamePassword
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
                apiKey: 'tester1-api-key',
            },
        })
        clientPrivateKey = createClient({
            auth: {
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            },
        })
        clientUsernamePassword = createClient({
            auth: {
                username: 'tester2@streamr.com',
                password: 'tester2',
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

        it('createStream with private key', () => clientPrivateKey.createStream({
            name: 'Login test 1',
        })
            .then((stream) => {
                assert(stream.id)
            }))

        it('createStream with username/password', () => clientUsernamePassword.createStream({
            name: 'Login test 2',
        })
            .then((stream) => {
                assert(stream.id)
            }))

        it('createStream twice with token expiration', () => clientPrivateKey.createStream({
            name: 'Login test 3a',
        })
            .then((stream1) => {
                assert(stream1)
                // We mimic the token expiration by setting it to some value unknown by the backend
                clientPrivateKey.session.sessionToken = 'invalid-token'
                clientPrivateKey.createStream({
                    name: 'Login test 3b',
                })
                    .then((stream2) => {
                        assert(stream2)
                    })
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
