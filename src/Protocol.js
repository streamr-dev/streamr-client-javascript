const CONTENT_TYPE_JSON = 27
const FIELDS_BY_PROTOCOL_VERSION =  {
    '28': ['version', 'streamId', 'streamPartition', 'timestamp', 'ttl', 'offset', 'previousOffset', 'contentType', 'content']
}
const MESSAGE_TYPES = ['b', 'u', 'subscribed', 'unsubscribed', 'resending', 'resent', 'no_resend']
const BYE_KEY = '_bye'

export function decodeBrowserWrapper(rawMsg) {
    let jsonMsg = JSON.parse(rawMsg)
    let version = jsonMsg[0]
    if (version !== 0) {
        throw 'Unknown message version: '+version
    }

    return {
        type: MESSAGE_TYPES[jsonMsg[1]],
        subId: jsonMsg[2],
        msg: jsonMsg[3]
    }
}

export function decodeMessage(type, message) {
    if (type === 'b' || type === 'u') {
        if (FIELDS_BY_PROTOCOL_VERSION[message[0]] === undefined) {
            throw 'Unsupported version: ' + message[0]
        }
        let result = {}
        let fields = FIELDS_BY_PROTOCOL_VERSION[message[0]]

        for (let i = 0; i < message.length; i++) {

            // Parse content if necessary
            if (fields[i] === 'content') {
                if (result.contentType === CONTENT_TYPE_JSON) {
                    message[i] = JSON.parse(message[i])
                } else {
                    throw 'Unknown content type: ' + result.contentType
                }
            }

            result[fields[i]] = message[i]
        }
        return result
    } else {
        return message
    }
}

export function createSubscribeRequest(stream, resendOptions) {
    let req = {
        stream: stream
    }
    Object.keys(resendOptions).forEach(function(key) {
        req[key] = resendOptions[key]
    })
    return req
}

export function isByeMessage(message) {
    return !!message[BYE_KEY]
}
