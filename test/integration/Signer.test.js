import assert from 'assert'
import fetch from 'node-fetch'

import StreamrClient from '../../src'
import Signer from '../../src/Signer'
import config from './config'

/**
 * These tests should be run in sequential order!
 */
describe('Signer', () => {
    const name = `Signer-integration-${Date.now()}`

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
                createdStream.produce({
                    test: 'test1',
                }, Date.now())
            })
        })

        it('should receive signature in UnicastMessage', (done) => {
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
                client.connection.on('UnicastMessage', (msg) => {
                    const streamMessage = msg.payload
                    assert.strictEqual(streamMessage.parsedContent.test, 'test1')
                    assert.strictEqual(streamMessage.signatureType, 1)
                    assert(streamMessage.publisherAddress)
                    assert(streamMessage.signature)
                    Signer.verifyStreamMessage(streamMessage)
                    done()
                })
            }, 5000)
        }, 10000)

        it('should receive signature in BroadcastMessage', (done) => {
            client.getOrCreateStream({
                name: `Signer - ${Date.now()}`,
            }).then((stream) => {
                const sub = client.subscribe({
                    stream: stream.id,
                }, () => {
                    client.unsubscribe(sub)
                    sub.on('unsubscribed', () => {
                        done()
                    })
                })
                const ts = Date.now()
                sub.on('subscribed', () => {
                    stream.produce({
                        test: 'test2',
                    }, ts)
                })
                client.connection.on('BroadcastMessage', (msg) => {
                    const streamMessage = msg.payload
                    assert.strictEqual(streamMessage.parsedContent.test, 'test2')
                    assert.strictEqual(ts, streamMessage.timestamp)
                    assert.strictEqual(streamMessage.signatureType, 1)
                    assert(streamMessage.publisherAddress)
                    assert(streamMessage.signature)
                    Signer.verifyStreamMessage(streamMessage)
                    done()
                })
            })
        })
    })
})
