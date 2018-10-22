import { authFetch } from '../utils'

export default class Stream {
    constructor(client, props) {
        this._client = client
        Object.assign(this, props)
    }

    async update() {
        const json = await authFetch(
            `${this._client.options.restUrl}/streams/${this.id}`,
            this._client.options.sessionToken,
            this._client.options.loginFunction,
            {
                method: 'PUT',
                body: JSON.stringify(this.toObject()),
            },
        )
        return json ? new Stream(this._client, json) : undefined
    }

    toObject() {
        const result = {}
        Object.keys(this).forEach((key) => {
            if (!key.startsWith('_')) {
                result[key] = this[key]
            }
        })
        return result
    }

    delete() {
        return authFetch(
            `${this._client.options.restUrl}/streams/${this.id}`,
            this._client.options.sessionToken,
            this._client.options.loginFunction,
            {
                method: 'DELETE',
            },
        )
    }

    getPermissions() {
        return authFetch(
            `${this._client.options.restUrl}/streams/${this.id}/permissions`,
            this._client.options.sessionToken,
            this._client.options.loginFunction,
        )
    }

    detectFields() {
        return authFetch(
            `${this._client.options.restUrl}/streams/${this.id}/detectFields`,
            this._client.options.sessionToken,
            this._client.options.loginFunction,
        )
    }

    produce(data) {
        return this._client.produceToStream(this.id, data)
    }
}
