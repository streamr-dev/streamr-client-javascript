import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import {
    SubscribeRequest,
    UnsubscribeRequest,
    PublishRequest,
    ResendRequest,
    Errors,
} from 'streamr-client-protocol'

const debug = debugFactory('StreamrClient')

import Subscription from './Subscription'
import Stream from './rest/domain/Stream'
import Connection from './Connection'
import FailedToProduceError from './errors/FailedToProduceError'

export default class StreamrClient extends EventEmitter {
    constructor(options, connection) {
        super()

        // Default options
        this.options = {
            // The server to connect to
            url: 'wss://www.streamr.com/api/v1/ws',
            restUrl: 'https://www.streamr.com/api/v1',
            // Automatically connect on first subscribe
            autoConnect: true,
            // Automatically disconnect on last unsubscribe
            autoDisconnect: true,
            apiKey: null,
        }
        this.subsByStream = {}
        this.subById = {}
        this.publishQueue = []

        Object.assign(this.options, options || {})

        // Backwards compatibility for option 'authKey' => 'apiKey'
        if (this.options.authKey && !this.options.apiKey) {
            this.options.apiKey = this.options.authKey
        }

        // Event handling on connection object
        this.connection = connection || new Connection(this.options)

        // Broadcast messages to all subs listening on stream
        this.connection.on('BroadcastMessage', (msg) => {
            // Notify the Subscriptions for this stream. If this is not the message each individual Subscription
            // is expecting, they will either ignore it or request resend via gap event.
            const subs = this.subsByStream[msg.streamId]
            if (subs) {
                subs.forEach((sub) => {
                    sub.handleMessage(msg, false)
                })
            } else {
                debug('WARN: message received for stream with no subscriptions: %s', msg.streamId)
            }
        })

        // Unicast messages to a specific subscription only
        this.connection.on('UnicastMessage', (msg, sub) => {
            if (sub !== undefined && this.subById[sub] !== undefined) {
                this.subById[sub].handleMessage(msg, true)
            } else {
                debug('WARN: subscription not found for stream: %s, sub: %s', msg.streamId, sub)
            }
        })

        this.connection.on('SubscribeResponse', (response) => {
            if (response.error) {
                this.handleError(`Error subscribing to ${response.stream}: ${response.error}`)
            } else {
                const subs = this.subsByStream[response.streamId]

                // The typeof array === 'object'
                if (subs && typeof subs === 'object') {
                    delete subs.subscribing
                    // Report subscribed to all non-resending Subscriptions for this stream
                    subs.filter((sub) => !sub.resending)
                        .forEach((sub) => {
                            sub.setState(Subscription.State.subscribed)
                        })
                }

                debug('Client subscribed: %o', response)
            }
        })

        this.connection.on('UnsubscribeResponse', (response) => {
            debug('Client unsubscribed: %o', response)

            if (this.subsByStream[response.streamId]) {
                // Copy the list to avoid concurrent modifications
                const l = this.subsByStream[response.streamId].slice()
                l.forEach((sub) => {
                    this._removeSubscription(sub)
                    sub.setState(Subscription.State.unsubscribed)
                })
            }

            this._checkAutoDisconnect()
        })

        // Route resending state messages to corresponding Subscriptions
        this.connection.on('ResendResponseResending', (response) => {
            if (this.subById[response.subId]) {
                this.subById[response.subId].emit('resending', response)
            } else {
                debug('resent: Subscription %d is gone already', response.subId)
            }
        })

        this.connection.on('ResendResponseNoResend', (response) => {
            if (this.subById[response.subId]) {
                this.subById[response.subId].emit('no_resend', response)
            } else {
                debug('resent: Subscription %d is gone already', response.subId)
            }
        })

        this.connection.on('ResendResponseResent', (response) => {
            if (this.subById[response.subId]) {
                this.subById[response.subId].emit('resent', response)
            } else {
                debug('resent: Subscription %d is gone already', response.subId)
            }
        })

        // On connect/reconnect, send pending subscription requests
        this.connection.on('connected', () => {
            debug('Connected!')
            this.emit('connected')

            // Check pending subscriptions
            Object.keys(this.subsByStream)
                .forEach((streamId) => {
                    const subs = this.subsByStream[streamId]
                    subs.forEach((sub) => {
                        if (sub.getState() !== Subscription.State.subscribed) {
                            this._resendAndSubscribe(sub)
                        }
                    })
                })

            // Check pending publish requests
            const publishQueueCopy = this.publishQueue.slice(0)
            this.publishQueue = []
            publishQueueCopy.forEach((args) => {
                this.produceToStream(...args)
            })
        })

        this.connection.on('disconnected', () => {
            debug('Disconnected.')
            this.emit('disconnected')

            Object.keys(this.subsByStream)
                .forEach((streamId) => {
                    const subs = this.subsByStream[streamId]
                    if (subs && typeof subs === 'object') {
                        delete subs.subscribing
                    }
                    subs.forEach((sub) => {
                        sub.setState(Subscription.State.unsubscribed)
                    })
                })
        })

        this.connection.on('ErrorResponse', (err) => {
            const errorObject = new Error(err.errorMessage)
            this.emit('error', errorObject)
            console.error(errorObject.message)
        })

        this.connection.on('error', (err) => {
            // If there is an error parsing a json message in a stream, fire error events on the relevant subs
            if (err instanceof Errors.InvalidJsonError) {
                const subs = this.subsByStream[err.streamId]
                if (subs) {
                    subs.forEach((sub) => {
                        sub.handleError(err)
                    })
                } else {
                    debug('WARN: InvalidJsonError received for stream with no subscriptions: %s', err.streamId)
                }
            } else {
                const errorObject = err instanceof Error ? err : new Error(err)
                this.emit('error', errorObject)
                console.error(errorObject.message)
            }
        })
    }

