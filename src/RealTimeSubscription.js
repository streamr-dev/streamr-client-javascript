import debugFactory from 'debug'

import AbstractSubscription from './AbstractSubscription'
import EncryptionUtil from './EncryptionUtil'
import UnableToDecryptError from './errors/UnableToDecryptError'

const debug = debugFactory('StreamrClient::Subscription')

export default class RealTimeSubscription extends AbstractSubscription {
    constructor(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout, orderMessages = true,
        onUnableToDecrypt = AbstractSubscription.defaultUnableToDecrypt) {
        super(streamId, streamPartition, callback, groupKeys, propagationTimeout, resendTimeout, orderMessages, onUnableToDecrypt)
        this.resending = false
    }

    // All the handle* methods should:
    // - return a promise for consistency
    // - swallow exceptions and emit them as 'error' events

    async handleBroadcastMessage(msg, verifyFn) {
        return this._catchAndEmitErrors(() => this._handleMessage(msg, verifyFn))
    }

    finishResend() {
        this._lastMessageHandlerPromise = null
        if (Object.keys(this.pendingResendRequestIds).length === 0) {
            this.setResending(false)
        }
    }

    _decryptOrRequestGroupKey(msg) {
        try {
            const newGroupKey = EncryptionUtil.decryptStreamMessage(msg, this.groupKeys[msg.getPublisherId()])
            delete this.alreadyFailedToDecrypt[msg.getPublisherId()]
            if (newGroupKey) {
                this.groupKeys[msg.getPublisherId()] = newGroupKey
            }
            return true
        } catch (e) {
            if (e instanceof UnableToDecryptError && !this.alreadyFailedToDecrypt[msg.getPublisherId()]) {
                this._requestGroupKeyAndQueueMessage(msg)
                this.alreadyFailedToDecrypt[msg.getPublisherId()] = true
                return false
            }
            throw e
        }
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

    setGroupKeys(publisherId, groupKeys) {
        if (groupKeys.length !== 1) {
            throw new Error('Received multiple group keys for a real time subscription (expected one).')
        }
        /* eslint-disable prefer-destructuring */
        this.groupKeys[publisherId] = groupKeys[0]
        /* eslint-enable prefer-destructuring */
        this._handleEncryptedQueuedMsgs(publisherId)
    }
}
