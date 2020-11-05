import { ControlLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import { Msg, uid, collect, describeRepeats, fakePrivateKey, getWaitForStorage, getPublishTestMessages } from '../utils'
import StreamrClient from '../../src'
import Connection from '../../src/Connection'

import config from './config'

const { ControlMessage } = ControlLayer

/* eslint-disable no-await-in-loop */

const WAIT_FOR_STORAGE_TIMEOUT = 6000
const MAX_MESSAGES = 5

describeRepeats('resends', () => {
    let expectErrors = 0 // check no errors by default
    let onError = jest.fn()
    let client
    let stream
    let published
    let publishTestMessages
    let waitForStorage
    let subscriber

    const createClient = (opts = {}) => {
        const c = new StreamrClient({
            auth: {
                privateKey: fakePrivateKey(),
            },
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
            ...config.clientOptions,
            ...opts,
        })
        c.onError = jest.fn()
        c.on('error', onError)
        return c
    }

    beforeAll(async () => {
        client = createClient()
        subscriber = client.subscriber

        // eslint-disable-next-line require-atomic-updates
        client.debug('connecting before test >>')
        await Promise.all([
            client.connect(),
            client.session.getSessionToken(),
        ])
        stream = await client.createStream({
            name: uid('stream')
        })
        client.debug('connecting before test <<')

        publishTestMessages = getPublishTestMessages(client, stream.id)

        published = await publishTestMessages(MAX_MESSAGES)

        waitForStorage = getWaitForStorage(client)
    })

    beforeAll(async () => {
        const lastMessage = published[published.length - 1]
        await waitForStorage({
            msg: lastMessage,
            timeout: WAIT_FOR_STORAGE_TIMEOUT,
            streamId: stream.id,
        })
    }, WAIT_FOR_STORAGE_TIMEOUT * 2)

    beforeEach(async () => {
        await client.connect()
        expectErrors = 0
        onError = jest.fn()
    })

    afterEach(async () => {
        await wait()
        // ensure no unexpected errors
        expect(onError).toHaveBeenCalledTimes(expectErrors)
        if (client) {
            expect(client.onError).toHaveBeenCalledTimes(expectErrors)
        }
    })

    afterEach(async () => {
        await wait(500)
        if (client) {
            client.debug('disconnecting after test')
            await client.disconnect()
        }

        const openSockets = Connection.getOpen()
        if (openSockets !== 0) {
            throw new Error(`sockets not closed: ${openSockets}`)
        }
    })

    describe('no data', () => {
        let emptyStream

        it('handles nothing to resend', async () => {
            emptyStream = await client.createStream({
                name: uid('stream')
            })
            await wait(3000)

            const sub = await subscriber.resend({
                streamId: emptyStream.id,
                last: 5,
            })

            const receivedMsgs = await collect(sub)
            expect(receivedMsgs).toHaveLength(0)
            expect(subscriber.count(emptyStream.id)).toBe(0)
        })

        it('resendSubscribe with nothing to resend', async () => {
            emptyStream = await client.createStream({
                name: uid('stream')
            })
            const sub = await subscriber.resendSubscribe({
                streamId: emptyStream.id,
                last: 5,
            })

            expect(subscriber.count(emptyStream.id)).toBe(1)
            const message = Msg()
            // eslint-disable-next-line no-await-in-loop
            await client.publish(emptyStream.id, message)

            const received = []
            for await (const m of sub) {
                received.push(m)
                wait(100)
                break
            }
            expect(received).toHaveLength(1)
            expect(subscriber.count(emptyStream.id)).toBe(0)
        })
    })

    describe('with resend data', () => {
        beforeEach(async () => {
            // ensure last message is in storage
            const lastMessage = published[published.length - 1]
            await waitForStorage({
                msg: lastMessage,
                timeout: WAIT_FOR_STORAGE_TIMEOUT,
                streamId: stream.id,
            })
        }, WAIT_FOR_STORAGE_TIMEOUT * 1.2)

        it('requests resend', async () => {
            const sub = await subscriber.resend({
                streamId: stream.id,
                last: published.length,
            })
            const receivedMsgs = await collect(sub)
            expect(receivedMsgs).toHaveLength(published.length)
            expect(receivedMsgs).toEqual(published)
            expect(subscriber.count(stream.id)).toBe(0)
        })

        it('requests resend number', async () => {
            const sub = await subscriber.resend({
                streamId: stream.id,
                last: 2,
            })

            const receivedMsgs = await collect(sub)
            expect(receivedMsgs).toHaveLength(2)
            expect(receivedMsgs).toEqual(published.slice(-2))
            expect(subscriber.count(stream.id)).toBe(0)
        })

        it('closes stream', async () => {
            const sub = await subscriber.resend({
                streamId: stream.id,
                last: published.length,
            })

            const received = []
            for await (const m of sub) {
                received.push(m)
            }
            expect(received).toHaveLength(published.length)
            expect(subscriber.count(stream.id)).toBe(0)
            expect(sub.stream.readable).toBe(false)
            expect(sub.stream.writable).toBe(false)
        })

        describe('resendSubscribe', () => {
            it('sees resends and realtime', async () => {
                const sub = await subscriber.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                const message = Msg()
                // eslint-disable-next-line no-await-in-loop
                await client.publish(stream.id, message) // should be realtime
                published.push(message)
                const receivedMsgs = await collect(sub, async ({ received }) => {
                    if (received.length === published.length) {
                        await wait()
                        await sub.return()
                    }
                })

                const msgs = receivedMsgs
                expect(msgs).toHaveLength(published.length)
                expect(msgs).toEqual(published)
                expect(subscriber.count(stream.id)).toBe(0)
                expect(sub.realtime.stream.readable).toBe(false)
                expect(sub.realtime.stream.writable).toBe(false)
                expect(sub.resend.stream.readable).toBe(false)
                expect(sub.resend.stream.writable).toBe(false)
            })

            it('sees resends and realtime again', async () => {
                const sub = await subscriber.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                const message = Msg()
                // eslint-disable-next-line no-await-in-loop
                await client.publish(stream.id, message) // should be realtime
                published.push(message)
                await wait(500)
                const receivedMsgs = await collect(sub, async ({ received }) => {
                    if (received.length === published.length) {
                        await sub.return()
                    }
                })

                const msgs = receivedMsgs
                expect(msgs).toHaveLength(published.length)
                expect(msgs).toEqual(published)
                expect(subscriber.count(stream.id)).toBe(0)
                expect(sub.realtime.stream.readable).toBe(false)
                expect(sub.realtime.stream.writable).toBe(false)
                expect(sub.resend.stream.readable).toBe(false)
                expect(sub.resend.stream.writable).toBe(false)
            })

            it('can return before start', async () => {
                const sub = await subscriber.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                expect(subscriber.count(stream.id)).toBe(1)
                const message = Msg()

                await sub.return()
                // eslint-disable-next-line no-await-in-loop
                await client.publish(stream.id, message)
                published.push(message)
                await wait(500)
                const received = []
                for await (const m of sub) {
                    received.push(m)
                }

                expect(received).toHaveLength(0)
                expect(subscriber.count(stream.id)).toBe(0)
                expect(sub.realtime.stream.readable).toBe(false)
                expect(sub.resend.stream.writable).toBe(false)
            })

            it('can end asynchronously', async () => {
                const sub = await subscriber.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                const message = Msg()
                // eslint-disable-next-line no-await-in-loop
                await client.publish(stream.id, message)
                published.push(message)
                await wait(500)

                let t
                let receivedMsgs
                try {
                    receivedMsgs = await collect(sub, async ({ received }) => {
                        if (received.length === published.length) {
                            t = setTimeout(() => {
                                sub.cancel()
                            })
                        }
                    })
                } finally {
                    clearTimeout(t)
                }

                const msgs = receivedMsgs
                expect(msgs).toHaveLength(published.length)
                expect(msgs).toEqual(published)
                expect(subscriber.count(stream.id)).toBe(0)
                expect(sub.realtime.stream.readable).toBe(false)
                expect(sub.resend.stream.writable).toBe(false)
            })

            it('can end inside resend', async () => {
                const unsubscribeEvents = []
                client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (m) => {
                    unsubscribeEvents.push(m)
                })
                const sub = await subscriber.resendSubscribe({
                    streamId: stream.id,
                    last: published.length,
                })

                const message = Msg()
                // eslint-disable-next-line no-await-in-loop
                await client.publish(stream.id, message)
                published.push(message)
                await wait(500)
                const END_AFTER = 3
                const receivedMsgs = await collect(sub, async ({ received }) => {
                    if (received.length === END_AFTER) {
                        await sub.cancel()
                        expect(unsubscribeEvents).toHaveLength(1)
                    }
                })
                const msgs = receivedMsgs
                expect(msgs).toHaveLength(END_AFTER)
                expect(msgs).toEqual(published.slice(0, END_AFTER))
                expect(subscriber.count(stream.id)).toBe(0)
                expect(sub.realtime.stream.readable).toBe(false)
                expect(sub.resend.stream.writable).toBe(false)
            })
        })
    })
})