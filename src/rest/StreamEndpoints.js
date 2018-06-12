import qs from 'querystring'
import http from 'http'
import https from 'https'
import debugFactory from 'debug'
import { authFetch } from './utils'

import Stream from './domain/Stream'

const debug = debugFactory('StreamrClient')

// These function are mixed in to StreamrClient.prototype.
// In the below functions, 'this' is intended to be the StreamrClient
export async function getStream(streamId, apiKey = this.options.apiKey) {
    const url = `${this.options.restUrl}/streams/${streamId}`
    const json = await authFetch(url, apiKey)
    return json ? new Stream(this, json) : undefined
}

export async function listStreams(query = {}, apiKey = this.options.apiKey) {
    const url = `${this.options.restUrl}/streams?${qs.stringify(query)}`
    const json = await authFetch(url, apiKey)
    return Array.isArray(json) ? json.map((stream) => new Stream(this, stream)) : []
}

export async function getStreamByName(name, apiKey = this.options.apiKey) {
    const streamJson = await this.listStreams({
        name,
        public: false,
    }, apiKey)
    return streamJson[0] ? new Stream(this, streamJson[0]) : undefined
}

export async function createStream(streamData, apiKey = this.options.apiKey) {
    if (!streamData || !streamData.name) {
        throw new Error('Stream properties must contain a "name" field!')
    }

    const streamJson = await authFetch(
        `${this.options.restUrl}/streams`,
        apiKey,
        {
            method: 'POST',
            data: streamData,
        },
    )
    return streamJson ? new Stream(this, streamJson) : undefined
}

export async function getOrCreateStream(streamData, apiKey = this.options.apiKey) {
    let stream
    // Try looking up the stream by id or name, whichever is defined
    if (streamData.id) {
        stream = await this.getStream(streamData.id, apiKey)
    } else if (streamData.name) {
        stream = await this.getStreamByName(streamData.name, apiKey)
    }

    // If not found, try creating the stream
    if (!stream) {
        stream = await this.createStream(streamData, apiKey)
        debug('Created stream: %s (%s)', streamData.name, stream && stream.id)
    }

    return stream
}

export async function updateStream(streamId, streamData, apiKey = this.options.apiKey) {
    const newStreamJson = await authFetch(
        `${this.options.restUrl}/streams/${streamId}`,
        apiKey,
        {
            method: 'PUT',
            data: streamData,
        },
    )
    return newStreamJson ? new Stream(this, newStreamJson) : undefined
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

export function produceToStream(streamOrId, data, apiKey = this.options.apiKey, requestOptions = {}, keepAlive = true) {
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
            httpAgent: http.Agent({
                keepAlive,
            }),
            httpsAgent: https.Agent({
                keepAlive,
            }),
            ...requestOptions,
            method: 'POST',
            data,
        },
    )
}