    _addSubscription(sub) {
        this.subById[sub.id] = sub

        if (!this.subsByStream[sub.streamId]) {
            this.subsByStream[sub.streamId] = [sub]
        } else {
            this.subsByStream[sub.streamId].push(sub)
        }
    }

    _removeSubscription(sub) {
        delete this.subById[sub.id]

        if (this.subsByStream[sub.streamId]) {
            this.subsByStream[sub.streamId] = this.subsByStream[sub.streamId].filter((it) => it !== sub)

            if (this.subsByStream[sub.streamId].length === 0) {
                delete this.subsByStream[sub.streamId]
            }
        }
    }

    getSubscriptions(streamId) {
        return this.subsByStream[streamId] || []
    }

    async produceToStream(streamObjectOrId, data, apiKey = this.options.apiKey) {
        // Validate streamObjectOrId
        let streamId
        if (streamObjectOrId instanceof Stream) {
            streamId = streamObjectOrId.id
        } else if (typeof streamObjectOrId === 'string') {
            streamId = streamObjectOrId
        } else {
            throw new Error(`First argument must be a Stream object or the stream id! Was: ${streamObjectOrId}`)
        }

        // Validate data
        if (typeof data !== 'object') {
            throw new Error(`Message data must be an object! Was: ${data}`)
        }

        // If connected, emit a publish request
        if (this.isConnected()) {
            this._requestPublish(streamId, data, apiKey)
        } else if (this.options.autoConnect) {
            this.publishQueue.push([streamId, data, apiKey])
            this.connect().catch(() => {}) // ignore
        } else {
            throw new FailedToProduceError(
                streamId,
                data,
                'Wait for the "connected" event before calling produceToStream, or set autoConnect to true!',
            )
        }
    }

    subscribe(optionsOrStreamId, callback, legacyOptions) {
        if (!optionsOrStreamId) {
            throw new Error('subscribe: Invalid arguments: subscription options is required!')
        } else if (!callback) {
            throw new Error('subscribe: Invalid arguments: callback is required!')
        }

        // Backwards compatibility for giving a streamId as first argument
        let options
        if (typeof optionsOrStreamId === 'string') {
            options = {
                stream: optionsOrStreamId,
            }
        } else if (typeof optionsOrStreamId === 'object') {
            options = optionsOrStreamId
        } else {
            throw new Error(`subscribe: options must be an object! Given: ${optionsOrStreamId}`)
        }

        // Backwards compatibility for giving an options object as third argument
        Object.assign(options, legacyOptions)

        if (!options.stream) {
            throw new Error('subscribe: Invalid arguments: options.stream is not given')
        }

        // Create the Subscription object and bind handlers
        const sub = new Subscription(options.stream, options.partition || 0, options.apiKey || this.options.apiKey, callback, options)
        sub.on('gap', (from, to) => {
            if (!sub.resending) {
                this._requestResend(sub, {
                    resend_from: from, resend_to: to,
                })
            }
        })
        sub.on('done', () => {
            debug('done event for sub %d', sub.id)
            this.unsubscribe(sub)
        })

        // Add to lookups
        this._addSubscription(sub)

        // If connected, emit a subscribe request
        if (this.connection.state === Connection.State.CONNECTED) {
            this._resendAndSubscribe(sub)
        } else if (this.options.autoConnect) {
            this.connect().catch(() => {}) // ignore
        }

        return sub
    }

