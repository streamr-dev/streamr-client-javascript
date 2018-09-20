import assert from 'assert'
import MessageFromServer from '../../../src/protocol/MessageFromServer'
import StreamMessage from '../../../src/protocol/StreamMessage'
import StreamAndPartition from '../../../src/protocol/StreamAndPartition'
import ErrorResponse from '../../../src/protocol/ErrorResponse'

describe('MessageFromServer', () => {
    describe('version 0', () => {
        describe('deserialize', () => {
            it('correctly parses broadcast messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.BROADCAST, null, [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof StreamMessage)
            })

            it('correctly parses unicast messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.UNICAST, 'subId', [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof StreamMessage)
                assert.equal(result.subId, 'subId')
            })

            it('correctly parses subscribed messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.SUBSCRIBED, 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof StreamAndPartition)
                assert.equal(result.subId, 'subId')
            })

            it('correctly parses unsubscribed messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.UNSUBSCRIBED, 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof StreamAndPartition)
                assert.equal(result.subId, 'subId')
            })

            it('correctly parses resending messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.RESENDING, 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof StreamAndPartition)
                assert.equal(result.subId, 'subId')
            })

            it('correctly parses resent messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.RESENT, 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof StreamAndPartition)
                assert.equal(result.subId, 'subId')
            })

            it('correctly parses no_resend messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.NO_RESEND, 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof StreamAndPartition)
                assert.equal(result.subId, 'subId')
            })

            it('correctly parses error messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.ERROR, null, {
                    error: 'foo',
                }]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof ErrorResponse)
            })
        })

        describe('serialize', () => {
            it('correctly serializes broadcast messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.BROADCAST, null, [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']]

                const serialized = new MessageFromServer(
                    MessageFromServer.MESSAGE_TYPES.BROADCAST,
                    StreamMessage.deserialize(msg[3]),
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes unicast messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.UNICAST, 'subId', [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']]

                const serialized = new MessageFromServer(
                    MessageFromServer.MESSAGE_TYPES.UNICAST,
                    StreamMessage.deserialize(msg[3]),
                    'subId',
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes subscribed messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.SUBSCRIBED, 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const serialized = new MessageFromServer(
                    MessageFromServer.MESSAGE_TYPES.SUBSCRIBED,
                    StreamAndPartition.deserialize(msg[3]),
                    'subId',
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes unsubscribed messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.UNSUBSCRIBED, 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const serialized = new MessageFromServer(
                    MessageFromServer.MESSAGE_TYPES.UNSUBSCRIBED,
                    StreamAndPartition.deserialize(msg[3]),
                    'subId',
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes resending messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.RESENDING, 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const serialized = new MessageFromServer(
                    MessageFromServer.MESSAGE_TYPES.RESENDING,
                    StreamAndPartition.deserialize(msg[3]),
                    'subId',
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes resent messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.RESENT, 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const serialized = new MessageFromServer(
                    MessageFromServer.MESSAGE_TYPES.RESENT,
                    StreamAndPartition.deserialize(msg[3]),
                    'subId',
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes no_resend messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.NO_RESEND, 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const serialized = new MessageFromServer(
                    MessageFromServer.MESSAGE_TYPES.NO_RESEND,
                    StreamAndPartition.deserialize(msg[3]),
                    'subId',
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes error messages', () => {
                const msg = [0, MessageFromServer.MESSAGE_TYPES.RESENT, null, {
                    error: 'foo',
                }]

                const serialized = new MessageFromServer(
                    MessageFromServer.MESSAGE_TYPES.RESENT,
                    ErrorResponse.deserialize(msg[3]),
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })
        })
    })
})
