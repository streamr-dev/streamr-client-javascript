import 'babel-polyfill' // Needed because of mocha
import assert from 'assert'
import fetch from 'node-fetch'

import StreamrClient from '../../src'
import config from './config'

/**
 * These tests should be run in sequential order!
 */
describe('StreamrClient', () => {
    const name = `StreamrClient-integration-${Date.now()}`

    let client
    let createdStream

    const createClient = (opts = {}) => new StreamrClient({
        url: config.websocketUrl,
        restUrl: config.restUrl,
        apiKey: 'tester1-api-key',
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    beforeAll(() => Promise.all([
        fetch(config.restUrl),
        fetch(config.websocketUrl.replace('ws://', 'http://')),
    ])
        .then(() => {
            client = createClient()
            return client.connect()
        })
        .catch((e) => {
            if (e.errno === 'ENOTFOUND' || e.errno === 'ECONNREFUSED') {
                throw new Error('Integration testing requires that engine-and-editor ' +
                    'and data-api ("entire stack") are running in the background. ' +
                    'Instructions: https://github.com/streamr-dev/streamr-docker-dev#running')
            } else {
                throw e
            }
        }))

    afterAll((done) => {
        if (client && client.isConnected()) {
            client.disconnect().then(done)
        } else {
            done()
        }
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

    describe('Stream.update', () => {
        it('can change stream name', () => {
            createdStream.name = 'New name'
            return createdStream.update()
        })
    })

    describe('Data production', () => {
        beforeAll(() => {
            assert(client.isConnected())
        })

        it('Stream.produce', () => createdStream.produce({
            test: 'Stream.produce',
        }))

        it('client.produceToStream', () => client.produceToStream(createdStream.id, {
            test: 'client.produceToStream',
        }))

        it('client.produceToStream with Stream object as arg', () => client.produceToStream(createdStream, {
            test: 'client.produceToStream with Stream object as arg',
        }))

        it('client.subscribe with resend', (done) => {
            // This test needs some time because the write needs to have time to go to Cassandra
            setTimeout(() => {
                const sub = client.subscribe({
                    stream: createdStream.id,
                    resend_last: 1,
                }, () => {
                    client.unsubscribe(sub)
                    sub.on('unsubscribed', () => {
                        done()
                    })
                })
            }, 5000)
        }, 10000)

        it('client.subscribe (realtime)', (done) => {
            const id = Date.now()

            // Make a new stream for this test to avoid conflicts
            client.getOrCreateStream({
                name: `StreamrClient client.subscribe (realtime) - ${Date.now()}`,
            }).then((stream) => {
                const sub = client.subscribe({
                    stream: stream.id,
                }, (message) => {
                    assert.equal(message.id, id)
                    client.unsubscribe(sub)
                    sub.on('unsubscribed', () => {
                        done()
                    })
                })

                sub.on('subscribed', () => {
                    stream.produce({
                        id,
                    })
                })
            })
        })
    })

    describe('Stream configuration', () => {
        it('Stream.detectFields', (done) => {
            client.produceToStream(createdStream.id, {
                foo: 'bar',
                count: 0,
            })

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
