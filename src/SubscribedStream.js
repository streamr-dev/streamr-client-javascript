import Signer from './Signer'

export default class SubscribedStream {
    constructor(client, streamId) {
        this._client = client
        this.streamId = streamId
        this.requireSignedData = false // TODO: Should retrieve it from the stream's metadata
        if (client.options.verifySignatures === 'always') {
            this.verifySignatures = true
        } else if (client.options.verifySignatures === 'never') {
            this.verifySignatures = false
        } else if (client.options.verifySignatures === 'auto') {
            this.verifySignatures = this.requireSignedData
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
        if (this.verifySignatures) {
            const producers = await this.getProducers()
            return Signer.verifyStreamMessage(msg, new Set(producers))
        }
        return true
    }
}
