export default class GenericDomainObject {
    constructor(client, props = {}) {
        if (!client) {
            throw new Error('A client must be given')
        }
        this._client = client
        Object.assign(this, props)
    }

    setProps(props = {}) {
        Object.assign(this, props)
    }
}
