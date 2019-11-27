import EventEmitter from 'eventemitter3'
import { ControlLayer } from 'streamr-client-protocol'

export default class ResendUtil extends EventEmitter {
    constructor() {
        super()
        this.subForRequestId = {}
        this.counter = 0
    }

    generateRequestId() {
        const id = this.counter
        this.counter += 1
        return id.toString()
    }

    getSubFromResendResponse(response, responseTypeName) {
        if (!this.subForRequestId[response.subId]) { // TODO: replace with response.requestId
            const error = new Error(`Received unexpected ${responseTypeName} message ${response.serialize()}`)
            this.emit('error', error)
        }
        const sub = this.subForRequestId[response.subId] // TODO: replace with response.requestId
        if (response.type === ControlLayer.ResendResponseResent.TYPE || response.type === ControlLayer.ResendResponseNoResend.TYPE) {
            delete this.subForRequestId[response.subId] // request handled when "no resend" or "resent" is received
        }
        return sub
    }

    registerResendRequestForSub(sub) {
        const requestId = this.generateRequestId()
        this.subForRequestId[requestId] = sub
        sub.addPendingResendRequestId(requestId)
        return requestId
    }
}
