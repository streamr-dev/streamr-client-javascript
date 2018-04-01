import EventEmitter from 'eventemitter3'
import debug from 'debug'
import WebSocket from 'ws'

import {decodeBrowserWrapper, decodeMessage} from './Protocol'

export default class Connection extends EventEmitter {
    constructor(options) {
        super()
        if (!options.url) {
            throw 'URL is not defined!'
        }
        this.options = options
        this.connected = false
        this.connecting = false
        this.disconnecting = false

        if (options.autoConnect) {
            this.connect()
        }
    }

    connect() {
        if (!(this.connected || this.connecting)) {
            this.connecting = true

            this.socket = new WebSocket(this.options.url)
            this.socket.binaryType = 'arraybuffer'
            this.emit('connecting')

            this.socket.onopen = () => {
                debug('Connected to ', this.options.url)
                this.connected = true
                this.connecting = false
                this.emit('connected')
            }

            this.socket.onclose = () => {
                if (!this.disconnecting) {
                    debug('Connection lost. Attempting to reconnect')
                    setTimeout(() => {
                        this.connect()
                    }, 2000)
                } else {
                    this.disconnecting = false
                }

                this.connected = false
                this.connecting = false
                this.emit('disconnected')
            }

            this.socket.onmessage = (messageEvent) => {
                let decoded = decodeBrowserWrapper(messageEvent.data)
                this.emit(decoded.type, decodeMessage(decoded.type, decoded.msg), decoded.subId)
            }
        }
    }

    disconnect() {
        if (this.socket !== undefined && (this.connected || this.connecting)) {
            this.disconnecting = true
            this.socket.close()
        }
    }

    send(req) {
        this.socket.send(JSON.stringify(req))
    }
}
