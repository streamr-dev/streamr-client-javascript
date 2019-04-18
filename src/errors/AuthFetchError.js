class AuthFetchError extends Error {
    constructor(message, response, body) {
        super(message)
        this.response = response
        this.body = body
    }
}

module.exports = AuthFetchError
