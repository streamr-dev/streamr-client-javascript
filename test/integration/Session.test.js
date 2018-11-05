import assert from 'assert'

import StreamrClient from '../../src'
import config from './config'

describe('Session', () => {
    let clientApiKey
    let clientPrivateKey
    let clientUsernamePassword

    const createClient = (opts = {}) => new StreamrClient({
        url: config.websocketUrl,
        restUrl: config.restUrl,
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
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
    })

    describe('Internal state', () => {
        it('should throw when calling getSessionToken() while logging in', async () => {
            clientApiKey.session.options.sessionToken = undefined
            await assertThrowsAsync(async () => Promise.all([
                clientApiKey.session.getSessionToken(),
                clientApiKey.session.getSessionToken(),
            ]), /Error/)
        })
    })
})
