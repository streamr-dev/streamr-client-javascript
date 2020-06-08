import EventEmitter from 'eventemitter3'
import { ControlMessage } from 'streamr-client-protocol'
import uniqueId from 'lodash.uniqueid'

const uuid = `p${process.pid != null ? process.pid : Date.now()}`

export default class ResendUtil extends EventEmitter {
    constructor() {
        super()
        this.subForRequestId = {}
        this.id = uniqueId(`${uuid}.client`)
    }

    generateRequestId() {
        return uniqueId(`${this.id}-r`)
    }

    _subForRequestIdExists(requestId) {
        return requestId in this.subForRequestId
    }

    getSubFromResendResponse(response) {
        if (!this._subForRequestIdExists(response.requestId)) {
            const error = new Error(`Received unexpected ${response.constructor.name} message ${response.serialize()}`)
            this.emit('error', error)
        }

        return this.subForRequestId[response.requestId]
    }

    deleteDoneSubsByResponse(response) {
        // TODO: replace with response.requestId
        if (response.type === ControlMessage.TYPES.ResendResponseResent || response.type === ControlMessage.TYPES.ResendResponseNoResend) {
            delete this.subForRequestId[response.requestId]
        }
    }

    findRequestIdForSub(sub) {
        return Object.keys(this.subForRequestId).find((id) => (
            this.subForRequestId[id] === sub
        ))
    }

    registerResendRequestForSub(sub) {
        const requestId = this.generateRequestId()
        this.subForRequestId[requestId] = sub
        sub.addPendingResendRequestId(requestId)
        return requestId
    }
}
