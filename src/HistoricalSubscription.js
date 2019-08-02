import AbstractSubscription from './AbstractSubscription'

export default class HistoricalSubscription extends AbstractSubscription {
    constructor(streamId, streamPartition, callback, options, groupKeys, propagationTimeout, resendTimeout) {
        super(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout)
        this.resendOptions = options || {}
        this.realTimeMsgsQueue = []
        if (!this.resendOptions) {
            throw new Error('Resend options must be defined in a historical subscription.')
        }

        if (this.resendOptions.from != null && this.resendOptions.last != null) {
            throw new Error(`Multiple resend options active! Please use only one: ${JSON.stringify(this.resendOptions)}`)
        }

        if (this.resendOptions.msgChainId != null && typeof this.resendOptions.publisherId === 'undefined') {
            throw new Error('publisherId must be defined as well if msgChainId is defined.')
        }

        if (this.resendOptions.from == null && this.resendOptions.to != null) {
            throw new Error('"from" must be defined as well if "to" is defined.')
        }

        /** * Message handlers ** */

        this.on('unsubscribed', () => {
            this._clearGaps()
        })

        this.on('disconnected', () => {
            this.setState(AbstractSubscription.State.unsubscribed)
            this._clearGaps()
        })

        this.on('error', () => {
            this._clearGaps()
        })
    }

    async handleBroadcastMessage(msg, verifyFn) {
        await AbstractSubscription.validate(msg, verifyFn)
        this.emit('message received')
        this.realTimeMsgsQueue.push(msg)
    }

    async handleResentMessage(msg, verifyFn) {
        return this._catchAndEmitErrors(() => {
            const handleMessagePromise = this._handleResentMessage(msg, verifyFn)
            this._lastMessageHandlerPromise = handleMessagePromise
            return handleMessagePromise
        })
    }

    async handleResending(response) {
        return this._catchAndEmitErrors(() => {
            this.emit('resending', response)
        })
    }

    async handleResent(response) {
        return this._catchAndEmitErrors(async () => {
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
            try {
                this.emit('no_resend', response)
            } finally {
                this._finishResend()
            }
        })
    }

    /* eslint-disable class-methods-use-this */
    hasResendOptions() {
        return true
    }

    isResending() {
        return true
    }

    setResending() {}
    /* eslint-enable class-methods-use-this */

    getResendOptions() {
        return this.resendOptions
    }

    _finishResend() {
        this._lastMessageHandlerPromise = null
        this.emit('resend done', this.orderingUtil.lastReceivedMsgRef)
    }

    async _handleResentMessage(msg, verifyFn) {
        await AbstractSubscription.validate(msg, verifyFn)
        this.emit('message received')
        this.orderingUtil.add(msg)
    }
}
