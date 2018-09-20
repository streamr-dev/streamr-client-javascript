import assert from 'assert'
import WebsocketRequest from '../../../src/protocol/WebsocketRequest'

describe('WebsocketRequest', () => {
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const msg = {
                type: 'unsubscribe',
                stream: 'id',
                authKey: 'authKey',
            }

            const serialized = new WebsocketRequest(msg.type, msg.stream, msg.authKey).serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
