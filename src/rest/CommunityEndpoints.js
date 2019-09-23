import fetch from 'node-fetch'
import { Contract } from 'ethers'

import authFetch from './authFetch'

const CommunityProduct = require('../../CommunityProduct.json')

export async function joinCommunity(communityAddress, memberAddress, secret = undefined) {
    const url = `${this.options.restUrl}/communities/${communityAddress}/joinRequests`
    return authFetch(
        url,
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
}

export async function memberStats(communityAddress, memberAddress) {
    const url = `${this.options.restUrl}/communities/${communityAddress}/members/${memberAddress}`
    return fetch(url).then((res) => res.json())
}

export async function withdraw(communityAddress, memberAddress, wallet, confirmations = 1) {
    const stats = await this.memberStats(communityAddress, memberAddress)
    if (!stats.withdrawableBlockNumber) {
        throw new Error('No earnings to withdraw.')
    }
    const contract = new Contract(communityAddress, CommunityProduct.abi, wallet)
    const withdrawTx = await contract.withdrawAll(stats.withdrawableBlockNumber, stats.withdrawableEarnings, stats.proof)
    await withdrawTx.wait(confirmations)
}

export async function communityStats(communityAddress) {
    const url = `${this.options.restUrl}/communities/${communityAddress}/stats`
    return fetch(url).then((res) => res.json())
}

export async function createSecret(communityAddress, secret, name = 'Untitled Community Secret') {
    const url = `${this.options.restUrl}/communities/${communityAddress}/secrets`
    return authFetch(
        url,
        this.session,
        {
            method: 'POST',
            body: JSON.stringify({
                name,
                secret,
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        },
    )
}

