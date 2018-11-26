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
        const producers = await this.getProducers()
        if (this.verifySignatures) {
            return this._client.signer.verifyStreamMessage(msg, producers)
        }
        return true
    }
}
