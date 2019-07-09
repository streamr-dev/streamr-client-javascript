import assert from 'assert'
import crypto from 'crypto'

import fetch from 'node-fetch'
import { MessageLayer } from 'streamr-client-protocol'
import { ethers } from 'ethers'
import uuid from 'uuid/v4'

import StreamrClient from '../../src'

import config from './config'

const { StreamMessage } = MessageLayer

const createClient = (opts = {}) => new StreamrClient({
    url: config.websocketUrl,
    restUrl: config.restUrl,
    auth: {
        privateKey: ethers.Wallet.createRandom().privateKey,
    },
    autoConnect: false,
    autoDisconnect: false,
    ...opts,
})

const wait = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout))

describe('StreamrClient Connection', () => {
    describe('bad config.url', () => {
        it('emits error without autoconnect', async (done) => {
            const client = createClient({
                url: 'asdasd',
                autoConnect: false,
                autoDisconnect: false,
            })
            client.once('error', async (error) => {
                expect(error).toBeTruthy()
                done()
            })
            await client.connect().catch(async (error) => {
                expect(error).toBeTruthy()
            })
        })

        it('rejects on connect without autoconnect', async (done) => {
            const client = createClient({
                url: 'asdasd',
                autoConnect: false,
                autoDisconnect: false,
            })

            await client.connect().catch(async (error) => {
                expect(error).toBeTruthy()
                done()
            })
        })

        it('emits error with autoconnect after first call that triggers connect()', async (done) => {
            const client = createClient({
                url: 'asdasd',
                autoConnect: true,
                autoDisconnect: true,
            })

            const onError = jest.fn()
            client.once('error', onError)

            const stream = await client.createStream({
                name: uuid(),
            }) // this will succeed because it uses restUrl config, not url

            // publish should trigger connect
            await client.publish(stream, {}).catch((error) => {
                expect(error).toBeTruthy()
                // check error is emitted with same error before rejection
                // not clear if emit or reject *should* occur first
                expect(onError).toHaveBeenCalledTimes(1)
                expect(onError).toHaveBeenCalledWith(error)

                done()
            })
        }, 10000)
    })

    describe('bad config.restUrl', () => {
        it('emits error without autoconnect', async (done) => {
            const client = createClient({
                restUrl: 'asdasd',
                autoConnect: false,
                autoDisconnect: false,
            })
            client.once('error', async (error) => {
                expect(error).toBeTruthy()
                done()
            })
        })

        it('emits error with autoconnect', (done) => {
            const client = createClient({
                restUrl: 'asdasd',
                autoConnect: true,
                autoDisconnect: true,
            })
            client.once('error', async (error) => {
                expect(error).toBeTruthy()
                done()
            })
        })
    })

    it('can disconnect before connected', async (done) => {
        const client = createClient()
        client.once('error', done)
        client.connect()
        await client.disconnect()
        done()
    })

    describe('resend', () => {
        let client
        let stream

        let timestamps = []

        beforeEach(async () => {
            client = createClient()
            await client.ensureConnected()

            stream = await client.createStream({
                name: uuid(),
            })

            timestamps = []
            for (let i = 0; i < 5; i++) {
                const message = {
                    msg: `message${i}`,
                }

                // eslint-disable-next-line no-await-in-loop
                const rawMessage = await client.publish(stream.id, message)
                timestamps.push(rawMessage.getStreamMessage().getTimestamp())
            }

            await wait(2000) // wait for messages to (probably) land in storage
        })

        afterEach(async () => {
            await client.disconnect()
        })

        it('resend last', async (done) => {
            const messages = []

            const sub = await client.resend(
                {
                    stream: stream.id,
                    resend: {
                        last: 3,
                    },
                },
                (message) => {
                    messages.push(message)
                },
            )

            sub.once('resent', () => {
                setTimeout(() => {
                    expect(messages).toEqual([
                        {
                            msg: 'message2',
                        },
                        {
                            msg: 'message3',
                        },
                        {
                            msg: 'message4',
                        },
                    ])
                    done()
                }, 2000)
            })
        })

        it('resend from', async (done) => {
            const messages = []

            const sub = await client.resend(
                {
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: timestamps[3],
                        },
                    },
                },
                (message) => {
                    messages.push(message)
                },
            )

            sub.once('resent', () => {
                expect(messages).toEqual([
                    {
                        msg: 'message3',
                    },
                    {
                        msg: 'message4',
                    },
                ])
                done()
            })
        })

        it('resend range', async (done) => {
            const messages = []

            const sub = await client.resend(
                {
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: timestamps[0],
                        },
                        to: {
                            timestamp: timestamps[3] - 1,
                        },
                    },
                },
                (message) => {
                    messages.push(message)
                },
            )

            sub.once('resent', () => {
                expect(messages).toEqual([
                    {
                        msg: 'message0',
                    },
                    {
                        msg: 'message1',
                    },
                    {
                        msg: 'message2',
                    },
                ])
                done()
            })
        })
    })

    describe('ensureConnected', () => {
        it('connects the client', async () => {
            const client = createClient()
            await client.ensureConnected()
            expect(client.isConnected()).toBeTruthy()
            // no error if already connected
            await client.ensureConnected()
            expect(client.isConnected()).toBeTruthy()
            await client.disconnect()
        })

        it('does not error if connecting', async (done) => {
            const client = createClient()
            client.connection.once('connecting', async () => {
                await client.ensureConnected()
                expect(client.isConnected()).toBeTruthy()
                await client.disconnect()
                done()
            })

            await client.connect()
        })

        it('connects if disconnecting', async (done) => {
            const client = createClient()
            client.connection.once('disconnecting', async () => {
                await client.ensureConnected()
                expect(client.isConnected()).toBeTruthy()
                await client.disconnect()
                done()
            })

            await client.connect()
            await client.disconnect()
        })
    })

    describe('ensureDisconnected', () => {
        it('disconnects the client', async () => {
            const client = createClient()
            // no error if already disconnected
            await client.ensureDisconnected()
            await client.connect()
            await client.ensureDisconnected()
            expect(client.isDisconnected()).toBeTruthy()
        })

        it('does not error if disconnecting', async (done) => {
            const client = createClient()
            client.connection.once('disconnecting', async () => {
                await client.ensureDisconnected()
                expect(client.isDisconnected()).toBeTruthy()
                done()
            })
            await client.connect()
            await client.disconnect()
        })

        it('disconnects if connecting', async (done) => {
            const client = createClient()
            client.connection.once('connecting', async () => {
                await client.ensureDisconnected()
                expect(client.isDisconnected()).toBeTruthy()
                done()
            })
            await client.connect()
        })
    })

    describe('connect during disconnect', () => {
        let client
        async function teardown() {
            if (client) {
                client.removeAllListeners('error')
                await client.ensureDisconnected()
                client = undefined
            }
        }

        beforeEach(async () => {
            await teardown()
        })

        afterEach(async () => {
            await teardown()
        })

        it('can reconnect after disconnect', (done) => {
            client = createClient()
            client.once('error', done)
            client.connect()
            client.once('connected', async () => {
                await client.disconnect()
            })
            client.once('disconnected', () => {
                client.connect()
                client.once('connected', async () => {
                    await client.disconnect()
                    done()
                })
            })
        })

        it('can disconnect before connected', async (done) => {
            client = createClient()
            client.once('error', done)
            client.connect()
            await client.disconnect()
            done()
        })

        it('can connect', async (done) => {
            client = createClient()
            await client.connect()

            client.connection.once('disconnecting', async () => {
                await client.connect()
                await client.disconnect()
                done()
            })

            await client.disconnect()
        }, 5000)

        it('will resolve original disconnect', async (done) => {
            client = createClient()

            await client.connect()

            client.connection.once('disconnecting', async () => {
                await client.connect()
            })
            await client.disconnect()
            done() // ok if it ever gets here
        }, 5000)

        it('has connection state transitions in correct order', async (done) => {
            client = createClient()
            const connectionEventSpy = jest.spyOn(client.connection, 'emit')

            await client.connect()

            client.connection.once('disconnecting', async () => {
                await client.connect()
                const eventNames = connectionEventSpy.mock.calls.map(([eventName]) => eventName)
                expect(eventNames).toEqual([
                    'connecting',
                    'connected',
                    'disconnecting',
                    'disconnected', // should disconnect before re-connecting
                    'connecting',
                    'connected',
                ])
                done()
            })
            await client.disconnect()
        }, 5000)

        it('does not try to reconnect', async (done) => {
            client = createClient()

            await client.connect()

            client.connection.once('disconnecting', async () => {
                await client.connect()

                // should not try connecting after disconnect (or any other reason)
                const onConnecting = () => {
                    done(new Error('should not be connecting'))
                }
                client.once('connecting', onConnecting)

                await client.disconnect()
                // wait for possible reconnections
                setTimeout(() => {
                    client.off('connecting', onConnecting)
                    expect(client.isConnected()).toBe(false)
                    done()
                }, 2000)
            })
            await client.disconnect()
        }, 6000)
    })

    describe('publish/subscribe connection handling', () => {
        let client
        async function teardown() {
            if (!client) { return }
            client.removeAllListeners('error')
            await client.ensureDisconnected()
            client = undefined
        }

        beforeEach(async () => {
            await teardown()
        })

        afterEach(async () => {
            await teardown()
        })
        describe('publish', () => {
            it('will connect if not connected if autoconnect set', async (done) => {
                client = createClient({
                    autoConnect: true,
                    autoDisconnect: true,
                })

                client.once('error', done)

                const stream = await client.createStream({
                    name: uuid(),
                })
                await client.ensureDisconnected()

                const message = {
                    id2: uuid(),
                }
                client.once('connected', () => {
                    // wait in case of delayed errors
                    setTimeout(() => done(), 500)
                })
                await client.publish(stream.id, message)
            })

            it('will connect if disconnecting & autoconnect set', async (done) => {
                client = createClient({
                    autoConnect: true,
                    autoDisconnect: true,
                })

                client.once('error', done)
                await client.ensureConnected()
                const stream = await client.createStream({
                    name: uuid(),
                })

                const message = {
                    id1: uuid(),
                }
                const p = client.publish(stream.id, message)
                setTimeout(async () => {
                    await client.disconnect() // start async disconnect after publish started
                })
                await p
                // wait in case of delayed errors
                setTimeout(() => done(), 500)
            })

            it('will error if disconnecting & autoconnect not set', async (done) => {
                client = createClient({
                    autoConnect: false,
                    autoDisconnect: false,
                })

                client.once('error', done)
                await client.ensureConnected()
                const stream = await client.createStream({
                    name: uuid(),
                })

                const message = {
                    id1: uuid(),
                }

                client.publish(stream.id, message).catch((err) => {
                    expect(err).toBeTruthy()
                    done()
                })

                setTimeout(async () => {
                    await client.disconnect() // start async disconnect after publish started
                })
            })
        })
        describe('subscribe', () => {
            it('does not error if disconnect after subscribe', async (done) => {
                client = createClient({
                    autoConnect: true,
                    autoDisconnect: true,
                })

                client.once('error', done)
                await client.ensureConnected()
                const stream = await client.createStream({
                    name: uuid(),
                })

                const sub = client.subscribe({
                    stream: stream.id,
                    resend: {
                        from: {
                            timestamp: 0,
                        },
                    },
                }, () => {})
                sub.once('subscribed', async () => {
                    await client.disconnect()
                    // wait in case of delayed errors
                    setTimeout(() => done(), 500)
                })
            })
        })
    })
})

