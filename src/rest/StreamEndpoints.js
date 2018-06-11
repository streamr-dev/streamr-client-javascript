import qs from 'querystring'
import debugFactory from 'debug'
import { authFetch } from './utils'

import Stream from './domain/Stream'

const debug = debugFactory('StreamrClient')

// These function are mixed in to StreamrClient.prototype.
// In the below functions, 'this' is intended to be the StreamrClient
export async function getStream(streamId, apiKey = this.options.apiKey) {
    const url = `${this.options.restUrl}/streams/${streamId}`
    try {
        const json = await authFetch(url, apiKey)
        return new Stream(this, json)
    } catch (e) {
        if (e.response.status === 404) {
            return undefined
        }
        throw e
    }
}

export async function listStreams(query = {}, apiKey = this.options.apiKey) {
    const url = `${this.options.restUrl}/streams?${qs.stringify(query)}`
    const json = await authFetch(url, apiKey)
    return Array.isArray(json) ? json.map((stream) => new Stream(this, stream)) : []
}

export async function getStreamByName(name, apiKey = this.options.apiKey) {
    const json = await this.listStreams({
        name,
        public: false,
    }, apiKey)
    return json[0] ? new Stream(this, json[0]) : undefined
}

export async function createStream(props, apiKey = this.options.apiKey) {
    if (!props || !props.name) {
        throw new Error('Stream properties must contain a "name" field!')
    }

    const json = await authFetch(
        `${this.options.restUrl}/streams`,
        apiKey,
        {
            method: 'POST',
            data: props,
        },
    )
    return json ? new Stream(this, json) : undefined
}

export async function getOrCreateStream(props, apiKey = this.options.apiKey) {
    let stream = await (props.id ? this.getStream(props.id, apiKey) : this.getStreamByName(props.name, apiKey))

    // If not found, try creating the stream
    if (!stream) {
        stream = await this.createStream(props, apiKey)
    }

    debug('Created stream: %s (%s)', props.name, stream.id)
    return stream
}

export async function updateStream(streamId, props, apiKey = this.options.apiKey) {
    const json = await authFetch(
        `${this.options.restUrl}/streams/${streamId}`,
        apiKey,
        {
            method: 'PUT',
            data: props,
        },
    )
    return json ? new Stream(this, json) : undefined
}

export function deleteStream(streamId, apiKey = this.options.apiKey) {
    return authFetch(
        `${this.options.restUrl}/streams/${streamId}`,
        apiKey,
        {
            method: 'DELETE',
        },
    )
}

export function getStreamPermissions(streamId, apiKey = this.options.apiKey) {
    return authFetch(`${this.options.restUrl}/streams/${streamId}/permissions`, apiKey)
}

export function detectStreamFields(streamId, apiKey = this.options.apiKey) {
    return authFetch(`${this.options.restUrl}/streams/${streamId}/detectFields`, apiKey)
}

export function produceToStream(streamOrId, data, apiKey = this.options.apiKey, requestOptions = {}) {
    let streamId
    if (streamOrId instanceof String || typeof streamOrId === 'string') {
        streamId = streamOrId
    } else {
        streamId = streamOrId.id
    }

    // Send data to the stream
    return authFetch(
        `${this.options.restUrl}/streams/${streamId}/data`,
        apiKey,
        {
            ...requestOptions,
            method: 'POST',
            data,
        },
    )
}
