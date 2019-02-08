import assert from 'assert'
import EventEmitter from 'eventemitter3'
import sinon from 'sinon'
import debug from 'debug'
import { ControlLayer, MessageLayer, Errors } from 'streamr-client-protocol'
import StreamrClient from '../../src'
import Connection from '../../src/Connection'
import Subscription from '../../src/Subscription'

const {
    BroadcastMessage,
    UnicastMessage,
    SubscribeRequest,
    SubscribeResponse,
    UnsubscribeRequest,
    UnsubscribeResponse,
    ResendLastRequest,
    ResendFromRequest,
    ResendRangeRequest,
    ResendResponseResending,
    ResendResponseResent,
    ResendResponseNoResend,
    ErrorResponse,
} = ControlLayer
const { StreamMessage, StreamMessageV30, MessageRef } = MessageLayer
const mockDebug = debug('mock')

describe('StreamrClient', () => {
    let client
    let connection
    let asyncs = []

    function async(func) {
        const me = setTimeout(() => {
            assert.equal(me, asyncs[0])
            asyncs.shift()
            func()
        }, 0)
        asyncs.push(me)
    }

    function clearAsync() {
        asyncs.forEach((it) => {
            clearTimeout(it)
        })
        asyncs = []
    }

    function setupSubscription(streamId, emitSubscribed = true, subscribeOptions = {}, handler = sinon.stub()) {
        assert(client.isConnected(), 'setupSubscription: Client is not connected!')
        connection.expect(SubscribeRequest.create(streamId))
        const sub = client.subscribe({
            stream: streamId,
            ...subscribeOptions,
        }, handler)

        if (emitSubscribed) {
            connection.emitMessage(SubscribeResponse.create(sub.streamId))
        }
        return sub
    }

    function msg(streamId = 'stream1', content = {}, subId) {
        const timestamp = Date.now()
        const streamMessage = new StreamMessageV30(
            [streamId, 0, timestamp, 0, null], [timestamp - 100, 0],
            StreamMessage.CONTENT_TYPES.JSON, content, StreamMessage.SIGNATURE_TYPES.NONE,
        )
        if (subId !== undefined) {
            return UnicastMessage.create(subId, streamMessage)
        }

        return BroadcastMessage.create(streamMessage)
    }

    function createConnectionMock() {
        const c = new EventEmitter()

        c.expectedMessagesToSend = []

        c.connect = () => new Promise((resolve) => {
            mockDebug('Connection mock: connecting')
            c.state = Connection.State.CONNECTING
            async(() => {
                mockDebug('Connection mock: connected')
                c.state = Connection.State.CONNECTED
                c.emit('connected')
                resolve()
            })
        })

        c.disconnect = () => new Promise((resolve) => {
            mockDebug('Connection mock: disconnecting')
            c.state = Connection.State.DISCONNECTING
            async(() => {
                mockDebug('Connection mock: disconnected')
                c.state = Connection.State.DISCONNECTED
                c.emit('disconnected')
                resolve()
            })
        })

        c.send = (msgToSend) => {
            const next = c.expectedMessagesToSend.shift()
            assert.deepEqual(
                msgToSend, next,
                `Sending unexpected message: ${JSON.stringify(msgToSend)}
                Expected: ${JSON.stringify(next)}
                Queue: ${JSON.stringify(c.expectedMessagesToSend)}`,
            )
        }

        c.emitMessage = (message) => {
            c.emit(message.type, message)
        }

        c.expect = (msgToExpect) => {
            c.expectedMessagesToSend.push(msgToExpect)
        }

        c.checkSentMessages = () => {
            assert.equal(c.expectedMessagesToSend.length, 0, `Expected messages not sent: ${JSON.stringify(c.expectedMessagesToSend)}`)
        }

        return c
    }

    beforeEach(() => {
        clearAsync()
        connection = createConnectionMock()
        client = new StreamrClient({
            autoConnect: false,
            autoDisconnect: false,
            verifySignatures: 'never',
        }, connection)
    })

    afterEach(() => {
        connection.checkSentMessages()
    })

    describe('Connection event handling', () => {
        describe('connected', () => {
            it('should emit an event on client', (done) => {
                client.on('connected', done)
                client.connect()
            })

            it('should not send anything if not subscribed to anything', (done) => {
                client.connect()
                connection.on('connected', done)
            })

            it('should send pending subscribes', (done) => {
                client.subscribe('stream1', () => {})

                connection.expect(SubscribeRequest.create('stream1'))

                client.connect()
                connection.on('connected', done)
            })

            it('should send pending subscribes when disconnected and then reconnected', async () => {
                // On connect
                connection.expect(SubscribeRequest.create('stream1'))
                // On reconnect
                connection.expect(SubscribeRequest.create('stream1'))

                client.subscribe('stream1', () => {})
                await client.connect()
                await connection.disconnect()
                return client.connect()
            })

            it('should not subscribe to unsubscribed streams on reconnect', (done) => {
                // On connect
                connection.expect(SubscribeRequest.create('stream1'))
                // On unsubscribe
                connection.expect(UnsubscribeRequest.create('stream1'))

                const sub = client.subscribe('stream1', () => {})
                client.connect().then(() => {
                    connection.emitMessage(SubscribeResponse.create(sub.streamId))
                    client.unsubscribe(sub)
                    sub.on('unsubscribed', async () => {
                        await client.disconnect()
                        await client.connect()
                        done()
                    })
                    client.connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
                })
            })

            it('should request resend according to sub.getEffectiveResendOptions()', () => {
                const nbToResend = 1
                const sub = client.subscribe({
                    stream: 'stream1',
                    resend_last: nbToResend,
                }, () => {})

                connection.expect(SubscribeRequest.create(sub.streamId))

                connection.on('connected', () => {
                    sub.getEffectiveResendOptions = () => ({
                        resend_last: nbToResend,
                    })
                    connection.expect(ResendLastRequest.create(sub.streamId, sub.streamPartition, sub.id, nbToResend))
                    connection.emitMessage(SubscribeResponse.create(sub.streamId))
                })
                return client.connect()
            })
        })

        describe('disconnected', () => {
            beforeEach(() => client.connect())

            it('emits event on client', (done) => {
                client.on('disconnected', done)
                connection.emit('disconnected')
            })

            it('does not remove subscriptions', () => {
                const sub = setupSubscription('stream1')
                connection.emit('disconnected')
                assert.deepEqual(client.getSubscriptions(sub.streamId), [sub])
            })

            it('sets subscription state to unsubscribed', () => {
                const sub = setupSubscription('stream1')
                connection.emit('disconnected')
                assert.equal(sub.getState(), Subscription.State.unsubscribed)
            })
        })

        describe('SubscribeResponse', () => {
            beforeEach(() => client.connect())

            it('marks Subscriptions as subscribed', () => {
                const sub = setupSubscription('stream1')
                assert.equal(sub.getState(), Subscription.State.subscribed)
            })

            it('emits a resend request if resend options were given', (done) => {
                const sub = setupSubscription('stream1', false, {
                    resend_last: 1,
                })
                connection.expect(ResendLastRequest.create(sub.streamId, sub.streamPartition, sub.id, 1))
                connection.emitMessage(SubscribeResponse.create(sub.streamId))
                setTimeout(() => {
                    done()
                }, 1000)
            })

            it('emits multiple resend requests as per multiple subscriptions', () => {
                connection.expect(SubscribeRequest.create('stream1'))

                const sub1 = client.subscribe({
                    stream: 'stream1', resend_last: 2,
                }, () => {})
                const sub2 = client.subscribe({
                    stream: 'stream1', resend_last: 1,
                }, () => {})

                connection.expect(ResendLastRequest.create(sub1.streamId, sub1.streamPartition, sub1.id, 2))
                connection.expect(ResendLastRequest.create(sub2.streamId, sub2.streamPartition, sub2.id, 1))

                connection.emitMessage(SubscribeResponse.create(sub1.streamId))
            })
        })

        describe('UnsubscribeResponse', () => {
            // Before each test, client is connected, subscribed, and unsubscribe() is called
            let sub
            beforeEach(async () => {
                await client.connect()
                sub = setupSubscription('stream1')

                sub.on('subscribed', () => {
                    connection.expect(UnsubscribeRequest.create(sub.streamId))
                    client.unsubscribe(sub)
                })
            })

            it('removes the subscription', () => {
                connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
                assert.deepEqual(client.getSubscriptions(sub.streamId), [])
            })

            it('sets Subscription state to unsubscribed', () => {
                connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
                assert.equal(sub.getState(), Subscription.State.unsubscribed)
            })

            describe('automatic disconnection after last unsubscribe', () => {
                describe('options.autoDisconnect == true', () => {
                    beforeEach(() => {
                        client.options.autoDisconnect = true
                    })

                    it('calls connection.disconnect() when no longer subscribed to any streams', (done) => {
                        connection.disconnect = done
                        connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
                    })
                })

                describe('options.autoDisconnect == false', () => {
                    beforeEach(() => {
                        client.options.autoDisconnect = false
                    })

                    it('should not disconnect if autoDisconnect is set to false', () => {
                        connection.disconnect = sinon.stub().throws('Should not call disconnect!')
                        connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
                    })
                })
            })
        })

        describe('BroadcastMessage', () => {
            beforeEach(() => client.connect())

            it('should call the message handler of each subscription', (done) => {
                connection.expect(SubscribeRequest.create('stream1'))

                const counter = sinon.stub()
                counter.onFirstCall().returns(1)
                counter.onSecondCall().returns(2)

                client.subscribe({
                    stream: 'stream1',
                }, () => {
                    const c = counter()
                    if (c === 2) {
                        done()
                    } else {
                        assert.strictEqual(c, 1)
                    }
                })
                client.subscribe({
                    stream: 'stream1',
                }, () => {
                    const c = counter()
                    if (c === 2) {
                        done()
                    } else {
                        assert.strictEqual(c, 1)
                    }
                })

                connection.emitMessage(SubscribeRequest.create('stream1'))
                connection.emitMessage(msg())
            })

            it('should not crash if messages are received for unknown streams', () => {
                setupSubscription('stream1', true, {}, sinon.stub().throws())
                connection.emitMessage(msg('unexpected-stream'))
            })

            it('does not mutate messages', (done) => {
                const sentContent = {
                    foo: 'bar',
                }

                const sub = setupSubscription('stream1', true, {}, (receivedContent) => {
                    assert.deepEqual(sentContent, receivedContent)
                    done()
                })

                connection.emitMessage(msg(sub.streamId, sentContent))
            })
        })

        describe('UnicastMessage', () => {
            beforeEach(() => client.connect())

            it('should call the message handler of specified Subscription', (done) => {
                connection.expect(SubscribeRequest.create('stream1'))

                // this sub's handler must not be called
                client.subscribe({
                    stream: 'stream1',
                }, sinon.stub().throws())

                // this sub's handler must be called
                const sub2 = client.subscribe({
                    stream: 'stream1',
                }, () => {
                    done()
                })

                connection.emitMessage(SubscribeResponse.create(sub2.streamId))
                connection.emitMessage(msg(sub2.streamId, {}, sub2.id), sub2.id)
            })

            it('ignores messages for unknown Subscriptions', () => {
                const sub = setupSubscription('stream1', true, {}, sinon.stub().throws())
                connection.emitMessage(msg(sub.streamId, {}, 'unknown subId'), 'unknown subId')
            })

            it('does not mutate messages', (done) => {
                const sentContent = {
                    foo: 'bar',
                }

                const sub = setupSubscription('stream1', true, {}, (receivedContent) => {
                    assert.deepEqual(sentContent, receivedContent)
                    done()
                })

                connection.emitMessage(msg(sub.streamId, sentContent, sub.id), sub.id)
            })
        })

        describe('ResendResponseResending', () => {
            beforeEach(() => client.connect())

            it('emits event on associated subscription', (done) => {
                const sub = setupSubscription('stream1')
                const resendResponse = ResendResponseResending.create(sub.streamId, sub.streamPartition, sub.id)
                sub.on('resending', (event) => {
                    assert.deepEqual(event, [resendResponse.streamId, resendResponse.streamPartition, resendResponse.subId])
                    done()
                })
                connection.emitMessage(resendResponse)
            })
            it('ignores messages for unknown subscriptions', () => {
                const sub = setupSubscription('stream1')
                const resendResponse = ResendResponseResending.create(sub.streamId, sub.streamPartition, 'unknown subid')
                sub.on('resending', sinon.stub().throws())
                connection.emitMessage(resendResponse)
            })
        })

        describe('ResendResponseNoResend', () => {
            beforeEach(() => client.connect())

            it('emits event on associated subscription', (done) => {
                const sub = setupSubscription('stream1')
                const resendResponse = ResendResponseNoResend.create(sub.streamId, sub.streamPartition, sub.id)
                sub.on('no_resend', (event) => {
                    assert.deepEqual(event, [resendResponse.streamId, resendResponse.streamPartition, resendResponse.subId])
                    done()
                })
                connection.emitMessage(resendResponse)
            })
            it('ignores messages for unknown subscriptions', () => {
                const sub = setupSubscription('stream1')
                const resendResponse = ResendResponseNoResend.create(sub.streamId, sub.streamPartition, 'unknown subid')
                sub.on('no_resend', sinon.stub().throws())
                connection.emitMessage(resendResponse)
            })
        })

        describe('ResendResponseResent', () => {
            beforeEach(() => client.connect())

            it('emits event on associated subscription', (done) => {
                const sub = setupSubscription('stream1')
                const resendResponse = ResendResponseResent.create(sub.streamId, sub.streamPartition, sub.id)
                sub.on('resent', (event) => {
                    assert.deepEqual(event, [resendResponse.streamId, resendResponse.streamPartition, resendResponse.subId])
                    done()
                })
                connection.emitMessage(resendResponse)
            })
            it('ignores messages for unknown subscriptions', () => {
                const sub = setupSubscription('stream1')
                const resendResponse = ResendResponseResent.create(sub.streamId, sub.streamPartition, 'unknown subid')
                sub.on('resent', sinon.stub().throws())
                connection.emitMessage(resendResponse)
            })
        })

        describe('ErrorResponse', () => {
            beforeEach(() => client.connect())

            it('emits an error event on client', (done) => {
                setupSubscription('stream1')
                const errorResponse = ErrorResponse.create('Test error')

                client.on('error', (err) => {
                    assert.equal(err.message, errorResponse.errorMessage)
                    done()
                })
                connection.emitMessage(errorResponse)
            })
        })

        describe('error', () => {
            beforeEach(() => client.connect())

            it('reports InvalidJsonErrors to subscriptions', (done) => {
                const sub = setupSubscription('stream1')
                const jsonError = new Errors.InvalidJsonError(sub.streamId)

                sub.handleError = (err) => {
                    assert.equal(err, jsonError)
                    done()
                }
                connection.emit('error', jsonError)
            })

            it('emits other errors as error events on client', (done) => {
                setupSubscription('stream1')
                const testError = new Error('This is a test error message, ignore')

                client.on('error', (err) => {
                    assert.equal(err, testError)
                    done()
                })
                connection.emit('error', testError)
            })
        })
    })

    describe('connect()', () => {
        it('should return a promise which resolves when connected', () => {
            const result = client.connect()
            assert(result instanceof Promise)
            return result
        })

        it('should call connection.connect()', () => {
            connection.connect = sinon.stub().resolves()
            client.connect()
            assert(connection.connect.calledOnce)
        })

        it('should reject promise while connecting', (done) => {
            connection.state = Connection.State.CONNECTING
            client.connect().catch(() => done())
        })

        it('should reject promise when connected', (done) => {
            connection.state = Connection.State.CONNECTED
            client.connect().catch(() => done())
        })
    })

    describe('subscribe()', () => {
        it('should call client.connect() if autoConnect is set to true', (done) => {
            client.options.autoConnect = true
            client.on('connected', done)

            connection.expect(SubscribeRequest.create('stream1'))
            client.subscribe('stream1', () => {})
        })

        describe('when connected', () => {
            beforeEach(() => client.connect())

            it('throws an error if no options are given', () => {
                assert.throws(() => {
                    client.subscribe(undefined, () => {})
                })
            })

            it('throws an error if options is wrong type', () => {
                assert.throws(() => {
                    client.subscribe(['streamId'], () => {})
                })
            })

            it('throws an error if no callback is given', () => {
                assert.throws(() => {
                    client.subscribe('stream1')
                })
            })

            it('sends a subscribe request', () => {
                connection.expect(SubscribeRequest.create('stream1'))

                client.subscribe({
                    stream: 'stream1',
                }, () => {})
            })

            it('accepts stream id as first argument instead of object', () => {
                connection.expect(SubscribeRequest.create('stream1'))

                client.subscribe('stream1', () => {})
            })

            it('sends only one subscribe request to server even if there are multiple subscriptions for same stream', () => {
                connection.expect(SubscribeRequest.create('stream1'))
                client.subscribe('stream1', () => {})
                client.subscribe('stream1', () => {})
            })

            it('sets subscribed state on subsequent subscriptions without further subscribe requests', (done) => {
                connection.expect(SubscribeRequest.create('stream1'))
                const sub = client.subscribe('stream1', () => {})
                connection.emitMessage(SubscribeResponse.create(sub.streamId))

                const sub2 = client.subscribe(sub.streamId, () => {})
                sub2.on('subscribed', () => {
                    assert.equal(sub2.getState(), Subscription.State.subscribed)
                    done()
                })
            })

            describe('with resend options', () => {
                it('supports resend_from', () => {
                    const ref = new MessageRef(5, 0)
                    const sub = setupSubscription('stream1', false, {
                        resend_from: ref,
                        resend_publisher: 'publisherId',
                    })
                    connection.expect(ResendFromRequest.create(sub.streamId, sub.streamPartition, sub.id, ref, 'publisherId'))
                    connection.emitMessage(SubscribeResponse.create(sub.streamId))
                })

                it('supports resend_last', () => {
                    const sub = setupSubscription('stream1', false, {
                        resend_last: 5,
                    })
                    connection.expect(ResendLastRequest.create(sub.streamId, sub.streamPartition, sub.id, 5))
                    connection.emitMessage(SubscribeResponse.create(sub.streamId))
                })

                it('throws if multiple resend options are given', () => {
                    assert.throws(() => {
                        client.subscribe({
                            stream: 'stream1', resend_from: 1, resend_last: 5,
                        }, () => {})
                    })
                })
            })

            describe('Subscription event handling', () => {
                describe('gap', () => {
                    it('sends resend request', () => {
                        const sub = setupSubscription('stream1')
                        const fromRef = new MessageRef(1, 0)
                        const toRef = new MessageRef(5, 0)
                        connection.expect(ResendRangeRequest.create(sub.streamId, sub.streamPartition, sub.id, fromRef, toRef))

                        sub.emit('gap', fromRef, toRef)
                    })

                    it('does not send another resend request while resend is in progress', () => {
                        const sub = setupSubscription('stream1')
                        const fromRef = new MessageRef(1, 0)
                        const toRef = new MessageRef(5, 0)
                        connection.expect(ResendRangeRequest.create(sub.streamId, sub.streamPartition, sub.id, fromRef, toRef))

                        sub.emit('gap', fromRef, toRef)
                        sub.emit('gap', fromRef, new MessageRef(10, 0))
                    })
                })

                describe('done', () => {
                    it('unsubscribes', (done) => {
                        const sub = setupSubscription('stream1')

                        client.unsubscribe = (unsub) => {
                            assert.equal(sub, unsub)
                            done()
                        }
                        sub.emit('done')
                    })
                })
            })
        })
    })

    describe('unsubscribe()', () => {
        // Before each, client is connected and subscribed
        let sub
        beforeEach(async () => {
            await client.connect()
            sub = setupSubscription('stream1', true, {}, sinon.stub().throws())
        })

        it('sends an unsubscribe request', () => {
            connection.expect(UnsubscribeRequest.create(sub.streamId))
            client.unsubscribe(sub)
        })

        it('does not send unsubscribe request if there are other subs remaining for the stream', () => {
            client.subscribe({
                stream: sub.streamId,
            }, () => {})

            client.unsubscribe(sub)
        })

        it('sends unsubscribe request when the last subscription is unsubscribed', (done) => {
            const sub2 = client.subscribe({
                stream: sub.streamId,
            }, () => {})

            sub2.once('subscribed', () => {
                client.unsubscribe(sub)

                connection.expect(UnsubscribeRequest.create(sub.streamId))
                client.unsubscribe(sub2)
                done()
            })
        })

        it('does not send an unsubscribe request again if unsubscribe is called multiple times', () => {
            connection.expect(UnsubscribeRequest.create(sub.streamId))

            client.unsubscribe(sub)
            client.unsubscribe(sub)
        })

        it('does not send another unsubscribed event if the same Subscription is already unsubscribed', () => {
            connection.expect(UnsubscribeRequest.create(sub.streamId))
            const handler = sinon.stub()

            sub.on('unsubscribed', handler)
            client.unsubscribe(sub)
            connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
            assert.equal(sub.getState(), Subscription.State.unsubscribed)

            client.unsubscribe(sub)
            assert.equal(handler.callCount, 1)
        })

        it('throws if no Subscription is given', () => {
            assert.throws(() => {
                client.unsubscribe()
            })
        })

        it('throws if Subscription is of wrong type', () => {
            assert.throws(() => {
                client.unsubscribe(sub.streamId)
            })
        })
    })

    describe('disconnect()', () => {
        beforeEach(() => client.connect())

        it('calls connection.disconnect()', (done) => {
            connection.disconnect = done
            client.disconnect()
        })

        it('resets subscriptions', async () => {
            const sub = setupSubscription('stream1')
            await client.disconnect()
            assert.deepEqual(client.getSubscriptions(sub.streamId), [])
        })
    })

    describe('pause()', () => {
        beforeEach(() => client.connect())

        it('calls connection.disconnect()', (done) => {
            connection.disconnect = done
            client.pause()
        })

        it('does not reset subscriptions', async () => {
            const sub = setupSubscription('stream1')
            await client.pause()
            assert.deepEqual(client.getSubscriptions(sub.streamId), [sub])
        })
    })

    describe('Fields set', () => {
        it('sets auth.apiKey from authKey', () => {
            const c = new StreamrClient({
                authKey: 'authKey',
            })
            assert(c.options.auth.apiKey)
        })
        it('sets auth.apiKey from apiKey', () => {
            const c = new StreamrClient({
                apiKey: 'apiKey',
            })
            assert(c.options.auth.apiKey)
        })
        it('sets private key with 0x prefix', () => {
            const c = new StreamrClient({
                auth: {
                    privateKey: '12345564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
                },
            })
            assert(c.options.auth.privateKey.startsWith('0x'))
        })
        it('sets unauthenticated', () => {
            const c = new StreamrClient()
            assert(c.session.options.unauthenticated)
        })
    })
})
