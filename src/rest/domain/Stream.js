import GenericDomainObject from './GenericDomainObject'

export default class Stream extends GenericDomainObject {
    async update(apiKey) {
        const newStream = await this._client.updateStream(this.id, this, apiKey)
        this.setState(this, newStream || {})
    }

    delete(apiKey) {
        return this._client.deleteStream(this.id, apiKey)
    }

    getPermissions(apiKey) {
        return this._client.getStreamPermissions(this.id, apiKey)
    }

    detectFields(apiKey) {
        return this._client.detectStreamFields(this.id, apiKey)
    }

    produce(data, apiKey = this._client.options.apiKey, requestOptions = {}, keepAlive = true) {
        return this._client.produceToStream(this.id, data, apiKey, requestOptions, keepAlive)
    }
}
