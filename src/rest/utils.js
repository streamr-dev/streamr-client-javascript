import fetch from 'node-fetch'

export async function authFetch(url, apiKey, opts = {}) {
    let req = Object.assign({}, opts, {
        headers: apiKey ? {
            Authorization: 'token '+ apiKey
        } : undefined
    })

    let res = await fetch(url, req)

    let text = await res.text()

    if (res.ok && text.length) {
        try {
            return JSON.parse(text)
        } catch (err) {
            throw 'Failed to parse JSON response: '+text
        }
    } else if (res.ok) {
        return {}
    } else {
        throw 'Request to '+url+' returned with error code '+res.status+': '+text
    }
}