    unsubscribe(sub) {
        if (!sub || !sub.streamId) {
            throw new Error('unsubscribe: please give a Subscription object as an argument!')
        }

        // If this is the last subscription for this stream, unsubscribe the client too
        if (this.subsByStream[sub.streamId] !== undefined && this.subsByStream[sub.streamId].length === 1
            && this.isConnected()
            && sub.getState() === Subscription.State.subscribed) {
            sub.setState(Subscription.State.unsubscribing)
            this._requestUnsubscribe(sub.streamId)
        } else if (sub.getState() !== Subscription.State.unsubscribing && sub.getState() !== Subscription.State.unsubscribed) {
            // Else the sub can be cleaned off immediately
            this._removeSubscription(sub)
            sub.setState(Subscription.State.unsubscribed)
            this._checkAutoDisconnect()
        }
    }

    unsubscribeAll(streamId) {
        if (!streamId) {
            throw new Error('unsubscribeAll: a stream id is required!')
        } else if (typeof streamId !== 'string') {
            throw new Error('unsubscribe: stream id must be a string!')
        }

        if (this.subsByStream[streamId]) {
            // Copy the list to avoid concurrent modifications
            const l = this.subsByStream[streamId].slice()
            l.forEach((sub) => {
                this.unsubscribe(sub)
            })
        }
    }

    isConnected() {
        return this.connection.state === Connection.State.CONNECTED
    }

    reconnect() {
        return this.connect()
    }

    connect() {
        if (this.isConnected()) {
            return Promise.reject(new Error('Already connected!'))
        } else if (this.connection.state === Connection.State.CONNECTING) {
            return Promise.reject(new Error('Already connecting!'))
        }

        debug('Connecting to %s', this.options.url)
        return this.connection.connect()
    }

    pause() {
        return this.connection.disconnect()
    }

    disconnect() {
        this.subsByStream = {}
        this.subById = {}

        return this.connection.disconnect()
    }

    _checkAutoDisconnect() {
        // Disconnect if no longer subscribed to any streams
        if (this.options.autoDisconnect && Object.keys(this.subsByStream).length === 0) {
            debug('Disconnecting due to no longer being subscribed to any streams')
            this.disconnect()
        }
    }

    _resendAndSubscribe(sub) {
        if (sub.getState() !== Subscription.State.subscribing && !sub.resending) {
            sub.setState(Subscription.State.subscribing)
            this._requestSubscribe(sub)

            // Once subscribed, ask for a resend
            sub.once('subscribed', () => {
                if (sub.hasResendOptions()) {
                    this._requestResend(sub)
                }
            })
        }
    }

    _requestSubscribe(sub) {
        const subs = this.subsByStream[sub.streamId]

        const subscribedSubs = subs.filter((it) => it.getState() === Subscription.State.subscribed)

        // If this is the first subscription for this stream, send a subscription request to the server
        if (!subs.subscribing && subscribedSubs.length === 0) {
            const request = new SubscribeRequest(sub.streamId, undefined, sub.apiKey)
            debug('_requestSubscribe: subscribing client: %o', request)
            subs.subscribing = true
            this.connection.send(request)
        } else if (subscribedSubs.length > 0) {
            // If there already is a subscribed subscription for this stream, this new one will just join it immediately
            debug('_requestSubscribe: another subscription for same stream: %s, insta-subscribing', sub.streamId)

            setTimeout(() => {
                sub.setState(Subscription.State.subscribed)
            })
        }
    }

    _requestUnsubscribe(streamId) {
        debug('Client unsubscribing stream %o', streamId)
        this.connection.send(new UnsubscribeRequest(streamId))
    }

    _requestResend(sub, resendOptions) {
        sub.setResending(true)

        const request = new ResendRequest(sub.streamId, sub.streamPartition, sub.id, resendOptions || sub.getEffectiveResendOptions(), sub.apiKey)
        debug('_requestResend: %o', request)
        this.connection.send(request)
    }

    _requestPublish(streamId, data, apiKey) {
        const request = new PublishRequest(streamId, apiKey, data)
        debug('_requestResend: %o', request)
        this.connection.send(request)
    }

    handleError(msg) {
        debug(msg)
        this.emit('error', msg)
    }
}
