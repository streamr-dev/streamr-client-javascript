import UnsupportedVersionError from '../errors/UnsupportedVersionError'
import StreamMessage from './StreamMessage'
import StreamAndPartition from './StreamAndPartition'
import ErrorResponse from './ErrorResponse'

const PAYLOAD_CLASS_BY_CODE = [
    StreamMessage, // 0: broadcast
    StreamMessage, // 1: unicast
    StreamAndPartition, // 2: subscribed
    StreamAndPartition, // 3: unsubscribed
    StreamAndPartition, // 4: resending
    StreamAndPartition, // 5: resent
    StreamAndPartition, // 6: no_resend
    ErrorResponse, // 7: error
]

class MessageFromServer {
    constructor(messageType, payload, subId) {
        if (PAYLOAD_CLASS_BY_CODE[messageType] === undefined) {
            throw new Error(`Invalid message type: ${JSON.stringify(messageType)}`)
        }
        this.messageType = messageType
        this.payload = payload
        this.subId = subId
    }

    toObject(version = 0) {
        if (version === 0) {
            return [version, this.messageType, this.subId, this.payload.toObject()]
        }
        throw UnsupportedVersionError(version, 'Supported versions: [0]')
    }

    serialize(version = 0) {
        return JSON.stringify(this.toObject(version))
    }
}

MessageFromServer.deserialize = (stringOrArray, parsePayload = true) => {
    const message = (typeof stringOrArray === 'string' ? JSON.parse(stringOrArray) : stringOrArray)

    if (message[0] === 0) {
        const payload = (parsePayload ? PAYLOAD_CLASS_BY_CODE[message[1]].deserialize(message[3]) : message[3])
        return new MessageFromServer(message[1], payload, message[2])
    }
    throw UnsupportedVersionError(message[0], 'Supported versions: [0]')
}

MessageFromServer.MESSAGE_TYPES = {
    BROADCAST: 0,
    UNICAST: 1,
    SUBSCRIBED: 2,
    UNSUBSCRIBED: 3,
    RESENDING: 4,
    RESENT: 5,
    NO_RESEND: 6,
    ERROR: 7,
}

module.exports = MessageFromServer
