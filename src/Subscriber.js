import once from 'once'
import { ControlLayer, Errors } from 'streamr-client-protocol'

import SubscribedStreamPartition from './SubscribedStreamPartition'
import RealTimeSubscription from './RealTimeSubscription'
import CombinedSubscription from './CombinedSubscription'
import Subscription from './Subscription'

const { SubscribeRequest, UnsubscribeRequest, ControlMessage } = ControlLayer

export default class Subscriber {
    constructor(client) {
        this.client = client
        this.subscribedStreamPartitions = {}
        this.debug = client.debug.extend('Subscriber')

        // Broadcast messages to all subs listening on stream-partition
        this.client.connection.on(ControlMessage.TYPES.BroadcastMessage, (msg) => {
            const stream = this._getSubscribedStreamPartition(msg.streamMessage.getStreamId(), msg.streamMessage.getStreamPartition())
            if (stream) {
                const verifyFn = once(() => stream.verifyStreamMessage(msg.streamMessage)) // ensure verification occurs only once
                // sub.handleBroadcastMessage never rejects: on any error it emits an 'error' event on the Subscription
                stream.getSubscriptions().forEach((sub) => sub.handleBroadcastMessage(msg.streamMessage, verifyFn))
            } else {
                this.debug('WARN: message received for stream with no subscriptions: %s', msg.streamMessage.getStreamId())
            }
        })

        this.client.connection.on(ControlMessage.TYPES.SubscribeResponse, (response) => {
            const stream = this._getSubscribedStreamPartition(response.streamId, response.streamPartition)
            if (stream) {
                stream.setSubscribing(false)
                stream.getSubscriptions().filter((sub) => !sub.resending)
                    .forEach((sub) => sub.setState(Subscription.State.subscribed))
            }
            this.debug('Client subscribed: streamId: %s, streamPartition: %s', response.streamId, response.streamPartition)
        })

        this.client.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (response) => {
            this.debug('Client unsubscribed: streamId: %s, streamPartition: %s', response.streamId, response.streamPartition)
            const stream = this._getSubscribedStreamPartition(response.streamId, response.streamPartition)
            if (stream) {
                stream.getSubscriptions().forEach((sub) => {
                    this._removeSubscription(sub)
                    sub.setState(Subscription.State.unsubscribed)
                })
            }

            this._checkAutoDisconnect()
        })

        this.client.on('connected', async () => {
            try {
                if (!this.client.isConnected()) { return }
                // Check pending subscriptions
                Object.keys(this.subscribedStreamPartitions).forEach((key) => {
                    this.subscribedStreamPartitions[key].getSubscriptions().forEach((sub) => {
                        if (sub.getState() !== Subscription.State.subscribed) {
                            this._resendAndSubscribe(sub).catch((err) => {
                                this.client.emit('error', err)
                            })
                        }
                    })
                })
            } catch (err) {
                this.client.emit('error', err)
            }
        })

