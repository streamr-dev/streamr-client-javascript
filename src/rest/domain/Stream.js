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
                body: JSON.stringify(this),
            },
        )
        return json ? new Stream(this._client, json) : undefined
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

    async isPublic(apiKey = this._client.options.apiKey) {
        const permissions = await this.getPermissions(apiKey)
        return permissions.find((permission) => (permission.anonymous && permission.operation === 'read')) !== undefined
    }

    makePublic(apiKey = this._client.options.apiKey) {
        return authFetch(
            `${this._client.options.restUrl}/streams/${this.id}/permissions`,
            apiKey,
            {
                method: 'POST',
                body: JSON.stringify({
                    anonymous: true,
                    operation: 'read',
                }),
            },
        )
    }

    detectFields(apiKey = this._client.options.apiKey) {
        return authFetch(`${this._client.options.restUrl}/streams/${this.id}/detectFields`, apiKey)
    }

    produce(data, apiKey = this._client.options.apiKey, requestOptions = {}) {
        return this._client.produceToStream(this.id, data, apiKey, requestOptions)
    }
}
