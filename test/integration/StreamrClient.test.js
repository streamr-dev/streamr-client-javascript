import assert from 'assert'
import fetch from 'node-fetch'
import Web3 from 'web3'
import FakeProvider from 'web3-fake-provider'

import StreamrClient from '../../src'
import config from './config'

describe('StreamrClient', () => {
    let client

    const createClient = (opts = {}) => new StreamrClient({
        url: `${config.websocketUrl}?controlLayerVersion=0&messageLayerVersion=29`,
        restUrl: config.restUrl,
        auth: {
            privateKey: new Web3(new FakeProvider()).eth.accounts.create().privateKey,
        },
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    const createStream = () => {
        const name = `StreamrClient-integration-${Date.now()}`
        console.log(`createStream: ${name}`)
        assert(client.isConnected())
        console.log('Calling client.createStream and returning Promise')
        return client.createStream({
            name,
            requireSignedData: true,
        }).then((stream) => {
            console.log(`then handler: created stream ${stream.id} ${stream.name}`)
            assert(stream.id)
            assert.equal(stream.name, name)
            assert.strictEqual(stream.requireSignedData, true)
            console.log('then handler: done')
            return stream
        }).catch((err) => {
            console.log('caught exception!')
            throw err
        })
    }

    beforeEach((done) => {
        Promise.all([
            fetch(config.restUrl),
            fetch(config.websocketUrl.replace('ws://', 'http://')),
        ])
            .then(() => {
                client = createClient()
                client.on('connected', done)
                client.connect()
            })
            .catch((e) => {
                if (e.errno === 'ENOTFOUND' || e.errno === 'ECONNREFUSED') {
                    throw new Error('Integration testing requires that engine-and-editor ' +
                        'and data-api ("entire stack") are running in the background. ' +
                        'Instructions: https://github.com/streamr-dev/streamr-docker-dev#running')
                } else {
                    throw e
                }
            })
    })

    afterEach((done) => {
        if (client && client.isConnected()) {
            client.disconnect().then(done)
        } else {
            done()
        }
    })

    describe('Pub/Sub', () => {
        it('Stream.publish', () => createStream().then((stream) => {
            assert(stream.id)
            console.log(stream.id)
            return stream.publish({
                test: 'Stream.publish',
            })
        }))

        it('client.publish', () => createStream().then((stream) => client.publish(stream.id, {
            test: 'client.publish',
        })))

        it('client.publish with Stream object as arg', () => createStream().then((stream) => client.publish(stream, {
            test: 'client.publish with Stream object as arg',
        })))

        it('client.subscribe with resend', (done) => {
            createStream().then((stream) => {
                // Publish message
                client.publish(stream.id, {
                    test: 'client.subscribe with resend',
                })

                // Check that we're not subscribed yet
                assert.strictEqual(client.subscribedStreams[stream.id], undefined)

                // Add delay: this test needs some time to allow the message to be written to Cassandra
                setTimeout(() => {
                    const sub = client.subscribe({
                        stream: stream.id,
                        resend_last: 1,
                    }, async (parsedContent, streamMessage) => {
                        // Check message content
                        assert.strictEqual(parsedContent.test, 'client.subscribe with resend')

                        // Check signature stuff
                        const subStream = client.subscribedStreams[stream.id]
                        const publishers = await subStream.getPublishers()
                        const requireVerification = await subStream.getVerifySignatures()
                        assert.strictEqual(requireVerification, true)
                        assert.deepStrictEqual(publishers, [client.signer.address.toLowerCase()])
                        assert.strictEqual(streamMessage.signatureType, 1)
                        assert(streamMessage.publisherAddress)
                        assert(streamMessage.signature)

                        // All good, unsubscribe
                        client.unsubscribe(sub)
                        sub.on('unsubscribed', () => {
                            assert.strictEqual(client.subscribedStreams[stream.id], undefined)
                            done()
                        })
                    })
                }, 10000)
            })
        }, 15000)

        it('client.subscribe (realtime)', (done) => {
            const id = Date.now()
            createStream().then((stream) => {
                const sub = client.subscribe({
                    stream: stream.id,
                }, (parsedContent, streamMessage) => {
                    assert.equal(parsedContent.id, id)

                    // Check signature stuff
                    assert.strictEqual(streamMessage.signatureType, 1)
                    assert(streamMessage.publisherAddress)
                    assert(streamMessage.signature)

                    // All good, unsubscribe
                    client.unsubscribe(sub)
                    sub.on('unsubscribed', () => {
                        done()
                    })
                })

                // Publish after subscribed
                sub.on('subscribed', () => {
                    stream.publish({
                        id,
                    })
                })
            })
        })
    })
})
