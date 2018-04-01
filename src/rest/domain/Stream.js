import {authFetch} from '../utils'

export default class Stream {

    constructor(client, props) {
        this._client = client
        Object.assign(this, props)
    }

    async getPermissions(apiKey = this._client.options.apiKey) {
        return await authFetch(this._client.options.restUrl + '/streams/' + this.id + '/permissions', apiKey)
    }

    async isPublic(apiKey = this._client.options.apiKey) {
        let permissions = await this.getPermissions(apiKey)
        return permissions.find((permission) => (permission.anonymous && permission.operation === 'read')) !== undefined
    }

    async makePublic(apiKey = this._client.options.apiKey) {
        return await authFetch(this._client.options.restUrl + '/streams/' + this.id + '/permissions',
            apiKey,
            {
                method: 'POST',
                body: JSON.stringify({
                    anonymous: true,
                    operation: 'read'
                }),
            })
    }

    async detectFields(apiKey = this._client.options.apiKey) {
        return await authFetch(this._client.options.restUrl + '/streams/' + this.id + '/detectFields', apiKey)
    }

    async update(apiKey = this._client.options.apiKey) {
        let json = await authFetch(this.options.restUrl + '/streams/' + this.id,
            apiKey,
            {
                method: 'PUT',
                body: JSON.stringify(this)
            })
        return json ? new Stream(this._client, json) : undefined
    }
}
