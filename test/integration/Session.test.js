import { ethers } from 'ethers'
import { wait, waitForCondition } from 'streamr-test-utils'

import { uid } from '../utils'
import StreamrClient from '../../src'

import config from './config'

describe('Session', () => {
    const createClient = (opts = {}) => new StreamrClient({
        autoConnect: false,
        autoDisconnect: false,
        ...config.clientOptions,
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
            const message = {
                msg: uid('message'),
            }
            // invalidate session but step around client logout internals
            // so long as we don't open a websocket connection to the broker e.g. via subscribe
            // then we can get the desired state where client falsely believes it's authenticated
            await client.logoutEndpoint()
            client.once('error', done) // optional, test below also verifies success
            await client.publish(stream.id, message)
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
                expect(messages).toEqual([message])
                await client.ensureDisconnected()
                done()
            })
        }, 15000)
    })
})
