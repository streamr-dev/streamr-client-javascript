export default class SubscribedStream {
    constructor(client, streamId) {
        this._client = client
        this.streamId = streamId
    }

    async getProducers() {
        if (!this.producers) {
            this.producers = await this._client.getStreamProducers(this.streamId)
        }
        return this.producers
    }
}
