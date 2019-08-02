import debugFactory from 'debug'

import AbstractSubscription from './AbstractSubscription'

const debug = debugFactory('StreamrClient::Subscription')

export default class RealTimeSubscription extends AbstractSubscription {
    constructor(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout, startMsgRef = null) {
        super(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout)
        this.resending = false
        this.orderingUtil.lastReceivedMsgRef = startMsgRef

        /** * Message handlers ** */

        this.on('unsubscribed', () => {
            this._clearGaps()
            this.setResending(false)
        })

        this.on('disconnected', () => {
            this.setState(AbstractSubscription.State.unsubscribed)
            this._clearGaps()
            this.setResending(false)
        })

        this.on('error', () => {
            this._clearGaps()
        })
    }

    // All the handle* methods should:
    // - return a promise for consistency
    // - swallow exceptions and emit them as 'error' events

    async handleBroadcastMessage(msg, verifyFn) {
        return this._catchAndEmitErrors(() => this._handleMessage(msg, verifyFn))
    }

    async handleResentMessage(msg, verifyFn) {
        return this._catchAndEmitErrors(() => {
            if (!this.isResending()) {
                throw new Error(`There is no resend in progress, but received resent message ${msg.serialize()}`)
            } else {
                const handleMessagePromise = this._handleMessage(msg, verifyFn)
                this._lastMessageHandlerPromise = handleMessagePromise
                return handleMessagePromise
            }
        })
    }

    async handleResending(response) {
        return this._catchAndEmitErrors(() => {
            if (!this.isResending()) {
                throw new Error(`There should be no resend in progress, but received ResendResponseResending message ${response.serialize()}`)
            }
            this.emit('resending', response)
        })
    }

    async handleResent(response) {
        return this._catchAndEmitErrors(async () => {
            if (!this.isResending()) {
                throw new Error(`There should be no resend in progress, but received ResendResponseResent message ${response.serialize()}`)
            }

            if (!this._lastMessageHandlerPromise) {
                throw new Error('Attempting to handle ResendResponseResent, but no messages have been received!')
            }

            // Delay event emission until the last message in the resend has been handled
            await this._lastMessageHandlerPromise.then(async () => {
                try {
                    this.emit('resent', response)
                } finally {
                    this._finishResend()
                }
            })
        })
    }

    async handleNoResend(response) {
        return this._catchAndEmitErrors(async () => {
            if (!this.isResending()) {
                throw new Error(`There should be no resend in progress, but received ResendResponseNoResend message ${response.serialize()}`)
            }
            try {
                this.emit('no_resend', response)
            } finally {
                this._finishResend()
            }
        })
    }

    _finishResend() {
        this._lastMessageHandlerPromise = null
        this.setResending(false)
    }

    async _handleMessage(msg, verifyFn) {
        await AbstractSubscription.validate(msg, verifyFn)
        this.emit('message received')
        this.orderingUtil.add(msg)
    }

    /* eslint-disable class-methods-use-this */
    hasResendOptions() {
        return false
    }

    getResendOptions() {
        return {}
    }
    /* eslint-enable class-methods-use-this */

    isResending() {
        return this.resending
    }

    setResending(resending) {
        debug(`Subscription: Stream ${this.streamId} resending: ${resending}`)
        this.resending = resending
    }
}
