import { authFetch } from './utils'

export async function getChallenge() {
    const url = `${this.options.restUrl}/login/challenge`
    const challenge = await authFetch(
        url,
        undefined,
        undefined,
        {
            method: 'POST',
        },
    )
    return challenge
}

export async function sendChallengeResponse(props) {
    if (!props || !props.challenge || !props.signature || !props.address) {
        throw new Error('Properties must contain "challenge", "signature" and "address" fields!')
    }

    const url = `${this.options.restUrl}/login/response`
    const sessionToken = await authFetch(
        url,
        undefined,
        undefined,
        {
            method: 'POST',
            body: JSON.stringify(props),
            headers: {
                'Content-Type': 'application/json',
            },
        },
    )
    return sessionToken
}

export async function loginWithChallengeResponse(signingFunction, address) {
    return this.getChallenge()
        .then((challenge) => this.sendChallengeResponse({
            challenge,
            signature: signingFunction(challenge.challenge),
            address,
        }))
}

export async function loginWithApiKey(props) {
    if (!props || !props.apikey) {
        throw new Error('Properties must contain "apikey" field!')
    }

    const url = `${this.options.restUrl}/login/apikey`
    const sessionToken = await authFetch(
        url,
        undefined,
        undefined,
        {
            method: 'POST',
            body: JSON.stringify(props),
            headers: {
                'Content-Type': 'application/json',
            },
        },
    )
    return sessionToken
}
