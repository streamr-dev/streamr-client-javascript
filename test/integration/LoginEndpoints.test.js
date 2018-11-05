import 'babel-polyfill' // Needed because of mocha
import assert from 'assert'

import StreamrClient from '../../src'
import config from './config'

const Web3 = require('web3')

const web3 = new Web3()

describe('LoginEndpoints', () => {
    let client

    const createClient = (opts = {}) => new StreamrClient({
        url: config.websocketUrl,
        restUrl: config.restUrl,
        apiKey: 'tester1-api-key',
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    beforeAll(() => {
        client = createClient()
    })

    describe('Challenge generation', () => {
        it('should retrieve a challenge', () => client.getChallenge('some-address')
            .then((challenge) => {
                assert(challenge)
                assert(challenge.id)
                assert(challenge.challenge)
                assert(challenge.expires)
            }))
    })

    async function assertThrowsAsync(fn, regExp) {
        let f = () => {}
        try {
            await fn()
        } catch (e) {
            f = () => {
                throw e
            }
        } finally {
            assert.throws(f, regExp)
        }
    }

    describe('Challenge response', () => {
        it('login should fail', async () => {
            await assertThrowsAsync(async () => client.sendChallengeResponse(
                {
                    id: 'some-id',
                    challenge: 'some-challenge',
                },
                'some-sig',
                'some-address',
            ), /Error/)
        })
        it('login should pass and should receive a session token', () => {
            const account = web3.eth.accounts.create()
            client.getChallenge(account.address)
                .then((challenge) => {
                    assert(challenge.challenge)
                    const signatureObject = account.sign(challenge.challenge)
                    client.sendChallengeResponse(challenge, signatureObject.signature, account.address)
                        .then((sessionToken) => {
                            assert(sessionToken)
                            assert(sessionToken.token)
                            assert(sessionToken.expires)
                        })
                })
        })
        it('login should pass using combined function', () => {
            const account = web3.eth.accounts.create()
            client.loginWithChallengeResponse((d) => account.sign(d).signature, account.address)
                .then((sessionToken) => {
                    assert(sessionToken)
                    assert(sessionToken.token)
                    assert(sessionToken.expires)
                })
        })
    })

    describe('API key login', () => {
        it('login should fail', async () => {
            await assertThrowsAsync(async () => client.loginWithApiKey('apikey'), /Error/)
        })
        it('login should pass', () => client.loginWithApiKey('tester1-api-key')
            .then((sessionToken) => {
                assert(sessionToken)
                assert(sessionToken.token)
                assert(sessionToken.expires)
            }))
    })

    describe('Username/password login', () => {
        it('login should fail', async () => {
            await assertThrowsAsync(async () => client.loginWithUsernamePassword('username', 'password'), /Error/)
        })
        it('login should pass', () => client.loginWithUsernamePassword('tester2@streamr.com', 'tester2')
            .then((sessionToken) => {
                assert(sessionToken)
                assert(sessionToken.token)
                assert(sessionToken.expires)
            }))
    })
})
