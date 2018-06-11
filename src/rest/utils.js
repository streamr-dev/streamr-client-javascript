import axios from 'axios'
import debugFactory from 'debug'

const debug = debugFactory('StreamrClient:utils')

export const authFetch = async (url, apiKey, opts = {}) => {
    debug('authFetch: ', url, opts)

    const req = {
        ...opts,
        data: opts.data || opts.body, // opts.body for legacy reasons
        headers: {
            Authorization: apiKey ? `token ${apiKey}` : undefined,
            ...(opts.headers || {}),
        },
    }

    try {
        const { data } = await axios(url, req)
        return data
    } catch (e) {
        throw new Error(`Request to ${url} failed with http status code ${e.response.status}: ${JSON.stringify(e.response.data)}`)
    }
}
