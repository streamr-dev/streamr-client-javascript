import Signer from './Signer'

export default class SubscribedStream {
    constructor(client, streamId) {
        this._client = client
        this.streamId = streamId
        if (client.options.verifySignatures === 'always') {
            this.verifySignatures = true
        } else if (client.options.verifySignatures === 'never') {
            this.verifySignatures = false
        } else if (client.options.verifySignatures === 'auto') {
            this.verifySignatures = undefined // Will retrieve it from the stream's metadata in getVerifySignatures() method
        } else {
            throw new Error(`Unrecognized verifySignatures parameter value: ${client.options.verifySignatures}`)
        }
    }

    async getProducers() {
        if (!this.producers) {
            this.producers = await this._client.getStreamProducers(this.streamId)
        }
        return this.producers
    }

    async verifyStreamMessage(msg) {
        const requireVerification = await this.getVerifySignatures()
        if (requireVerification) {
            const producers = await this.getProducers()
            return Signer.verifyStreamMessage(msg, new Set(producers))
        }
        return true
    }

    async getVerifySignatures() {
        if (this.verifySignatures === undefined) {
            const stream = await this._client.getStream(this.streamId)
            this.verifySignatures = stream.requireSignedData
        }
        return this.verifySignatures
    }
}
