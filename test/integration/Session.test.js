import assert from 'assert'

import StreamrClient from '../../src'
import config from './config'

describe('Session', () => {
    let clientApiKey
    let clientWrongApiKey
    let clientPrivateKey
    let clientUsernamePassword
    let clientSessionToken
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
        clientWrongApiKey = createClient({
            auth: {
                apiKey: 'wrong-api-key',
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
        clientSessionToken = createClient({
            auth: {
                sessionToken: 'session-token',
            },
        })
        clientNone = createClient({
            auth: {},
        })
    })

    describe('Token retrievals', () => {
        it('should get token from API key', () => clientApiKey.session.getSessionToken()
            .then((sessionToken) => {
                assert(sessionToken)
            }))
        it('should fail to get token from wrong API key', () => clientWrongApiKey.session.getSessionToken()
            .catch((err) => {
                assert(err)
            }))
        it('should get token from private key', () => clientPrivateKey.session.getSessionToken()
            .then((sessionToken) => {
                assert(sessionToken)
            }))
        it('should get token from username/password', () => clientUsernamePassword.session.getSessionToken()
            .then((sessionToken) => {
                assert(sessionToken)
            }))
        it('should get token if set with a token', () => clientSessionToken.session.getSessionToken()
            .then((sessionToken) => {
                assert.strictEqual(sessionToken, clientSessionToken.session.options.sessionToken)
            }))
        it('should return undefined with no authentication', () => clientNone.session.getSessionToken()
            .then((sessionToken) => {
                assert.strictEqual(sessionToken, undefined)
            }))
        it('login function should throw if only session token provided', (done) => clientSessionToken.session.loginFunction()
            .catch((err) => {
                assert.equal(err.toString(), 'Error: Need either "privateKey", "apiKey" or "username"+"password" to login.')
                done()
            }))
        it('login function should throw if no authentication', (done) => clientNone.session.loginFunction()
            .catch((err) => {
                assert.equal(err.toString(), 'Error: Need either "privateKey", "apiKey" or "username"+"password" to login.')
                done()
            }))
    })
})
