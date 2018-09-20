class WebsocketRequest {
    constructor(type, streamId, apiKey) {
        this.type = type
        this.streamId = streamId
        this.apiKey = apiKey
    }

    toObject() {
        return {
            type: this.type,
            stream: this.streamId,
            authKey: this.apiKey,
        }
    }

    serialize() {
        return JSON.stringify(this.toObject())
    }
}

module.exports = WebsocketRequest
