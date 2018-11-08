import assert from 'assert'

import StreamrClient from '../../src'
import config from './config'

describe('Session', () => {
    let clientApiKey
    let clientPrivateKey
    let clientUsernamePassword
    let clientNone

    const createClient = (opts = {}) => new StreamrClient({
        url: config.websocketUrl,
        restUrl: config.restUrl,
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    beforeAll(() => {
        clientApiKey = createClient({
            auth: {
                apiKey: 'tester1-api-key',
            },
        })
        clientPrivateKey = createClient({
            auth: {
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            },
        })
        clientUsernamePassword = createClient({
            auth: {
                username: 'tester2@streamr.com',
                password: 'tester2',
            },
        })
        clientNone = createClient({
            auth: {},
        })
    })

    describe('Token retrievals succeed', () => {
        it('should get token from API key', () => clientApiKey.session.getSessionToken()
            .then((sessionToken) => {
                assert(sessionToken)
            }))
        it('should get token from private key', () => clientPrivateKey.session.getSessionToken()
            .then((sessionToken) => {
                assert(sessionToken)
            }))
        it('should get token from username/password', () => clientUsernamePassword.session.getSessionToken()
            .then((sessionToken) => {
                assert(sessionToken)
            }))
        it('should fail to get token with no authentication', (done) => clientNone.session.getSessionToken()
            .catch((err) => {
                assert.equal(err.toString(), 'Error: Need either "privateKey", "provider", "apiKey" or "username"+"password" to login.')
                done()
            }))
    })

    describe('Internal state', () => {
        it('should return same value when calling getSessionToken() twice while logging in', () => {
            clientApiKey.session.options.sessionToken = undefined
            const p1 = clientApiKey.session.getSessionToken()
            const p2 = clientApiKey.session.getSessionToken()
            return Promise.all([p1, p2]).then(([sessionToken1, sessionToken2]) => {
                assert.equal(sessionToken1, sessionToken2)
            })
        })
        it('should return different values when retrieving fresh session tokens twice sequentially', async () => {
            clientApiKey.session.options.sessionToken = undefined
            const sessionToken1 = await clientApiKey.session.getSessionToken(true)
            const sessionToken2 = await clientApiKey.session.getSessionToken(true)
            assert.notStrictEqual(sessionToken1, sessionToken2)
        })
        it('should fail both requests', (done) => {
            const p1 = clientNone.session.getSessionToken()
            const p2 = clientNone.session.getSessionToken()
            p1.catch((err) => {
                assert.equal(err.toString(), 'Error: Need either "privateKey", "provider", "apiKey" or "username"+"password" to login.')
            })
            p2.catch((err) => {
                assert.equal(err.toString(), 'Error: Need either "privateKey", "provider", "apiKey" or "username"+"password" to login.')
                done()
            })
        })
    })
})
