import once from 'once'
import { ControlLayer } from 'streamr-client-protocol'

import Signer from './Signer'
import Stream from './rest/domain/Stream'
import FailedToPublishError from './errors/FailedToPublishError'
import MessageCreationUtil from './MessageCreationUtil'

function getStreamId(streamObjectOrId) {
    if (streamObjectOrId instanceof Stream) {
        return streamObjectOrId.id
    }

    if (typeof streamObjectOrId === 'string') {
        return streamObjectOrId
    }

    throw new Error(`First argument must be a Stream object or the stream id! Was: ${streamObjectOrId}`)
}

export default class Publisher {
    constructor(client) {
        this.client = client
        this.debug = client.debug.extend('Publisher')

        this.publishQueue = []
        this.signer = Signer.createSigner({
            ...client.options.auth,
            debug: client.debug,
        }, client.options.publishWithSignature)

        if (client.session.isUnauthenticated()) {
            this.msgCreationUtil = null
        } else {
            this.msgCreationUtil = new MessageCreationUtil(
                client.options.auth, this.signer, once(() => client.getUserInfo()),
                (streamId) => client.getStream(streamId)
                    .catch((err) => client.emit('error', err))
            )
        }
    }

    async publish(streamObjectOrId, data, timestamp = new Date(), partitionKey = null) {
        if (this.client.session.isUnauthenticated()) {
            throw new Error('Need to be authenticated to publish.')
        }
        // Validate streamObjectOrId
        const streamId = getStreamId(streamObjectOrId)

        const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
        const [sessionToken, streamMessage] = await Promise.all([
            this.client.session.getSessionToken(),
            this.msgCreationUtil.createStreamMessage(streamObjectOrId, data, timestampAsNumber, partitionKey),
        ])

        const requestId = this.client.resender.resendUtil.generateRequestId()
        const request = new ControlLayer.PublishRequest({
            streamMessage,
            requestId,
            sessionToken,
        })
        this.debug('_requestPublish: %o', request)
        try {
            await this.client.connection.send(request)
        } catch (err) {
            this.debug('adasd: %o', err)
            throw new FailedToPublishError(
                streamId,
                data,
                err
            )
        }
    }

    getPublisherId() {
        return this.msgCreationUtil.getPublisherId()
    }

    stop() {
        if (this.msgCreationUtil) {
            this.msgCreationUtil.stop()
        }
    }
}