        this.client.on('disconnected', () => {
            Object.keys(this.subscribedStreamPartitions)
                .forEach((key) => {
                    const stream = this.subscribedStreamPartitions[key]
                    stream.setSubscribing(false)
                    stream.getSubscriptions().forEach((sub) => {
                        sub.onDisconnected()
                    })
                })
        })
    }

    onErrorMessage(err) {
        if (!(err instanceof Errors.InvalidJsonError)) {
            return
        }
        // If there is an error parsing a json message in a stream, fire error events on the relevant subs
        const stream = this._getSubscribedStreamPartition(err.streamMessage.getStreamId(), err.streamMessage.getStreamPartition())
        if (stream) {
            stream.getSubscriptions().forEach((sub) => sub.handleError(err))
        } else {
            this.debug('WARN: InvalidJsonError received for stream with no subscriptions: %s', err.streamId)
        }
    }

    subscribe(optionsOrStreamId, callback, legacyOptions) {
        const options = this._validateParameters(optionsOrStreamId, callback)

        // Backwards compatibility for giving an options object as third argument
        Object.assign(options, legacyOptions)

        if (!options.stream) {
            throw new Error('subscribe: Invalid arguments: options.stream is not given')
        }

        // Create the Subscription object and bind handlers
        let sub
        if (options.resend) {
            sub = new CombinedSubscription({
                streamId: options.stream,
                streamPartition: options.partition || 0,
                callback,
                options: options.resend,
                propagationTimeout: this.client.options.gapFillTimeout,
                resendTimeout: this.client.options.retryResendAfter,
                orderMessages: this.client.options.orderMessages,
                debug: this.debug,
            })
        } else {
            sub = new RealTimeSubscription({
                streamId: options.stream,
                streamPartition: options.partition || 0,
                callback,
                options: options.resend,
                propagationTimeout: this.client.options.gapFillTimeout,
                resendTimeout: this.client.options.retryResendAfter,
                orderMessages: this.client.options.orderMessages,
                debug: this.debug,
            })
        }
        sub.on('gap', (from, to, publisherId, msgChainId) => {
            if (!sub.resending) {
                this.client.resender._requestResend(sub, {
                    from, to, publisherId, msgChainId,
                })
            }
        })
        sub.on('done', () => {
            this.debug('done event for sub %d', sub.id)
            this.unsubscribe(sub)
        })

        // Add to lookups
        this._addSubscription(sub)

        // If connected, emit a subscribe request
        if (this.client.isConnected()) {
            this._resendAndSubscribe(sub)
        } else if (this.client.options.autoConnect) {
            this.client.ensureConnected()
        }

        return sub
    }

    unsubscribe(sub) {
        if (!sub || !sub.streamId) {
            throw new Error('unsubscribe: please give a Subscription object as an argument!')
        }

        const sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)

        // If this is the last subscription for this stream-partition, unsubscribe the client too
        if (sp && sp.getSubscriptions().length === 1
            && this.client.isConnected()
            && sub.getState() === Subscription.State.subscribed) {
            sub.setState(Subscription.State.unsubscribing)
            this._requestUnsubscribe(sub)
        } else if (sub.getState() !== Subscription.State.unsubscribing && sub.getState() !== Subscription.State.unsubscribed) {
            // Else the sub can be cleaned off immediately
            this._removeSubscription(sub)
            sub.setState(Subscription.State.unsubscribed)
            this._checkAutoDisconnect()
        }
    }

    unsubscribeAll(streamId, streamPartition) {
        if (!streamId) {
            throw new Error('unsubscribeAll: a stream id is required!')
        } else if (typeof streamId !== 'string') {
            throw new Error('unsubscribe: stream id must be a string!')
        }

        let streamPartitions = []

        // Unsubscribe all subs for the given stream-partition
        if (streamPartition) {
            const sp = this._getSubscribedStreamPartition(streamId, streamPartition)
            if (sp) {
                streamPartitions = [sp]
            }
        } else {
            streamPartitions = this._getSubscribedStreamPartitionsForStream(streamId)
        }

        streamPartitions.forEach((sp) => {
            sp.getSubscriptions().forEach((sub) => {
                this.unsubscribe(sub)
            })
        })
    }

    _getSubscribedStreamPartition(streamId, streamPartition) {
        const key = streamId + streamPartition
        return this.subscribedStreamPartitions[key]
    }

    _getSubscribedStreamPartitionsForStream(streamId) {
        // TODO: pretty crude method, could improve
        return Object.values(this.subscribedStreamPartitions)
            .filter((stream) => stream.streamId === streamId)
    }

    _addSubscribedStreamPartition(subscribedStreamPartition) {
        const key = subscribedStreamPartition.streamId + subscribedStreamPartition.streamPartition
        this.subscribedStreamPartitions[key] = subscribedStreamPartition
    }

    _deleteSubscribedStreamPartition(subscribedStreamPartition) {
        const key = subscribedStreamPartition.streamId + subscribedStreamPartition.streamPartition
        delete this.subscribedStreamPartitions[key]
    }

    _addSubscription(sub) {
        let sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)
        if (!sp) {
            sp = new SubscribedStreamPartition(this.client, sub.streamId, sub.streamPartition)
            this._addSubscribedStreamPartition(sp)
        }
        sp.addSubscription(sub)
    }

    _removeSubscription(sub) {
        const sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)
        if (sp) {
            sp.removeSubscription(sub)
            if (sp.getSubscriptions().length === 0) {
                this._deleteSubscribedStreamPartition(sp)
            }
        }
    }

    getSubscriptions(streamId, streamPartition) {
        let subs = []

        if (streamPartition) {
            const sp = this._getSubscribedStreamPartition(streamId, streamPartition)
            if (sp) {
                subs = sp.getSubscriptions()
            }
        } else {
            const sps = this._getSubscribedStreamPartitionsForStream(streamId)
            sps.forEach((sp) => sp.getSubscriptions().forEach((sub) => subs.push(sub)))
        }

        return subs
    }

    stop() {
        this.subscribedStreamPartitions = {}
    }

    async _requestSubscribe(sub) {
        const sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)
        let subscribedSubs = []
        // never reuse subscriptions when incoming subscription needs resends
        // i.e. only reuse realtime subscriptions
        if (!sub.hasResendOptions()) {
            subscribedSubs = sp.getSubscriptions().filter((it) => (
                it.getState() === Subscription.State.subscribed
                // don't resuse subscriptions currently resending
                && !it.isResending()
            ))
        }

        const sessionToken = await this.client.session.getSessionToken()

        // If this is the first subscription for this stream-partition, send a subscription request to the server
        if (!sp.isSubscribing() && subscribedSubs.length === 0) {
            const request = new SubscribeRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                sessionToken,
                requestId: this.client.resender.resendUtil.generateRequestId(),
            })
            this.debug('_requestSubscribe: subscribing client: %o', request)
            sp.setSubscribing(true)
            await this.client.connection.send(request).catch((err) => {
                sub.setState(Subscription.State.unsubscribed)
                this.client.emit('error', err) // `Failed to send subscribe request: ${err}`)
            })
        } else if (subscribedSubs.length > 0) {
            // If there already is a subscribed subscription for this stream, this new one will just join it immediately
            this.debug('_requestSubscribe: another subscription for same stream: %s, insta-subscribing', sub.streamId)

            setTimeout(() => {
                sub.setState(Subscription.State.subscribed)
            })
        }
    }

    async _requestUnsubscribe(sub) {
        this.debug('Client unsubscribing stream %o partition %o', sub.streamId, sub.streamPartition)
        const unsubscribeRequest = new UnsubscribeRequest({
            streamId: sub.streamId,
            streamPartition: sub.streamPartition,
            requestId: this.client.resender.resendUtil.generateRequestId(),
        })
        await this.client.connection.send(unsubscribeRequest).catch((err) => {
            sub.setState(Subscription.State.subscribed)
            this.client.handleError(`Failed to send unsubscribe request: ${err}`)
        })
    }

    _checkAutoDisconnect() {
        // Disconnect if no longer subscribed to any streams
        if (this.client.options.autoDisconnect && Object.keys(this.subscribedStreamPartitions).length === 0) {
            this.debug('Disconnecting due to no longer being subscribed to any streams')
            this.client.disconnect()
        }
    }

    // eslint-disable-next-line class-methods-use-this
    _validateParameters(optionsOrStreamId, callback) {
        if (!optionsOrStreamId) {
            throw new Error('subscribe/resend: Invalid arguments: options is required!')
        } else if (!callback) {
            throw new Error('subscribe/resend: Invalid arguments: callback is required!')
        }

        // Backwards compatibility for giving a streamId as first argument
        let options
        if (typeof optionsOrStreamId === 'string') {
            options = {
                stream: optionsOrStreamId,
            }
        } else if (typeof optionsOrStreamId === 'object') {
            // shallow copy
            options = {
                ...optionsOrStreamId
            }
        } else {
            throw new Error(`subscribe/resend: options must be an object! Given: ${optionsOrStreamId}`)
        }

        return options
    }

    async _resendAndSubscribe(sub) {
        if (sub.getState() === Subscription.State.subscribing || sub.resending) { return }
        sub.setState(Subscription.State.subscribing)
        // Once subscribed, ask for a resend
        sub.once('subscribed', () => {
            if (!sub.hasResendOptions()) { return }

            this.client.resender._requestResend(sub)
        })
        await this._requestSubscribe(sub)
    }
}