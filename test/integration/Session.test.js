import { ethers } from 'ethers'
import { wait } from 'streamr-test-utils'

import { uid } from '../utils'
import StreamrClient from '../../src'
import Session from '../../src/Session'

import config from './config'

describe('Session', () => {
    const createClient = (opts = {}) => new StreamrClient({
        ...config.clientOptions,
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    describe('Token retrievals', () => {
        it('gets the token using api key', async () => {
            expect.assertions(1)
            await expect(createClient({
                auth: {
                    apiKey: 'tester1-api-key',
                },
            }).session.getSessionToken()).resolves.toBeTruthy()
        })

        it('fails when the used api key is invalid', async () => {
            expect.assertions(1)
            await expect(createClient({
                auth: {
                    apiKey: 'wrong-api-key',
                },
            }).session.getSessionToken()).rejects.toMatchObject({
                body: expect.stringMatching(/invalid api key/i),
            })
        })

        it('gets the token using private key', async () => {
            expect.assertions(1)
            await expect(createClient({
                auth: {
                    privateKey: ethers.Wallet.createRandom().privateKey,
                },
            }).session.getSessionToken()).resolves.toBeTruthy()
        })

        it('fails if trying to get the token using username and password', async () => {
            expect.assertions(1)
            await expect(() => createClient({
                auth: {
                    username: 'tester2@streamr.com',
                    password: 'tester2',
                },
            }).session.getSessionToken()).rejects.toThrow('no longer supported')
        })

        it('gets no token (undefined) when the auth object is empty', async () => {
            expect.assertions(1)
            await expect(createClient({
                auth: {},
            }).session.getSessionToken()).resolves.toBeUndefined()
        })
    })

    describe('expired session handling', () => {
        it('reauthenticates on Authentication failed', async (done) => {
            const client = createClient({
                auth: {
                    privateKey: ethers.Wallet.createRandom().privateKey,
                },
            })
            await client.session.getSessionToken()
            await client.ensureConnected()
            const stream = await client.createStream({
                name: uid('stream'),
            })
            const message1 = {
                msg: uid('message'),
            }
            const message2 = {
                msg: uid('message'),
            }
            const message3 = {
                msg: uid('message'),
            }
            // invalidate session but step around client logout internals
            // so long as we don't open a websocket connection to the broker e.g. via subscribe
            // then we can get the desired state where client falsely believes it's authenticated
            await client.logoutEndpoint()
            client.once('error', done) // optional, test below also verifies success
            client.publish(stream.id, message1) // sacrificial message, can't recover
            await client.publish(stream.id, message2) // also sacrificial
            // wait for session to reconnect
            await new Promise((resolve) => {
                client.session.once(Session.State.LOGGED_IN, resolve)
            })
            await client.publish(stream.id, message3)
            await wait(5000) // hope it maybe got published
            const messages = []
            // issue resend to verify message arrived
            const sub = await client.resend({
                stream: stream.id,
                resend: {
                    last: 1,
                },
            }, (msg) => {
                messages.push(msg)
            })

            sub.once('initial_resend_done', async () => {
                // message1 & message2 are gone forever, sorry
                expect(messages).toEqual([message3])
                await client.ensureDisconnected()
                done()
            })
        }, 15000)
    })
})
