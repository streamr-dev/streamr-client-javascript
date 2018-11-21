import { authFetch } from '../utils'

export default class Stream {
    constructor(client, props) {
        this._client = client
        Object.assign(this, props)
    }

    async update(apiKey = this._client.options.apiKey) {
        const json = await authFetch(
            `${this._client.options.restUrl}/streams/${this.id}`,
            apiKey,
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

    delete(apiKey = this._client.options.apiKey) {
        return authFetch(
            `${this._client.options.restUrl}/streams/${this.id}`,
            apiKey,
            {
                method: 'DELETE',
            },
        )
    }

    getPermissions(apiKey = this._client.options.apiKey) {
        return authFetch(`${this._client.options.restUrl}/streams/${this.id}/permissions`, apiKey)
    }

    detectFields(apiKey = this._client.options.apiKey) {
        return authFetch(`${this._client.options.restUrl}/streams/${this.id}/detectFields`, apiKey)
    }

    publish(data, apiKey = this._client.options.apiKey) {
        return this._client.publish(this.id, data, apiKey)
    }
}
