import {stringify} from 'querystring'
import debug from 'debug'

import Stream from './domain/Stream'
import {authFetch} from './utils'

// These function are mixed in to StreamrClient.prototype.
// In the below functions, 'this' is intended to be the StreamrClient

export async function getStream(streamId, apiKey = this.options.apiKey) {
    let url = this.options.restUrl + '/streams/' + streamId
    let json = await authFetch(url, apiKey)
    return json ? new Stream(this, json) : undefined
}

export async function getStreamByName(name, apiKey = this.options.apiKey) {
    let url = this.options.restUrl + '/streams?' + stringify({
        name: name,
        public: false
    })
    let json = await authFetch(url, apiKey)
    return json[0] ? new Stream(this, json[0]) : undefined
}

export async function createStream(name, description, apiKey = this.options.apiKey) {
    let json = await authFetch(this.options.restUrl + '/streams',
        apiKey,
        {
            method: 'POST',
            body: JSON.stringify({
                name, description
            })
        })
    return json ? new Stream(this, json) : undefined
}

export async function getOrCreateStream(name, description, apiKey = this.options.apiKey) {
    // Try looking up the stream
    let json = await this.getStreamByName(name, apiKey)

    // If not found, try creating the stream
    if (!json) {
        json = await this.createStream(name, description, apiKey)
        debug('Created stream: %s (%s)', name, json.id)
    }

    // If still nothing, throw
    if (!json) {
        throw 'Unable to find or create stream: ' + name
    } else {
        return new Stream(this, json)
    }
}

export async function produceToStream(streamId, data, apiKey = this.options.apiKey, requestOptions = {}) {
    if (typeof streamId === Stream) {
        streamId = streamId.id
    }

    // Send data to the stream
    return await authFetch(this.options.restUrl + '/streams/' + streamId + '/data',
        apiKey,
        Object.assign({}, requestOptions, {
            method: 'POST',
            body: JSON.stringify(data)
        })
    )
}
