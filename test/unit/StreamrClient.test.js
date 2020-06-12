import assert from 'assert'
import crypto from 'crypto'

import EventEmitter from 'eventemitter3'
import sinon from 'sinon'
import debug from 'debug'
import { Wallet } from 'ethers'
import { ControlLayer, MessageLayer, Errors } from 'streamr-client-protocol'

import FailedToPublishError from '../../src/errors/FailedToPublishError'
import Connection from '../../src/Connection'
import Subscription from '../../src/Subscription'
import { wait } from 'streamr-test-utils'
//import StreamrClient from '../../src/StreamrClient'
import { uid } from '../utils'

// eslint-disable-next-line import/no-named-as-default-member
import StubbedStreamrClient from './StubbedStreamrClient'

const {
    ControlMessage,
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

const { StreamMessage, MessageRef, MessageIDStrict } = MessageLayer
const mockDebug = debug('mock')

describe('StreamrClient', () => {
    let client
    let connection
    let asyncs = []

    const streamPartition = 0
    const sessionToken = 'session-token'

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

    function setupSubscription(
        streamId, emitSubscribed = true, subscribeOptions = {}, handler = sinon.stub(),
        expectSubscribeRequest = !client.getSubscriptions(streamId).length,
    ) {
        assert(client.isConnected(), 'setupSubscription: Client is not connected!')
        const requestId = uid('request')

        if (expectSubscribeRequest) {
            connection.expect(new SubscribeRequest({
                requestId,
                streamId,
                streamPartition,
                sessionToken,
            }))
        }
        const sub = client.subscribe({
            stream: streamId,
            ...subscribeOptions,
        }, handler)

        if (emitSubscribed) {
            connection.emitMessage(new SubscribeResponse({
                streamId: sub.streamId,
                requestId,
                streamPartition,
            }))
        }
        return sub
    }

    function getStreamMessage(streamId = 'stream1', content = {}, publisherId = '') {
        const timestamp = Date.now()
        const requestId = uid('streamMessage')
        return new StreamMessage({
            messageId: new MessageIDStrict(streamId, 0, timestamp, 0, publisherId, ''),
            prevMesssageRef: new MessageRef(timestamp - 100, 0),
            content,
            contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
            signature: '',
            requestId,
        })
    }

    function msg(streamId = 'stream1', content = {}, requestId) {
        const streamMessage = getStreamMessage(streamId, content)
        if (requestId !== undefined) {
            return UnicastMessage(requestId, streamMessage)
        }

        return new BroadcastMessage({
            streamMessage,
        })
    }

    function createConnectionMock() {
        const c = new EventEmitter()
        c.state = Connection.State.DISCONNECTED

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

        c.clearReconnectTimeout = () => {}

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

        c.send = jest.fn(async () => {

        })

        //c.send = async (msgToSend) => {
            //const next = c.expectedMessagesToSend.shift()
            //if (!next) {
                //throw new Error(`Sending unexpected message: ${JSON.stringify(msgToSend)}`)
            //}
            //next.verificationFunction(msgToSend, next.msgToExpect)
        //}

        c.emitMessage = (message) => {
            c.emit(message.type, message)
        }

        //c.expect = (msgToExpect, verificationFunction = (msgToSend, expected) => assert.deepEqual(
            //msgToSend, expected,
            //`Sending unexpected message: ${JSON.stringify(msgToSend)}
                //Expected: ${JSON.stringify(expected)}
                //Queue: ${JSON.stringify(c.expectedMessagesToSend)}`,
        //)) => {
            //c.expectedMessagesToSend.push({
                //msgToExpect,
                //verificationFunction,
            //})
        //}

        //c.checkSentMessages = () => {
            //assert.equal(c.expectedMessagesToSend.length, 0, `Expected messages not sent: ${JSON.stringify(c.expectedMessagesToSend)}`)
        //}

        return c
    }

    let errors = []
    function onError(error) {
        errors.push(error)
    }

    function mockSubscription(...opts) {
        let sub
        connection.send = jest.fn(async (request) => {
            await wait()
            if (request.type === ControlMessage.TYPES.SubscribeRequest) {
                connection.emitMessage(new SubscribeResponse({
                    streamId: sub.streamId,
                    requestId: request.requestId,
                    streamPartition: request.streamPartition,
                }))
            }

            if (request.type === ControlMessage.TYPES.UnsubscribeRequest) {
                connection.emitMessage(new UnsubscribeResponse({
                    streamId: sub.streamId,
                    requestId: request.requestId,
                    streamPartition: request.streamPartition,
                }))
            }
        })
        sub = client.subscribe(...opts).on('error', onError)
        return sub
    }

    const STORAGE_DELAY = 2000

    beforeEach(() => {
        clearAsync()
        connection = createConnectionMock()
        client = new StubbedStreamrClient({
            autoConnect: false,
            autoDisconnect: false,
            verifySignatures: 'never',
            retryResendAfter: STORAGE_DELAY,
            auth: {
                sessionToken: 'session-token',
            },
        }, connection)
        errors = []
        client.on('error', onError)
    })

    afterEach(async () => {
        client.removeListener('error', onError)
        await client.ensureDisconnected()
        expect(errors[0]).toBeFalsy()
        expect(errors).toHaveLength(0)
    })

    afterAll(async () => {
        await wait(3000) // give tests a few more moments to clean up
    })

    describe('connecting behaviour', () => {
        it('connected event should emit an event on client', (done) => {
            client.once('connected', () => {
                done()
            })
            client.connect()
        })

        it('should not send anything if not subscribed to anything', async () => {
            await client.ensureConnected()
            expect(connection.send).not.toHaveBeenCalled()
        })

        it('should send pending subscribes', async () => {
            client.subscribe('stream1', () => {}).on('error', onError)

            await client.ensureConnected()
            await wait()
            expect(connection.send.mock.calls).toHaveLength(1)
            expect(connection.send.mock.calls[0][0]).toMatchObject({
                streamId: 'stream1',
                streamPartition,
                sessionToken,
            })
        })

        it('should send pending subscribes when disconnected and then reconnected', async () => {
            client.subscribe('stream1', () => {}).on('error', onError)
            await client.ensureConnected()
            await connection.disconnect()
            await client.ensureConnected()
            await wait()
            expect(connection.send.mock.calls).toHaveLength(2)
            // On connect
            expect(connection.send.mock.calls[0][0]).toMatchObject({
                streamId: 'stream1',
                streamPartition,
                sessionToken,
            })

            // On reconnect
            expect(connection.send.mock.calls[1][0]).toMatchObject({
                streamId: 'stream1',
                streamPartition,
                sessionToken,
            })
        })
        // TODO convert and move all super mocked tests to integration
    })

    describe('disconnection behaviour', () => {
        beforeEach(async () => client.ensureConnected())

        it('emits disconnected event on client', async (done) => {
            client.once('disconnected', done)
            await connection.disconnect()
        })

        it('does not remove subscriptions', async () => {
            const sub = client.subscribe('stream1', () => {}).on('error', onError)
            await connection.disconnect()
            expect(client.getSubscriptions(sub.streamId)).toEqual([sub])
        })

        it('sets subscription state to unsubscribed', async () => {
            const sub = client.subscribe('stream1', () => {}).on('error', onError)
            await connection.disconnect()
            expect(sub.getState()).toEqual(Subscription.State.unsubscribed)
        })
    })

    describe('SubscribeResponse', () => {
        beforeEach(async () => client.ensureConnected())

        it('marks Subscriptions as subscribed', async (done) => {
            const sub = mockSubscription('stream1', () => {})
            sub.once('subscribed', () => {
                assert.equal(sub.getState(), Subscription.State.subscribed)
                done()
            })
        })

        it('emits a resend request if resend options were given. No second resend if a message is received.', (done) => {
            const sub = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 1,
                },
            }, () => {})
            sub.once('subscribed', async () => {
                await wait(200)
                const requestId = client.resendUtil.findRequestIdForSub(sub)
                const streamMessage = getStreamMessage(sub.streamId, {})
                connection.emitMessage(new UnicastMessage({
                    requestId,
                    streamMessage,
                }))
                await wait(STORAGE_DELAY)
                sub.stop()
                await wait()
                expect(connection.send.mock.calls).toHaveLength(2) // sub + resend
                expect(connection.send.mock.calls[1][0]).toMatchObject({
                    type: ControlMessage.TYPES.ResendLastRequest,
                    streamId: sub.streamId,
                    streamPartition: sub.streamPartition,
                    requestId,
                    numberLast: 1,
                    sessionToken: 'session-token'
                })
                done()
            })
        }, STORAGE_DELAY + 1000)

        it('emits multiple resend requests as per multiple subscriptions. No second resends if messages are received.', async (done) => {
            const sub1 = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 2,
                },
            }, () => {})
            const sub2 = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 1,
                },
            }, () => {})

            let requestId1
            let requestId2

            await Promise.all([
                new Promise((resolve) => {
                    sub1.once('subscribed', () => {
                        setTimeout(() => {
                            requestId1 = client.resendUtil.findRequestIdForSub(sub1)
                            const streamMessage = getStreamMessage(sub1.streamId, {})
                            connection.emitMessage(new UnicastMessage({
                                requestId: requestId1,
                                streamMessage,
                            }))
                            resolve()
                        }, 200)
                    })
                }),
                new Promise((resolve) => {
                    sub2.once('subscribed', () => {
                        setTimeout(() => {
                            requestId2 = client.resendUtil.findRequestIdForSub(sub2)
                            const streamMessage = getStreamMessage(sub2.streamId, {})
                            connection.emitMessage(new UnicastMessage({
                                requestId: requestId2,
                                streamMessage,
                            }))
                            resolve()
                        }, 200)
                    })
                })
            ])

            await wait(STORAGE_DELAY + 400)
            sub1.stop()
            sub2.stop()

            const expectedResponses = [
                new ResendLastRequest({
                    streamId: sub1.streamId,
                    streamPartition: sub1.streamPartition,
                    requestId: requestId1,
                    numberLast: 2,
                    sessionToken: 'session-token',
                }),
                new ResendLastRequest({
                    streamId: sub2.streamId,
                    streamPartition: sub2.streamPartition,
                    requestId: requestId2,
                    numberLast: 1,
                    sessionToken: 'session-token',
                })
            ]
            // eslint-disable-next-line semi-style
            ;[connection.send.mock.calls[1][0], connection.send.mock.calls[2][0]].forEach((actual, index) => {
                const expected = expectedResponses[index]
                expect(actual).toMatchObject({
                    requestId: expected.requestId,
                    streamId: expected.streamId,
                    streamPartition: expected.streamPartition,
                    numberLast: expected.numberLast,
                    sessionToken: expected.sessionToken,
                })
            })
            done()
        }, STORAGE_DELAY + 1000)
    })

    describe('UnsubscribeResponse', () => {
        // Before each test, client is connected, subscribed, and unsubscribe() is called
        let sub
        beforeEach(async (done) => {
            await client.ensureConnected()
            sub = mockSubscription('stream1', () => {})
            sub.once('subscribed', () => done())
        })

        it('removes the subscription', async () => {
            client.unsubscribe(sub)
            await wait()
            expect(client.getSubscriptions(sub.streamId)).toEqual([])
        })

        it('sets Subscription state to unsubscribed', async () => {
            client.unsubscribe(sub)
            await wait()
            expect(sub.getState()).toEqual(Subscription.State.unsubscribed)
        })

        describe('automatic disconnection after last unsubscribe', () => {
            describe('options.autoDisconnect == true', () => {
                beforeEach(() => {
                    client.options.autoDisconnect = true
                })

                it('calls connection.disconnect() when no longer subscribed to any streams', async () => {
                    const disconnect = jest.spyOn(connection, 'disconnect')
                    client.unsubscribe(sub)
                    await wait(100)
                    expect(disconnect).toHaveBeenCalled()
                })
            })

            describe('options.autoDisconnect == false', () => {
                beforeEach(() => {
                    client.options.autoDisconnect = false
                })

                it('should not disconnect if autoDisconnect is set to false', async () => {
                    const disconnect = jest.spyOn(connection, 'disconnect')
                    client.unsubscribe(sub)
                    await wait(100)
                    expect(disconnect).not.toHaveBeenCalled()
                })
            })
        })
    })

    describe('BroadcastMessage', () => {
        let sub

        beforeEach(async () => {
            await client.connect()
            sub = mockSubscription('stream1', () => {})
        })

        it('should call the message handler of each subscription', () => {
            sub.handleBroadcastMessage = jest.fn()

            const sub2 = setupSubscription('stream1')
            sub2.handleBroadcastMessage = jest.fn()
            const requestId = uid('broadcastMessage')
            const msg1 = new BroadcastMessage({
                streamMessage: getStreamMessage(sub.streamId, {}),
                requestId,
            })
            connection.emitMessage(msg1)

            expect(sub.handleBroadcastMessage).toHaveBeenCalledWith(msg1.streamMessage, expect.any(Function))
        })

        it('should not crash if messages are received for unknown streams', () => {
            const requestId = uid('broadcastMessage')
            const msg1 = new BroadcastMessage({
                streamMessage: getStreamMessage('unexpected-stream', {}),
                requestId,
            })
            connection.emitMessage(msg1)
        })

        it('should ensure that the promise returned by the verification function is cached and returned for all handlers', (done) => {
            let firstResult
            sub.handleBroadcastMessage = (message, verifyFn) => {
                firstResult = verifyFn()
                expect(firstResult).toBeInstanceOf(Promise)
                expect(verifyFn()).toBe(firstResult)
            }
            const sub2 = mockSubscription('stream1', () => {})
            sub2.handleBroadcastMessage = (message, verifyFn) => {
                firstResult = verifyFn()
                expect(firstResult).toBeInstanceOf(Promise)
                expect(verifyFn()).toBe(firstResult)
                const secondResult = verifyFn()
                expect(firstResult).toBeInstanceOf(Promise)
                expect(secondResult).toBe(firstResult)
                done()
            }

            const requestId = uid('broadcastMessage')
            const msg1 = new BroadcastMessage({
                streamMessage: getStreamMessage('stream1', {}),
                requestId,
            })
            connection.emitMessage(msg1)
        })
    })

    describe('UnicastMessage', () => {
        let sub

        beforeEach(async (done) => {
            await client.connect()
            sub = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                },
            }, () => {})
                .once('subscribed', () => done())
        })

        it('should call the message handler of specified Subscription', async () => {
            // this sub's handler must be called
            sub.handleResentMessage = jest.fn()
            const requestId = client.resendUtil.findRequestIdForSub(sub)
            expect(requestId).toBeTruthy()

            // this sub's handler must not be called
            const sub2 = mockSubscription('stream1', () => {})
            sub2.handleResentMessage = jest.fn()
            const msg1 = new UnicastMessage({
                streamMessage: getStreamMessage(sub.streamId, {}),
                requestId,
            })
            connection.emitMessage(msg1)
            await wait()
            expect(sub.handleResentMessage).toHaveBeenCalledWith(msg1.streamMessage, requestId, expect.any(Function))
            expect(sub2.handleResentMessage).not.toHaveBeenCalled()
        })

        it('ignores messages for unknown Subscriptions', (done) => {
            sub.handleResentMessage = jest.fn()

            const msg1 = new UnicastMessage({
                streamMessage: getStreamMessage(sub.streamId, {}),
                requestId: 'unknown requestId',
            })
            client.once('error', (err) => {
                errors.pop() // remove this error
                expect(err.message).toEqual(`Received unexpected UnicastMessage message ${msg1.serialize()}`)
                expect(sub.handleResentMessage).not.toHaveBeenCalled()
                done()
            })

            connection.emitMessage(msg1)
        })

        it('should ensure that the promise returned by the verification function is cached', (done) => {
            const requestId = client.resendUtil.findRequestIdForSub(sub)
            sub.handleResentMessage = (message, msgRequestId, verifyFn) => {
                expect(msgRequestId).toEqual(requestId)
                const firstResult = verifyFn()
                expect(firstResult).toBeInstanceOf(Promise)
                expect(firstResult).toBe(verifyFn())
                done()
            }

            const msg1 = new UnicastMessage({
                streamMessage: getStreamMessage(sub.streamId, {}),
                requestId,
            })
            connection.emitMessage(msg1)
        })
    })

    describe('ResendResponseResending', () => {
        let sub

        beforeEach(async (done) => {
            await client.connect()
            sub = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                },
            }, () => {})
                .once('subscribed', () => done())
        })

        it('emits event on associated subscription', async () => {
            sub.handleResending = jest.fn()
            const requestId = client.resendUtil.findRequestIdForSub(sub)
            const resendResponse = new ResendResponseResending({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
            })
            connection.emitMessage(resendResponse)
            await wait()
            expect(sub.handleResending).toHaveBeenCalledWith(resendResponse)
        })

        it('emits error when unknown request id', (done) => {
            sub.handleResending = jest.fn()
            const resendResponse = new ResendResponseResending({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId: 'unknown request id',
            })
            client.once('error', (err) => {
                errors.pop() // remove this err
                expect(err.message).toEqual(`Received unexpected ResendResponseResending message ${resendResponse.serialize()}`)
                expect(sub.handleResending).not.toHaveBeenCalled()
                done()
            })
            connection.emitMessage(resendResponse)
        })
    })

    describe('ResendResponseNoResend', () => {
        let sub

        beforeEach(async (done) => {
            await client.connect()
            sub = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                },
            }, () => {}).once('subscribed', () => done())
        })

        it('calls event handler on subscription', () => {
            sub.handleNoResend = jest.fn()
            const requestId = client.resendUtil.findRequestIdForSub(sub)
            const resendResponse = new ResendResponseNoResend({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
            })
            connection.emitMessage(resendResponse)
            expect(sub.handleNoResend).toHaveBeenCalledWith(resendResponse)
        })

        it('ignores messages for unknown subscriptions', (done) => {
            sub.handleNoResend = jest.fn()
            const resendResponse = new ResendResponseNoResend({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId: 'unknown request id'
            })
            client.once('error', (err) => {
                errors.pop() // remove this err
                expect(err.message).toEqual(`Received unexpected ResendResponseNoResend message ${resendResponse.serialize()}`)
                expect(sub.handleNoResend).not.toHaveBeenCalled()
                done()
            })
            connection.emitMessage(resendResponse)
        })
    })

    describe('ResendResponseResent', () => {
        let sub

        beforeEach(async (done) => {
            await client.connect()
            sub = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                },
            }, () => {}).once('subscribed', () => done())
        })

        it('calls event handler on subscription', () => {
            sub.handleResent = jest.fn()
            const requestId = client.resendUtil.findRequestIdForSub(sub)
            const resendResponse = new ResendResponseResent({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
            })
            connection.emitMessage(resendResponse)
            expect(sub.handleResent).toHaveBeenCalledWith(resendResponse)
        })
        it('does not call event handler for unknown subscriptions', (done) => {
            sub.handleResent = jest.fn()
            const resendResponse = new ResendResponseResent({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId: 'unknown request id',
            })
            client.once('error', (err) => {
                errors.pop() // remove this err
                expect(err.message).toEqual(`Received unexpected ResendResponseResent message ${resendResponse.serialize()}`)
                expect(sub.handleResent).not.toHaveBeenCalled()
                done()
            })
            connection.emitMessage(resendResponse)
        })
    })

    describe('ErrorResponse', () => {
        let sub

        beforeEach(async (done) => {
            await client.connect()
            sub = mockSubscription({
                stream: 'stream1',
                resend: {
                    last: 5,
                }
            }, () => {}).once('subscribed', () => done())
        })

        it('emits an error event on client', (done) => {
            const requestId = client.resendUtil.findRequestIdForSub(sub)
            const errorResponse = new ErrorResponse({
                errorMessage: 'Test error',
                requestId,
                errorCode: 'error code'
            })

            client.once('error', async (err) => {
                errors.pop()
                expect(err.message).toEqual(errorResponse.errorMessage)
                await wait(100)
                done()
            })
            connection.emitMessage(errorResponse)
        })
    })

    describe('error', () => {
        let sub

        beforeEach(async (done) => {
            await client.connect()
            sub = mockSubscription('stream1', () => {}).once('subscribed', () => done())
        })

        it('reports InvalidJsonErrors to subscriptions', (done) => {
            const jsonError = new Errors.InvalidJsonError(
                sub.streamId,
                'invalid json',
                new Error('Invalid JSON: invalid json'),
                getStreamMessage(sub.streamId, {})
            )

            sub.handleError = async (err) => {
                expect(err).toBe(jsonError)
                await wait(100)
                done()
            }
            client.once('error', () => {
                errors.pop()
            })
            connection.emit('error', jsonError)
        })

        it('emits other errors as error events on client', (done) => {
            const testError = new Error('This is a test error message, ignore')

            client.once('error', async (err) => {
                expect(err).toBe(testError)
                await wait(100)
                done()
            })
            client.once('error', () => {
                errors.pop()
            })
            connection.emit('error', testError)
        })
    })

    describe('connect()', () => {
        it('should return a promise which resolves when connected', async () => {
            const result = client.connect()
            expect(result).toBeInstanceOf(Promise)
            await result
        })

        it('should call connection.connect()', () => {
            connection.connect = jest.fn(async () => {})
            client.connect()
            expect(connection.connect).toHaveBeenCalledTimes(1)
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

    describe('resend()', () => {
        async function mockResend(...opts) {
            let sub
            connection.send = jest.fn(async (request) => {
                await wait()
                if (request.type === ControlMessage.TYPES.SubscribeRequest) {
                    connection.emitMessage(new SubscribeResponse({
                        streamId: sub.streamId,
                        requestId: request.requestId,
                        streamPartition,
                    }))
                }

                if (request.type === ControlMessage.TYPES.UnsubscribeRequest) {
                    connection.emitMessage(new UnsubscribeResponse({
                        streamId: sub.streamId,
                        requestId: request.requestId,
                        streamPartition,
                    }))
                }
            })
            sub = await client.resend(...opts)
            sub.on('error', onError)
            return sub
        }

        it('should not send SubscribeRequest on reconnection', async () => {
            await mockResend({
                stream: 'stream1',
                resend: {
                    last: 10
                }
            }, () => {})
            await client.pause()
            await client.connect()
            expect(connection.send.mock.calls.filter(([arg]) => arg.type === ControlMessage.TYPES.SubscribeRequest)).toHaveLength(0)
        })

        it('should not send SubscribeRequest after ResendResponseNoResend on reconnection', async () => {
            const sub = await mockResend({
                stream: 'stream1',
                resend: {
                    last: 10
                }
            }, () => {})
            const requestId = client.resendUtil.findRequestIdForSub(sub)
            const resendResponse = new ResendResponseNoResend({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
            })
            connection.emitMessage(resendResponse)
            await client.pause()
            await client.connect()
            expect(connection.send.mock.calls.filter(([arg]) => arg.type === ControlMessage.TYPES.SubscribeRequest)).toHaveLength(0)
        })

        it('should not send SubscribeRequest after ResendResponseResent on reconnection', async () => {
            const sub = await mockResend({
                stream: 'stream1',
                resend: {
                    last: 10
                }
            }, () => {})

            const requestId = client.resendUtil.findRequestIdForSub(sub)
            const streamMessage = getStreamMessage(sub.streamId, {})
            connection.emitMessage(new UnicastMessage({
                requestId,
                streamMessage,
            }))
            const resendResponse = new ResendResponseResent({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
            })
            connection.emitMessage(resendResponse)
            await client.pause()
            await client.connect()
            expect(connection.send.mock.calls.filter(([arg]) => arg.type === ControlMessage.TYPES.SubscribeRequest)).toHaveLength(0)
        })
    })

    describe('subscribe()', () => {
        it('should call client.connect() if autoConnect is set to true', (done) => {
            client.options.autoConnect = true
            client.once('connected', done)

            client.subscribe('stream1', () => {})
        })

        describe('when connected', () => {
            beforeEach(() => client.connect())

            it('throws an error if no options are given', () => {
                expect(() => {
                    client.subscribe(undefined, () => {})
                }).toThrow()
            })

            it('throws an error if options is wrong type', () => {
                expect(() => {
                    client.subscribe(['streamId'], () => {})
                }).toThrow()
            })

            it('throws an error if no callback is given', () => {
                expect(() => {
                    client.subscribe('stream1')
                }).toThrow()
            })

            it('sends a subscribe request', async (done) => {
                const sub = mockSubscription('stream1', () => {})
                sub.once('subscribed', () => {
                    expect(connection.send.mock.calls[0][0]).toMatchObject({
                        type: ControlMessage.TYPES.SubscribeRequest,
                        streamId: sub.streamId,
                        streamPartition: sub.streamPartition,
                        sessionToken: 'session-token'
                    })
                    done()
                })
            })

            it('sets the group keys if passed as arguments', () => {
                const groupKey = crypto.randomBytes(32)
                const sub = client.subscribe({
                    stream: 'stream1',
                    groupKeys: {
                        publisherId: groupKey
                    }
                }, () => {})
                expect(client.options.subscriberGroupKeys).toHaveProperty('stream1.publisherId.start')
                expect(client.options.subscriberGroupKeys.stream1.publisherId.groupKey).toEqual(groupKey)
                expect(sub.groupKeys['publisherId'.toLowerCase()]).toEqual(groupKey)
            })

            it('sends a subscribe request for a given partition', (done) => {
                const sub = mockSubscription({
                    stream: 'stream1',
                    partition: 5,
                }, () => {}).once('subscribed', () => {
                    expect(connection.send.mock.calls[0][0]).toMatchObject({
                        type: ControlMessage.TYPES.SubscribeRequest,
                        streamId: sub.streamId,
                        streamPartition: 5,
                        sessionToken: 'session-token'
                    })
                    done()
                })
            })

            it('sends subscribe request for each subscribed partition', async () => {
                const tasks = []
                for (let i = 0; i < 3; i++) {
                    tasks.push(new Promise((resolve) => {
                        const s = mockSubscription({
                            stream: 'stream1',
                            partition: i,
                        }, () => {})
                            .once('subscribed', () => resolve(s))
                    }))
                }
                const subs = await Promise.all(tasks)

                subs.forEach((sub, i) => {
                    expect(connection.send.mock.calls[i][0]).toMatchObject({
                        type: ControlMessage.TYPES.SubscribeRequest,
                        streamId: sub.streamId,
                        streamPartition: i,
                    })
                })
            })

            //it('accepts stream id as first argument instead of object', () => {
                //connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))

                //client.subscribe('stream1', () => {})
            //})

            //it('sends only one subscribe request to server even if there are multiple subscriptions for same stream', () => {
                //connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))
                //client.subscribe('stream1', () => {})
                //client.subscribe('stream1', () => {})
            //})

            //it('sets subscribed state on subsequent subscriptions without further subscribe requests', (done) => {
                //connection.expect(SubscribeRequest.create('stream1', 0, 'session-token'))
                //const sub = client.subscribe('stream1', () => {})
                //connection.emitMessage(SubscribeResponse.create(sub.streamId))

                //const sub2 = client.subscribe(sub.streamId, () => {})
                //sub2.on('subscribed', () => {
                    //assert.equal(sub2.getState(), Subscription.State.subscribed)
                    //done()
                //})
            //})

            //describe('with resend options', () => {
                //it('supports resend.from', (done) => {
                    //const ref = new MessageRef(5, 0)
                    //const sub = setupSubscription('stream1', false, {
                        //resend: {
                            //from: {
                                //timestamp: ref.timestamp,
                                //sequenceNumber: ref.sequenceNumber,
                            //},
                            //publisherId: 'publisherId',
                            //msgChainId: '1',
                        //},
                    //})
                    //sub.once('subscribed', () => {
                        //setTimeout(() => connection.emitMessage(msg(sub.streamId, {}, '0')), 200)
                        //setTimeout(() => {
                            //sub.stop()
                            //done()
                        //}, STORAGE_DELAY + 200)
                    //})
                    //connection.expect(ResendFromRequest.create(
                        //sub.streamId, sub.streamPartition, '0', ref.toArray(),
                        //'publisherId', '1', 'session-token',
                    //))
                    //connection.emitMessage(SubscribeResponse.create(sub.streamId))
                //}, STORAGE_DELAY + 1000)

                //it('supports resend.last', (done) => {
                    //const sub = setupSubscription('stream1', false, {
                        //resend: {
                            //last: 5,
                        //},
                    //})
                    //sub.once('subscribed', () => {
                        //setTimeout(() => connection.emitMessage(msg(sub.streamId, {}, '0')), 200)
                        //setTimeout(() => {
                            //sub.stop()
                            //done()
                        //}, STORAGE_DELAY + 200)
                    //})
                    //connection.expect(ResendLastRequest.create(sub.streamId, sub.streamPartition, '0', 5, 'session-token'))
                    //connection.emitMessage(SubscribeResponse.create(sub.streamId))
                //}, STORAGE_DELAY + 1000)

                //it('sends a second ResendLastRequest if no StreamMessage received and a ResendResponseNoResend received', (done) => {
                    //const sub = setupSubscription('stream1', false, {
                        //resend: {
                            //last: 5,
                        //},
                    //})
                    //connection.expect(ResendLastRequest.create(sub.streamId, sub.streamPartition, '0', 5, 'session-token'))
                    //connection.emitMessage(SubscribeResponse.create(sub.streamId))
                    //connection.emitMessage(ResendResponseNoResend.create(sub.streamId, sub.streamPartition, '0'))

                    //setTimeout(() => {
                        //sub.stop()
                        //done()
                    //}, STORAGE_DELAY + 200)
                //}, STORAGE_DELAY + 1000)

                //it('throws if multiple resend options are given', () => {
                    //assert.throws(() => {
                        //client.subscribe({
                            //stream: 'stream1',
                            //resend: {
                                //from: {
                                    //timestamp: 1,
                                    //sequenceNumber: 0,
                                //},
                                //last: 5,
                            //},
                        //}, () => {})
                    //})
                //})
            //})

            //describe('Subscription event handling', () => {
                //describe('gap', () => {
                    //it('sends resend request', () => {
                        //const sub = setupSubscription('stream1')
                        //const fromRef = new MessageRef(1, 0)
                        //const toRef = new MessageRef(5, 0)
                        //connection.expect(ResendRangeRequest.create(
                            //sub.streamId, sub.streamPartition, '0',
                            //fromRef.toArray(), toRef.toArray(), 'publisherId', 'msgChainId', 'session-token',
                        //))
                        //const fromRefObject = {
                            //timestamp: fromRef.timestamp,
                            //sequenceNumber: fromRef.sequenceNumber,
                        //}
                        //const toRefObject = {
                            //timestamp: toRef.timestamp,
                            //sequenceNumber: toRef.sequenceNumber,
                        //}
                        //sub.emit('gap', fromRefObject, toRefObject, 'publisherId', 'msgChainId')
                    //})

                    //it('does not send another resend request while resend is in progress', () => {
                        //const sub = setupSubscription('stream1')
                        //const fromRef = new MessageRef(1, 0)
                        //const toRef = new MessageRef(5, 0)
                        //connection.expect(ResendRangeRequest.create(
                            //sub.streamId, sub.streamPartition, '0',
                            //fromRef.toArray(), toRef.toArray(), 'publisherId', 'msgChainId', 'session-token',
                        //))
                        //const fromRefObject = {
                            //timestamp: fromRef.timestamp,
                            //sequenceNumber: fromRef.sequenceNumber,
                        //}
                        //const toRefObject = {
                            //timestamp: toRef.timestamp,
                            //sequenceNumber: toRef.sequenceNumber,
                        //}
                        //sub.emit('gap', fromRefObject, toRefObject, 'publisherId', 'msgChainId')
                        //sub.emit('gap', fromRefObject, {
                            //timestamp: 10,
                            //sequenceNumber: 0,
                        //}, 'publisherId', 'msgChainId')
                    //})
                //})

                //describe('done', () => {
                    //it('unsubscribes', (done) => {
                        //const sub = setupSubscription('stream1')

                        //client.unsubscribe = (unsub) => {
                            //assert.equal(sub, unsub)
                            //done()
                        //}
                        //sub.emit('done')
                    //})
                //})
            //})
        })
    })

    //describe('unsubscribe()', () => {
        //// Before each, client is connected and subscribed
        //let sub
        //beforeEach(async () => {
            //await client.connect()
            //sub = setupSubscription('stream1', true, {}, sinon.stub().throws())
        //})

        //it('sends an unsubscribe request', () => {
            //connection.expect(UnsubscribeRequest.create(sub.streamId))
            //client.unsubscribe(sub)
        //})

        //it('does not send unsubscribe request if there are other subs remaining for the stream', () => {
            //client.subscribe({
                //stream: sub.streamId,
            //}, () => {})

            //client.unsubscribe(sub)
        //})

        //it('sends unsubscribe request when the last subscription is unsubscribed', (done) => {
            //const sub2 = client.subscribe({
                //stream: sub.streamId,
            //}, () => {})

            //sub2.once('subscribed', () => {
                //client.unsubscribe(sub)

                //connection.expect(UnsubscribeRequest.create(sub.streamId))
                //client.unsubscribe(sub2)
                //done()
            //})
        //})

        //it('does not send an unsubscribe request again if unsubscribe is called multiple times', () => {
            //connection.expect(UnsubscribeRequest.create(sub.streamId))

            //client.unsubscribe(sub)
            //client.unsubscribe(sub)
        //})

        //it('does not send another unsubscribed event if the same Subscription is already unsubscribed', () => {
            //connection.expect(UnsubscribeRequest.create(sub.streamId))
            //const handler = sinon.stub()

            //sub.on('unsubscribed', handler)
            //client.unsubscribe(sub)
            //connection.emitMessage(UnsubscribeResponse.create(sub.streamId))
            //assert.equal(sub.getState(), Subscription.State.unsubscribed)

            //client.unsubscribe(sub)
            //assert.equal(handler.callCount, 1)
        //})

        //it('throws if no Subscription is given', () => {
            //assert.throws(() => {
                //client.unsubscribe()
            //})
        //})

        //it('throws if Subscription is of wrong type', () => {
            //assert.throws(() => {
                //client.unsubscribe(sub.streamId)
            //})
        //})
    //})

    //describe('publish', () => {
        //const pubMsg = {
            //foo: 'bar',
        //}
        //function getPublishRequest(streamId, timestamp, sequenceNumber, prevMsgRef) {
            //const streamMessage = StreamMessage.create(
                //[streamId, 0, timestamp, sequenceNumber, StubbedStreamrClient.hashedUsername, client.msgCreationUtil.msgChainId], prevMsgRef,
                //StreamMessage.CONTENT_TYPES.MESSAGE, StreamMessage.ENCRYPTION_TYPES.NONE, pubMsg, StreamMessage.SIGNATURE_TYPES.NONE, null,
            //)
            //return ControlLayer.PublishRequest.create(streamMessage, 'session-token')
        //}

        //it('queues messages and sends them once connected', (done) => {
            //client.options.autoConnect = true
            //client.options.auth.username = 'username'
            //const ts = Date.now()
            //let prevMsgRef = null
            //for (let i = 0; i < 10; i++) {
                //connection.expect(getPublishRequest('streamId', ts, i, prevMsgRef))
                //client.publish('streamId', pubMsg, ts)
                //prevMsgRef = [ts, i]
            //}
            //connection.on('connected', () => {
                //setTimeout(done, 2000)
            //})
        //})

        //it('accepts timestamp as date instead of number', (done) => {
            //client.options.autoConnect = true
            //client.options.auth.username = 'username'
            //const date = new Date()
            //connection.expect(getPublishRequest('streamId', date.getTime(), 0, null))
            //client.publish('streamId', pubMsg, date)
            //connection.on('connected', () => {
                //setTimeout(done, 1000)
            //})
        //})

        //it('accepts timestamp as date string instead of number', (done) => {
            //client.options.autoConnect = true
            //client.options.auth.username = 'username'
            //connection.expect(getPublishRequest('streamId', 123, 0, null))
            //client.publish('streamId', pubMsg, '1970-01-01T00:00:00.123Z')
            //connection.on('connected', () => {
                //setTimeout(done, 1000)
            //})
        //})

        //it('rejects the promise if autoConnect is false and the client is not connected', (done) => {
            //client.options.auth.username = 'username'
            //client.options.autoConnect = false
            //client.publish('stream1', pubMsg).catch((err) => {
                //expect(err).toBeInstanceOf(FailedToPublishError)
                //done()
            //})
        //})

        //it('subsequent calls to "publish()" should not call "getStream()" (must be cached)', async () => {
            //client.options.auth.username = 'username'
            //await client.connect()

            //const ts = Date.now()
            //connection.expect(getPublishRequest('streamId', ts, 0, null))
            //await client.publish('streamId', pubMsg, ts)
            //assert(client.getStream.called)

            //connection.expect(getPublishRequest('streamId', ts, 1, [ts, 0]))
            //await client.publish('streamId', pubMsg, ts)
            //assert(client.getStream.calledOnce)
        //})
    //})

    //describe('disconnect()', () => {
        //beforeEach(() => client.connect())

        //it('calls connection.disconnect()', (done) => {
            //connection.disconnect = done
            //client.disconnect()
        //})

        //it('resets subscriptions', async () => {
            //const sub = setupSubscription('stream1')
            //await client.disconnect()
            //assert.deepEqual(client.getSubscriptions(sub.streamId), [])
        //})
    //})

    //describe('pause()', () => {
        //beforeEach(() => client.connect())

        //it('calls connection.disconnect()', (done) => {
            //connection.disconnect = done
            //client.pause()
        //})

        //it('does not reset subscriptions', async () => {
            //const sub = setupSubscription('stream1')
            //await client.pause()
            //assert.deepEqual(client.getSubscriptions(sub.streamId), [sub])
        //})
    //})

    //describe('Fields set', () => {
        //it('sets auth.apiKey from authKey', () => {
            //const c = new StubbedStreamrClient({
                //authKey: 'authKey',
            //}, createConnectionMock())
            //assert(c.options.auth.apiKey)
        //})
        //it('sets auth.apiKey from apiKey', () => {
            //const c = new StubbedStreamrClient({
                //apiKey: 'apiKey',
            //}, createConnectionMock())
            //assert(c.options.auth.apiKey)
        //})
        //it('sets private key with 0x prefix', (done) => {
            //connection = createConnectionMock()
            //const c = new StubbedStreamrClient({
                //auth: {
                    //privateKey: '12345564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
                //},
            //}, connection)
            //c.connect()
            //connection.expect(SubscribeRequest.create('0x650EBB201f635652b44E4afD1e0193615922381D'.toLowerCase(), 0, 'session-token'))
            //c.session = {
                //getSessionToken: sinon.stub().resolves('session-token')
            //}
            //c.once('connected', () => {
                //assert(c.options.auth.privateKey.startsWith('0x'))
                //done()
            //})
        //})
        //it('sets unauthenticated', () => {
            //const c = new StubbedStreamrClient({}, createConnectionMock())
            //assert(c.session.options.unauthenticated)
        //})
        //it('sets start time of group key', () => {
            //const groupKey = crypto.randomBytes(32)
            //const c = new StubbedStreamrClient({
                //subscriberGroupKeys: {
                    //streamId: {
                        //publisherId: groupKey
                    //}
                //}
            //}, createConnectionMock())
            //assert.strictEqual(c.options.subscriberGroupKeys.streamId.publisherId.groupKey, groupKey)
            //assert(c.options.subscriberGroupKeys.streamId.publisherId.start)
        //})
        //it('keeps start time passed in the constructor', () => {
            //const groupKey = crypto.randomBytes(32)
            //const c = new StubbedStreamrClient({
                //subscriberGroupKeys: {
                    //streamId: {
                        //publisherId: {
                            //groupKey,
                            //start: 12
                        //}
                    //}
                //}
            //}, createConnectionMock())
            //assert.strictEqual(c.options.subscriberGroupKeys.streamId.publisherId.groupKey, groupKey)
            //assert.strictEqual(c.options.subscriberGroupKeys.streamId.publisherId.start, 12)
        //})
        //it('updates the latest group key with a more recent key', () => {
            //const c = new StubbedStreamrClient({
                //subscriberGroupKeys: {
                    //streamId: {
                        //publisherId: crypto.randomBytes(32)
                    //}
                //}
            //}, createConnectionMock())
            //c.subscribedStreamPartitions = {
                //streamId0: {
                    //setSubscriptionsGroupKeys: sinon.stub()
                //}
            //}
            //const newGroupKey = {
                //groupKey: crypto.randomBytes(32),
                //start: Date.now() + 2000
            //}
            //[> eslint-disable no-underscore-dangle <]
            //c._setGroupKeys('streamId', 'publisherId', [newGroupKey])
            //[> eslint-enable no-underscore-dangle <]
            //assert.strictEqual(c.options.subscriberGroupKeys.streamId.publisherId, newGroupKey)
        //})
        //it('does not update the latest group key with an older key', () => {
            //const groupKey = crypto.randomBytes(32)
            //const c = new StubbedStreamrClient({
                //subscriberGroupKeys: {
                    //streamId: {
                        //publisherId: groupKey
                    //}
                //}
            //}, createConnectionMock())
            //c.subscribedStreamPartitions = {
                //streamId0: {
                    //setSubscriptionsGroupKeys: sinon.stub()
                //}
            //}
            //const oldGroupKey = {
                //groupKey: crypto.randomBytes(32),
                //start: Date.now() - 2000
            //}
            //[> eslint-disable no-underscore-dangle <]
            //c._setGroupKeys('streamId', 'publisherId', [oldGroupKey])
            //[> eslint-enable no-underscore-dangle <]
            //assert.strictEqual(c.options.subscriberGroupKeys.streamId.publisherId.groupKey, groupKey)
        //})
    //})

    //describe('StreamrClient.generateEthereumAccount()', () => {
        //it('generates a new Ethereum account', () => {
            //const result = StubbedStreamrClient.generateEthereumAccount()
            //const wallet = new Wallet(result.privateKey)
            //assert.equal(result.address, wallet.address)
        //})
    //})
})

