class ErrorResponse {
    constructor(errorMessage) {
        this.errorMessage = errorMessage
    }

    toObject() {
        return {
            error: this.errorMessage,
        }
    }

    serialize() {
        return JSON.stringify(this.toObject())
    }
}

ErrorResponse.deserialize = (stringOrObject) => {
    const msg = (typeof stringOrObject === 'string' ? JSON.parse(stringOrObject) : stringOrObject)
    if (!msg.error) {
        throw new Error(`Invalid error message received: ${JSON.stringify(msg)}`)
    }
    return new ErrorResponse(msg.error)
}

module.exports = ErrorResponse
