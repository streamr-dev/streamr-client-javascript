import 'babel-polyfill' // Needed because of mocha
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

    beforeAll(() => {
        clientApiKey = createClient({
            auth: {
                apiKey: 'tester1-api-key',
            },
        })
        clientPrivateKey = createClient({
            auth: {
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
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
        it('Can get token from API key', () => clientApiKey.session.getSessionToken()
            .then((sessionToken) => {
                assert(sessionToken)
            }))
        it('Can get token from private key', () => clientPrivateKey.session.getSessionToken()
            .then((sessionToken) => {
                assert(sessionToken)
            }))
        it('Can get token from username/password', () => clientUsernamePassword.session.getSessionToken()
            .then((sessionToken) => {
                assert(sessionToken)
            }))
    })
})
