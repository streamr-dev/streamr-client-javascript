import fetch from 'node-fetch'
import debugFactory from 'debug'

import AuthFetchError from '../errors/AuthFetchError'
import pkg from '../../package.json'

const isProduction = process.env.NODE_ENV === 'production'

const STREAMR_CLIENT_USER_AGENT = `streamr-client-javascript/${pkg.version}${!isProduction ? 'dev' : ''}`

export const DEFAULT_HEADERS = {
    'User-Agent': global.navigator
        ? `${global.navigator.userAgent} ${STREAMR_CLIENT_USER_AGENT}` // append to browser useragent
        : `Node ${process.version} ${STREAMR_CLIENT_USER_AGENT}` // server user agent
}

const debug = debugFactory('StreamrClient:utils')

const authFetch = async (url, session, opts = {}, requireNewToken = false) => {
    debug('authFetch: ', url, opts)

    const response = await fetch(url, {
        ...opts,
        headers: {
            ...(session && !session.options.unauthenticated ? {
                Authorization: `Bearer ${await session.getSessionToken(requireNewToken)}`,
            } : {}),
            ...DEFAULT_HEADERS,
            ...opts.headers,
        },
    })

    const body = await response.text()

    if (response.ok) {
        try {
            return JSON.parse(body || '{}')
        } catch (e) {
            throw new AuthFetchError(e.message, response, body)
        }
    } else if ([400, 401].includes(response.status) && !requireNewToken) {
        return authFetch(url, session, opts, true)
    } else {
        throw new AuthFetchError(`Request to ${url} returned with error code ${response.status}.`, response, body)
    }
}

export default authFetch
