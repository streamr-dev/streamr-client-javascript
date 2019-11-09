/**
 * Streamr community product related functions
 *
 * Table of Contents:
 *      admin: DEPLOY AND SETUP COMMUNITY   Functions for deploying the contract and adding secrets for smooth joining
 *      member: JOIN & QUERY COMMUNITY      Publicly available info about communities and their members (with earnings and proofs)
 *      member: WITHDRAW EARNINGS           Withdrawing functions, there's many: normal, agent, donate
 *      admin: MANAGE COMMUNITY             Kick and add members
 */

import fetch from 'node-fetch'
import {
    Contract,
    ContractFactory,
    utils,
    Wallet,
    getDefaultProvider,
    providers,
} from 'ethers'
import { computeAddress } from 'ethers/utils'

import * as CommunityProduct from '../../contracts/CommunityProduct.json'

import authFetch from './authFetch'

/** @typedef {String} EthereumAddress */

function throwIfBadAddress(address, variableDescription) {
    try {
        return utils.getAddress(address)
    } catch (e) {
        throw new Error(`${variableDescription || 'Error'}: Bad Ethereum address ${address}`)
    }
}

async function throwIfNotContract(eth, address, variableDescription) {
    const addr = throwIfBadAddress(address, variableDescription)
    if (await eth.getCode(address) === '0x') {
        throw new Error(`${variableDescription || 'Error'}: No contract at ${address}`)
    }
    return addr
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

/**
 * Get a wallet from something that looks like a private key
 * @param {Wallet | String | Provider} arg anything accepted by these functions: Wallet or private key, or provider so StreamrClient auth: privateKey will be used
 * @returns {Wallet} "wallet with provider" that can be used to sign and send transactions
 */
async function parseWalletFrom(arg) {
    if (arg instanceof Wallet) { return arg }

    if (typeof arg === 'string') { return new Wallet(arg, getDefaultProvider()) }

    // use the same Ethereum account as this client is authenticated with
    const key = this.options.auth.privateKey
    if (key) {
        const provider = arg instanceof providers.Provider ? arg : getDefaultProvider()
        return new Wallet(key, provider) // eslint-disable-line no-param-reassign
    }

    // TODO: check metamask before erroring!
    throw new Error("Please provide a Wallet or private key string if you're not authenticated using a privateKey")
}

// //////////////////////////////////////////////////////////////////
//          admin: DEPLOY AND SETUP COMMUNITY
// //////////////////////////////////////////////////////////////////

/**
 * Deploy a new CommunityProduct contract and create the required joinPartStream
 * Note that the Promise resolves with an ethers
 * @param {Wallet} wallet to do the deployment from, also becomes owner or stream and contract
 * @param {Number} blockFreezePeriodSeconds security parameter against operator failure (optional, default: 0)
 * @param {Number} adminFee fraction of revenue that goes to product admin, 0...1 (optional, default: 0)
 * @param {Function} logger will print debug info if given (optional)
 * @return {TransactionResponse} has methods that can be awaited: contract is deployed (`.deployed()`), operator is started (`.isReady()`)
 */
export async function deployCommunity(wallet, blockFreezePeriodSeconds = 0, adminFee = 0, logger) {
    await throwIfNotContract(wallet.provider, this.options.tokenAddress, 'deployCommunity function argument tokenAddress')
    await throwIfBadAddress(this.options.streamrNodeAddress, 'StreamrClient option streamrNodeAddress')

    if (adminFee < 0 || adminFee > 1) { throw new Error('Admin fee must be a number between 0...1, got: ' + adminFee) }
    const adminFeeBN = new utils.BigNumber((adminFee * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish

    const stream = await this.getOrCreateStream({
        name: `Join-Part-${wallet.address.slice(0, 10)}-${Date.now()}`
    })
    const res1 = await stream.grantPermission('read', null)
    if (logger) { logger(`Grant read permission response from server: ${JSON.stringify(res1)}`) }
    const res2 = await stream.grantPermission('write', this.options.streamrNodeAddress)
    if (logger) { logger(`Grant write permission response to ${this.options.streamrNodeAddress} from server: ${JSON.stringify(res2)}`) }

    const deployer = new ContractFactory(CommunityProduct.abi, CommunityProduct.bytecode, wallet)
    const result = await deployer.deploy(this.options.streamrOperatorAddress, stream.id,
        this.options.tokenAddress, blockFreezePeriodSeconds, adminFeeBN)
    const address = result.address     // this can be known in advance

    // add the waiting method so that caller can await community being operated by server (so that EE calls work)
    const client = this
    result.isReady = async (pollingIntervalMs, timeoutMs) => client.communityIsReady(address, pollingIntervalMs, timeoutMs, logger)
    return result
}

/**
 * Await this function when you want to make sure a community is deployed and ready to use
 * @param {EthereumAddress} address of the community
 * @param {Number} pollingIntervalMs (optional, default: 1000) ask server if community is ready
 * @param {Number} timeoutMs (optional, default: 60000) give up
 * @return {Promise} resolves when community server is ready to operate the community (or fails with HTTP error)
 */
export async function communityIsReady(address, pollingIntervalMs, timeoutMs, logger) {
    let stats = await this.getCommunityStats(address)
    const startTime = Date.now()
    while (stats.error && Date.now() < startTime + (timeoutMs || 60000)) {
        if (logger) { logger(`Waiting for community ${address} to start. Status: ${JSON.stringify(stats)}`) }
        await sleep(pollingIntervalMs || 1000)
        stats = await this.getCommunityStats(address)
    }
    if (stats.error) {
        throw new Error(`Community failed to start within ${timeoutMs} ms. Status: ${JSON.stringify(stats)}`)
    }
}

/**
 * Add a new community secret
 * @param {EthereumAddress} communityAddress
 * @param {String} secret password that can be used to join the community without manual verification
 * @param {String} name describes the secret
 */
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

// //////////////////////////////////////////////////////////////////
//          member: JOIN & QUERY COMMUNITY
// //////////////////////////////////////////////////////////////////

/**
 * Send a joinRequest, or get into community instantly with a community secret
 * @param {EthereumAddress} communityAddress to join
 * @param {String} secret (optional) if given, and correct, join the community immediately
 * @param {EthereumAddress} myAddress (optional) only needed if StreamrClient wasn't authenticated using an Ethereum private key (e.g. using apiKey)
 */
export async function joinCommunity(communityAddress, secret, myAddress) {
    let memberAddress = myAddress
    if (!memberAddress) {
        const authKey = this.options.auth && this.options.auth.privateKey
        if (!authKey) {
            throw new Error("StreamrClient wasn't authenticated with privateKey, and myAddress argument not supplied")
        }
        memberAddress = computeAddress(authKey)
    }

    const body = {
        memberAddress
    }
    if (secret) { body.secret = secret }

    const url = `${this.options.restUrl}/communities/${communityAddress}/joinRequests`
    return authFetch(
        url,
        this.session,
        {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'application/json',
            },
        },
    )
}

/**
 * Await this function when you want to make sure a member is accepted in the community
 * @param {EthereumAddress} communityAddress
 * @param {EthereumAddress} memberAddress
 * @param {Number} pollingIntervalMs (optional, default: 1000) ask server if member is in
 * @param {Number} timeoutMs (optional, default: 60000) give up
 * @return {Promise} resolves when member is in the community (or fails with HTTP error)
 */
export async function memberHasJoined(communityAddress, memberAddress, pollingIntervalMs, timeoutMs, logger) {
    let stats = await this.getMemberStats(communityAddress, memberAddress)
    const startTime = Date.now()
    while (stats.error && Date.now() < startTime + (timeoutMs || 60000)) {
        if (logger) { logger(`Waiting for member ${memberAddress} to be accepted into community ${communityAddress}. Status: ${JSON.stringify(stats)}`) }
        await sleep(pollingIntervalMs || 1000)
        stats = await this.getMemberStats(communityAddress, memberAddress)
    }
    if (stats.error) {
        throw new Error(`Member failed to join within ${timeoutMs} ms. Status: ${JSON.stringify(stats)}`)
    }
}

/**
 * Get stats of a single community member, including proof
 * @param {EthereumAddress} communityAddress to query
 * @param {EthereumAddress} memberAddress (optional) if not supplied, get the stats of currently logged in StreamrClient (if auth: privateKey)
 */
export async function getMemberStats(communityAddress, memberAddress) {
    let address = memberAddress
    if (!address) {
        const authKey = this.options.auth && this.options.auth.privateKey
        if (!authKey) {
            throw new Error("StreamrClient wasn't authenticated with privateKey, and memberAddress argument not supplied")
        }
        address = computeAddress(authKey)
    }

    const url = `${this.options.restUrl}/communities/${communityAddress}/members/${address}`
    return fetch(url).then((response) => {
        const result = response.json()
        if (result.error) {
            throw new Error(result.error)
        }
        return result
    })
}

// TODO: filter? That JSON blob could be big
export async function getMembers(communityAddress) {
    const url = `${this.options.restUrl}/communities/${communityAddress}/members`
    return fetch(url).then((res) => res.json())
}

export async function getCommunityStats(communityAddress) {
    const url = `${this.options.restUrl}/communities/${communityAddress}/stats`
    return fetch(url).then((res) => res.json())
}

// //////////////////////////////////////////////////////////////////
//          member: WITHDRAW EARNINGS
// //////////////////////////////////////////////////////////////////

/**
 * Validate the proof given by the server with the smart contract (ground truth)
 * @param {EthereumAddress} communityAddress to query
 * @param {EthereumAddress} memberAddress to query
 * @param {providers.Provider} provider (optional) e.g. `wallet.provider`, default is `ethers.getDefaultProvider()` (mainnet)
 */
export async function validateProof(communityAddress, memberAddress, provider) {
    const stats = await this.memberStats(communityAddress, memberAddress)
    const contract = new Contract(communityAddress, CommunityProduct.abi, provider || getDefaultProvider())
    return contract.proofIsCorrect(
        stats.withdrawableBlockNumber,
        memberAddress,
        stats.withdrawableEarnings,
        stats.proof,
    )
}

/**
 * @typedef {Object} WithdrawOptions all optional, hence "options"
 * @property {Wallet | String} wallet or private key, default is currently logged in StreamrClient (if auth: privateKey)
 * @property {Number} confirmations, default is 1
 * @property {BigNumber} gasPrice in wei (part of ethers overrides), default is whatever the network recommends (ethers.js default)
 * @see https://docs.ethers.io/ethers.js/html/api-contract.html#overrides
 */

// TODO: gasPrice to overrides (not needed for browser, but would be useful in node.js)

/**
 * Withdraw all your earnings
 * @param {EthereumAddress} communityAddress
 * @param {WithdrawOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdraw(communityAddress, options) {
    const tx = await this.getWithdrawTx(communityAddress, options)
    return tx.wait(options.confirmations || 1)
}

/**
 * Get the tx promise for withdrawing all your earnings
 * @param {EthereumAddress} communityAddress
 * @param {WithdrawOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawTx(communityAddress, options) {
    const wallet = parseWalletFrom(options.wallet)
    const stats = await this.memberStats(communityAddress, wallet.address)
    if (!stats.withdrawableBlockNumber) {
        throw new Error('No earnings to withdraw.')
    }
    const contract = new Contract(communityAddress, CommunityProduct.abi, wallet)
    return contract.withdrawAll(stats.withdrawableBlockNumber, stats.withdrawableEarnings, stats.proof)
}

/**
 * Withdraw earnings on behalf of another member
 * @param {EthereumAddress} memberAddress the other member who gets its tokens out of the Community
 * @param {EthereumAddress} communityAddress
 * @param {WithdrawOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdrawFor(memberAddress, communityAddress, options) {
    const tx = await this.getWithdrawTxFor(memberAddress, communityAddress, options)
    return tx.wait(options.confirmations || 1)
}

/**
 * Get the tx promise for withdrawing all earnings on behalf of another member
 * @param {EthereumAddress} communityAddress
 * @param {WithdrawOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawTxFor(memberAddress, communityAddress, options) {
    const stats = await this.memberStats(communityAddress, memberAddress)
    if (!stats.withdrawableBlockNumber) {
        throw new Error('No earnings to withdraw.')
    }
    const wallet = parseWalletFrom(options.wallet)
    const contract = new Contract(communityAddress, CommunityProduct.abi, wallet)
    return contract.withdrawAllFor(memberAddress, stats.withdrawableBlockNumber, stats.withdrawableEarnings, stats.proof)
}

/**
 * Withdraw earnings and "donate" them to the given address
 * @param {EthereumAddress} communityAddress
 * @param {EthereumAddress} recipientAddress the other member who gets its tokens out of the Community
 * @param {WithdrawOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdrawTo(recipientAddress, communityAddress, options) {
    const tx = await this.getWithdrawTxTo(recipientAddress, communityAddress, options)
    return tx.wait(options.confirmations || 1)
}

/**
 * Withdraw earnings and "donate" them to the given address
 * @param {EthereumAddress} communityAddress
 * @param {EthereumAddress} recipientAddress the other member who gets its tokens out of the Community
 * @param {WithdrawOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawTxTo(recipientAddress, communityAddress, options) {
    const wallet = parseWalletFrom(options.wallet)
    const stats = await this.memberStats(communityAddress, wallet.address)
    if (!stats.withdrawableBlockNumber) {
        throw new Error('No earnings to withdraw.')
    }
    const contract = new Contract(communityAddress, CommunityProduct.abi, wallet)
    return contract.withdrawAllTo(recipientAddress, stats.withdrawableBlockNumber, stats.withdrawableEarnings, stats.proof, options)
}

// //////////////////////////////////////////////////////////////////
//          admin: MANAGE COMMUNITY
// //////////////////////////////////////////////////////////////////

/**
 * Directly poke into joinPartStream, circumventing EE joinRequest tools etc.
 * Obviously requires write access to the stream, so only available to admins
 * TODO: find a way to check that the join/part has gone through and been registered by the server
 */
async function sendToJoinPartStream(client, type, communityAddress, addresses, provider) {
    const contract = new Contract(communityAddress, CommunityProduct.abi, provider || getDefaultProvider())
    const joinPartStreamId = await contract.joinPartStream()
    return client.publish(joinPartStreamId, {
        type, addresses,
    })
}

/**
 * Kick given members from community
 * @param {EthereumAddress} communityAddress to manage
 * @param {List<EthereumAddress>} memberAddressList to kick
 * @param {providers.Provider} provider (optional) default is mainnet
 */
export async function kick(communityAddress, memberAddressList, provider) {
    return sendToJoinPartStream(this, 'part', communityAddress, memberAddressList, provider)
}

/**
 * Add given Ethereum addresses as community members
 * @param {EthereumAddress} communityAddress to manage
 * @param {List<EthereumAddress>} memberAddressList to kick
 * @param {providers.Provider} provider (optional) default is mainnet
 */
export async function addMembers(communityAddress, memberAddressList, provider) {
    return sendToJoinPartStream(this, 'join', communityAddress, memberAddressList, provider)
}
