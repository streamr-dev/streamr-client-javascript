import EventEmitter from 'eventemitter3'

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

    getSubFromResendResponse(response, responseType) {
        if (!this.subForRequestId[response.subId]) { // TODO: replace with response.requestId
            const error = new Error(`Received unexpected ${responseType} message ${response.serialize()}`)
            this.emit('error', error)
        }
        return this.subForRequestId[response.subId] // TODO: replace with response.requestId
    }

    registerResendRequestForSub(sub) {
        const requestId = this.generateRequestId()
        this.subForRequestId[requestId] = sub
        return requestId
    }
}
