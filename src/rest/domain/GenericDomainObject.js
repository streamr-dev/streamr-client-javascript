export default class GenericDomainObject {
    constructor(client, state = {}) {
        if (!client) {
            throw new Error('A client must be given')
        }
        this._client = client
        Object.assign(this, state)
    }

    setState(state = {}) {
        Object.assign(this, state)
    }
}
