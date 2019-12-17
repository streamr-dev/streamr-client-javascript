import { ethers } from 'ethers'
import uuid from 'uuid/v4'

import StreamrClient from '../../src'

import config from './config'

const { wait, waitForCondition } = require('streamr-test-utils')

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

describe('StreamrClient resends', () => {
    describe('resend', () => {
        let client
        let stream

        beforeEach(async () => {
            client = createClient()
            await client.ensureConnected()

            stream = await client.createStream({
                name: uuid(),
            })

            for (let i = 0; i < 10; i++) {
                const message = {
                    msg: `message${i}`,
                }

                // eslint-disable-next-line no-await-in-loop
                await client.publish(stream.id, message)
            }

            await wait(3000) // wait for messages to (hopefully) land in storage
        }, 10 * 1000)

        afterEach(async () => {
            await client.ensureDisconnected()
        })

        it('resend last using resend function', async (done) => {
            for (let i = 0; i < 10; i++) {
                const messages = []

                // eslint-disable-next-line no-await-in-loop
                const sub = await client.resend(
                    {
                        stream: stream.id,
                        resend: {
                            last: 10,
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
                        {
                            msg: 'message3',
                        },
                        {
                            msg: 'message4',
                        },
                        {
                            msg: 'message5',
                        },
                        {
                            msg: 'message6',
                        },
                        {
                            msg: 'message7',
                        },
                        {
                            msg: 'message8',
                        },
                        {
                            msg: 'message9',
                        }
                    ])
                })

                // eslint-disable-next-line no-await-in-loop
                await waitForCondition(() => messages.length === 10)
            }
            done()
        }, 50000)

        it('resend last using subscribe function', async (done) => {
            for (let i = 0; i < 10; i++) {
                const messages = []

                // eslint-disable-next-line no-await-in-loop
                const sub = client.subscribe(
                    {
                        stream: stream.id,
                        resend: {
                            last: 10,
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
                        {
                            msg: 'message3',
                        },
                        {
                            msg: 'message4',
                        },
                        {
                            msg: 'message5',
                        },
                        {
                            msg: 'message6',
                        },
                        {
                            msg: 'message7',
                        },
                        {
                            msg: 'message8',
                        },
                        {
                            msg: 'message9',
                        }
                    ])
                })

                // eslint-disable-next-line no-await-in-loop
                await waitForCondition(() => messages.length === 10)
            }
            done()
        }, 50000)

        it('resend last using subscribe function with realtime', async (done) => {
            const messages = []

            client.subscribe({
                stream: stream.id,
                resend: {
                    last: 10,
                },
            }, (message) => {
                messages.push(message)
            })

            await waitForCondition(() => messages.length === 10)

            for (let i = 10; i < 15; i++) {
                const message = {
                    msg: `message${i}`,
                }

                // eslint-disable-next-line no-await-in-loop
                await client.publish(stream.id, message)
            }

            await waitForCondition(() => messages.length === 15)

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
                {
                    msg: 'message3',
                },
                {
                    msg: 'message4',
                },
                {
                    msg: 'message5',
                },
                {
                    msg: 'message6',
                },
                {
                    msg: 'message7',
                },
                {
                    msg: 'message8',
                },
                {
                    msg: 'message9',
                },
                {
                    msg: 'message10',
                },
                {
                    msg: 'message11',
                },
                {
                    msg: 'message12',
                },
                {
                    msg: 'message13',
                },
                {
                    msg: 'message14',
                }
            ])
            done()
        }, 10000)
    })
})
