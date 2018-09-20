import InvalidJsonError from '../errors/InvalidJsonError'
import UnsupportedVersionError from '../errors/UnsupportedVersionError'

class StreamMessage {
    constructor(streamId, streamPartition, timestamp, ttl, offset, previousOffset, contentType, content) {
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.timestamp = timestamp
        this.ttl = ttl
        this.offset = offset
        this.previousOffset = previousOffset
        this.contentType = contentType
        this.content = content
    }

    getParsedContent() {
        if (this.parsedContent !== undefined) {
            return this.parsedContent
        } else if (this.contentType === StreamMessage.CONTENT_TYPES.JSON) {
            try {
                this.parsedContent = JSON.parse(this.content)
                return this.parsedContent
            } catch (err) {
                throw new InvalidJsonError(
                    this.streamId,
                    this.content,
                    err,
                    this,
                )
            }
        } else {
            throw new Error(`Unsupported content type: ${this.contentType}`)
        }
    }

    getSerializedContent() {
        if (typeof this.content === 'string') {
            return this.content
        } else if (this.contentType === StreamMessage.CONTENT_TYPES.JSON && typeof this.content === 'object') {
            return JSON.stringify(this.content)
        } else if (this.contentType === StreamMessage.CONTENT_TYPES.JSON) {
            throw new Error('Stream payloads can only be objects!')
        } else {
            throw new Error(`Unsupported content type: ${this.contentType}`)
        }
    }

    toObject(version = 28) {
        if (version === 28) {
            return [
                version,
                this.streamId,
                this.streamPartition,
                this.timestamp,
                this.ttl,
                this.offset,
                this.previousOffset,
                this.contentType,
                this.getSerializedContent(),
            ]
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [28]')
    }

    serialize(version = 28) {
        return JSON.stringify(this.toObject(version))
    }
}

/**
 * Version 28: [version, streamId, streamPartition, timestamp, ttl, offset, previousOffset, contentType, content]
 */
StreamMessage.deserialize = (stringOrArray, parseContent = true) => {
    const message = (typeof stringOrArray === 'string' ? JSON.parse(stringOrArray) : stringOrArray)

    if (message[0] === 28) {
        const result = new StreamMessage(...message.slice(1))

        // Ensure that the content parses
        if (parseContent) {
            result.getParsedContent()
        }
        return result
    }
    throw new UnsupportedVersionError(message[0], 'Supported versions: [28]')
}

StreamMessage.CONTENT_TYPES = {
    JSON: 27,
}

module.exports = StreamMessage
