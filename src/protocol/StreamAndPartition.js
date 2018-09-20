class StreamAndPartition {
    constructor(streamId, streamPartition) {
        this.streamId = streamId
        this.streamPartition = streamPartition
    }

    toObject() {
        return {
            stream: this.streamId,
            partition: this.streamPartition,
        }
    }

    serialize() {
        return JSON.stringify(this.toObject())
    }
}

StreamAndPartition.deserialize = (stringOrObject) => {
    const msg = (typeof stringOrObject === 'string' ? JSON.parse(stringOrObject) : stringOrObject)
    return new StreamAndPartition(msg.stream, msg.partition)
}

module.exports = StreamAndPartition
