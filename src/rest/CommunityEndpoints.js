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

export async function memberStats(communityAddress, memberAddress) {
    const json = await fetch(
        `${this.options.restUrl}/communities/${communityAddress}/members/${memberAddress}`,
        {}
    ).then((res) => res.json())
    return json
}

export async function withdraw(communityAddress, memberAddress, wallet, confirmations = 1) {
    const stats = memberStats(communityAddress, memberAddress)
    const contract = new Contract(communityAddress, CommunityProduct.abi, wallet)
    const withdrawTx = await contract.withdrawAll(stats.withdrawableBlockNumber, stats.withdrawableEarnings, stats.proof)
    await withdrawTx.wait(confirmations)
}

export async function communityStats(communityAddress) {
    const json = fetch(
        `${this.options.restUrl}/communities/${communityAddress}/stats`,
        {},
    ).then((res) => res.json())
    return json
}
