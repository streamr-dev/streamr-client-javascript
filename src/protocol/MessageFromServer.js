import UnsupportedVersionError from '../errors/UnsupportedVersionError'
import BroadcastMessage from './BroadcastMessage'
import UnicastMessage from './UnicastMessage'
import SubscribeResponse from './SubscribeResponse'
import UnsubscribeResponse from './UnsubscribeResponse'
import ResendResponseResending from './ResendResponseResending'
import ResendResponseResent from './ResendResponseResent'
import ResendResponseNoResend from './ResendResponseNoResend'
import ErrorResponse from './ErrorResponse'

const payloadClassByMessageType = [
    BroadcastMessage, // 0: broadcast
    UnicastMessage, // 1: unicast
    SubscribeResponse, // 2: subscribed
    UnsubscribeResponse, // 3: unsubscribed
    ResendResponseResending, // 4: resending
    ResendResponseResent, // 5: resent
    ResendResponseNoResend, // 6: no_resend
    ErrorResponse, // 7: error
]

const messageTypeByClassName = {
    BroadcastMessage: 0,
    UnicastMessage: 1,
    SubscribeResponse: 2,
    UnsubscribeResponse: 3,
    ResendResponseResending: 4,
    ResendResponseResent: 5,
    ResendResponseNoResend: 6,
    ErrorResponse: 7,
}

class MessageFromServer {
    constructor(payload, subId) {
        this.messageType = messageTypeByClassName[payload.constructor.name]
        if (this.messageType === undefined) {
            throw new Error(`Unexpected payload type: ${payload.constructor.name}`)
        }

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

    static deserialize(stringOrArray) {
        const message = (typeof stringOrArray === 'string' ? JSON.parse(stringOrArray) : stringOrArray)

        if (message[0] === 0) {
            const payload = payloadClassByMessageType[message[1]].deserialize(message[3])
            return new MessageFromServer(payload, message[2])
        }
        throw UnsupportedVersionError(message[0], 'Supported versions: [0]')
    }
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
