import assert from 'assert'
import fetch from 'node-fetch'

import StreamrClient from '../../src'
import config from './config'
import Signer from '../../src/Signer'

/**
 * These tests should be run in sequential order!
 */
describe('StreamrClient', () => {
    const name = `StreamrClient-integration-${Date.now()}`

    let client

    const createClient = (opts = {}) => new StreamrClient({
        url: `${config.websocketUrl}?payloadVersion=29`,
        restUrl: config.restUrl,
        auth: {
            privateKey: '12345564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            publishWithSignature: true,
        },
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

    describe('Pub/Sub', () => {
        let createdStream

        beforeAll(() => {
            assert(client.isConnected())
            return client.createStream({
                name,
            }).then((stream) => {
                createdStream = stream
                assert(stream.id)
                assert.equal(stream.name, name)
            })
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
            let streamMessage
            setTimeout(() => {
                const sub = client.subscribe({
                    stream: createdStream.id,
                    resend_last: 1,
                }, () => {
                    client.unsubscribe(sub)
                    sub.on('unsubscribed', () => {
                        assert.strictEqual(streamMessage.parsedContent.test, 'client.produceToStream with Stream object as arg')
                        assert.strictEqual(streamMessage.signatureType, 1)
                        assert(streamMessage.publisherAddress)
                        assert(streamMessage.signature)
                        Signer.verifyStreamMessage(streamMessage)
                        done()
                    })
                })
                client.connection.on('UnicastMessage', (msg) => {
                    streamMessage = msg.payload
                })
            }, 5000)
        }, 10000)

        it('client.subscribe (realtime)', (done) => {
            let streamMessage
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
                        assert.strictEqual(streamMessage.parsedContent.id, id)
                        assert.strictEqual(streamMessage.signatureType, 1)
                        assert(streamMessage.publisherAddress)
                        assert(streamMessage.signature)
                        Signer.verifyStreamMessage(streamMessage)
                        done()
                    })
                })
                sub.on('subscribed', () => {
                    stream.produce({
                        id,
                    })
                })
                client.connection.on('BroadcastMessage', (msg) => {
                    streamMessage = msg.payload
                })
            })
        })
    })
})