describe('StreamrClient', () => {
    let client
    let stream

    // These tests will take time, especially on Travis
    const TIMEOUT = 5 * 1000

    const createStream = async () => {
        const name = `StreamrClient-integration-${Date.now()}`
        assert(client.isConnected())

        const s = await client.createStream({
            name,
            requireSignedData: true,
        })

        assert(s.id)
        assert.equal(s.name, name)
        assert.strictEqual(s.requireSignedData, true)
        return s
    }

    beforeEach(async () => {
        try {
            await Promise.all([
                fetch(config.restUrl),
                fetch(config.websocketUrl.replace('ws://', 'http://')),
            ])
        } catch (e) {
            if (e.errno === 'ENOTFOUND' || e.errno === 'ECONNREFUSED') {
                throw new Error('Integration testing requires that engine-and-editor '
                    + 'and data-api ("entire stack") are running in the background. '
                    + 'Instructions: https://github.com/streamr-dev/streamr-docker-dev#running')
            } else {
                throw e
            }
        }

        client = createClient()
        await client.ensureConnected()
        stream = await createStream()
    })

    afterEach(async () => {
        if (client) {
            client.removeAllListeners('error')
            await client.ensureDisconnected()
        }
    })

    describe('Pub/Sub', () => {
        it('client.publish', async (done) => {
            client.once('error', done)
            await client.publish(stream.id, {
                test: 'client.publish',
            })
            setTimeout(() => done(), TIMEOUT * 0.8)
        }, TIMEOUT)

        it('Stream.publish', async (done) => {
            client.once('error', done)
            await stream.publish({
                test: 'Stream.publish',
            })
            setTimeout(() => done(), TIMEOUT * 0.8)
        }, TIMEOUT)

        it('client.publish with Stream object as arg', async (done) => {
            client.once('error', done)
            await client.publish(stream, {
                test: 'client.publish.Stream.object',
            })
            setTimeout(() => done(), TIMEOUT * 0.8)
        }, TIMEOUT)

        it('client.subscribe with resend from', (done) => {
            client.once('error', done)
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
                    resend: {
                        from: {
                            timestamp: 0,
                        },
                    },
                }, async (parsedContent, streamMessage) => {
                    // Check message content
                    assert.strictEqual(parsedContent.test, 'client.subscribe with resend')

                    // Check signature stuff
                    const subStream = client.subscribedStreams[stream.id]
                    const publishers = await subStream.getPublishers()
                    const requireVerification = await subStream.getVerifySignatures()
                    assert.strictEqual(requireVerification, true)
                    const map = {}
                    map[client.signer.address.toLowerCase()] = true
                    assert.deepStrictEqual(publishers, map)
                    assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
                    assert(streamMessage.getPublisherId())
                    assert(streamMessage.signature)

                    // All good, unsubscribe
                    client.unsubscribe(sub)
                    sub.on('unsubscribed', () => {
                        assert.strictEqual(client.subscribedStreams[stream.id], undefined)
                        done()
                    })
                })
            }, TIMEOUT * 0.8)
        }, TIMEOUT)

        it('client.subscribe with resend last', (done) => {
            client.once('error', done)
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
                    resend: {
                        last: 1,
                    },
                }, async (parsedContent, streamMessage) => {
                    // Check message content
                    assert.strictEqual(parsedContent.test, 'client.subscribe with resend')

                    // Check signature stuff
                    const subStream = client.subscribedStreams[stream.id]
                    const publishers = await subStream.getPublishers()
                    const requireVerification = await subStream.getVerifySignatures()
                    assert.strictEqual(requireVerification, true)
                    const map = {}
                    map[client.signer.address.toLowerCase()] = true
                    assert.deepStrictEqual(publishers, map)
                    assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
                    assert(streamMessage.getPublisherId())
                    assert(streamMessage.signature)

                    // All good, unsubscribe
                    client.unsubscribe(sub)
                    sub.on('unsubscribed', () => {
                        assert.strictEqual(client.subscribedStreams[stream.id], undefined)
                        done()
                    })
                })
            }, TIMEOUT * 0.8)
        }, TIMEOUT)

        it('client.subscribe (realtime)', (done) => {
            client.once('error', done)
            const id = Date.now()
            const sub = client.subscribe({
                stream: stream.id,
            }, (parsedContent, streamMessage) => {
                assert.equal(parsedContent.id, id)

                // Check signature stuff
                assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
                assert(streamMessage.getPublisherId())
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

        it('client.subscribe can decrypt encrypted messages if it knows the group key', async (done) => {
            client.once('error', done)
            const id = Date.now()
            const publisherId = await client.getPublisherId()
            const groupKey = crypto.randomBytes(32)
            const keys = {}
            keys[publisherId] = groupKey
            const sub = client.subscribe({
                stream: stream.id,
                groupKeys: keys,
            }, (parsedContent, streamMessage) => {
                assert.equal(parsedContent.id, id)

                // Check signature stuff
                assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
                assert(streamMessage.getPublisherId())
                assert(streamMessage.signature)

                // All good, unsubscribe
                client.unsubscribe(sub)
                sub.on('unsubscribed', () => {
                    done()
                })
            })

            // Publish after subscribed
            sub.on('subscribed', () => {
                client.publish(stream.id, {
                    id,
                }, Date.now(), null, groupKey)
            })
        })

        it('client can publish to own inbox', async (done) => {
            client.once('error', done)
            const id = Date.now()
            const publisherId = await client.getPublisherId()
            const sub = client.subscribe({
                stream: stream.id,
            }, (parsedContent) => {
                assert.equal(parsedContent.id, id)
            })

            // Publish after subscribed
            sub.on('subscribed', () => {
                const sub2 = client.subscribe({
                    stream: publisherId,
                }, (content) => {
                    assert.equal(content.test, 'works')

                    // All good, unsubscribe

                    client.unsubscribe(sub)
                    sub.on('unsubscribed', () => {
                        done()
                    })
                })
                sub2.on('subscribed', () => {
                    client.publish(publisherId, {
                        test: 'works',
                    }, Date.now())
                })
            })
        })
        it('client.subscribe can get the group key and decrypt encrypted messages using an RSA key pair', async (done) => {
            client.once('error', done)
            const id = Date.now()
            const groupKey = crypto.randomBytes(32)
            // subscribe without knowing the group key to decrypt stream messages
            const sub = client.subscribe({
                stream: stream.id,
            }, (parsedContent, streamMessage) => {
                assert.equal(parsedContent.id, id)

                // Check signature stuff
                assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
                assert(streamMessage.getPublisherId())
                assert(streamMessage.signature)

                // Now the subscriber knows the group key
                assert.deepStrictEqual(sub.groupKeys[streamMessage.getPublisherId()], groupKey)

                // All good, unsubscribe
                client.unsubscribe(sub)
                sub.on('unsubscribed', () => {
                    done()
                })
            })

            // Publish after subscribed
            sub.on('subscribed', () => {
                client.publish(stream.id, {
                    id,
                }, Date.now(), null, groupKey)
            })
        }, 300000)
    })
})
