import fetch from 'node-fetch'
import { Contract } from 'ethers'

import authFetch from './authFetch'

const CommunityProduct = require('../../CommunityProduct.json')

export async function joinCommunity(communityAddress, memberAddress, secret = undefined) {
    const json = authFetch(
        `${this.options.restUrl}/communities/${communityAddress}/joinRequests`,
        this.session,
        {
            method: 'POST',
            body: JSON.stringify({
                memberAddress,
                secret,
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        },
    )
    return json
}

export async function withdraw(communityAddress, memberAddress, wallet) {
    const json = await authFetch(
        `${this.options.restUrl}/communities/${communityAddress}/members/${memberAddress}`,
        this.session,
        {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        }
    ).then((res) => res.json())

    const contract = new Contract(communityAddress, CommunityProduct.abi, wallet)
    const withdrawTx = await contract.withdrawAll(json.withdrawableBlockNumber, json.withdrawableEarnings, json.proof)
    await withdrawTx.wait(2)
}

export async function communityStats(communityAddress) {
    const json = fetch(
        `${this.options.restUrl}/communities/${communityAddress}/stats`,
        {
            method: 'GET',
        },
    ).then((res) => res.json())
    return json
}

export async function memberStats(communityAddress, memberAddress) {
    const json = await fetch(
        `${this.options.restUrl}/communities/${communityAddress}/members/${memberAddress}`,
        {
            method: 'GET',
        }
    ).then((res) => res.json())
    return json
}
