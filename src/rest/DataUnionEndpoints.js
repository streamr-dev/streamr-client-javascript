/**
 * Streamr Data Union related functions
 *
 * Table of Contents:
 *      admin: DEPLOY AND SETUP DATA UNION  Functions for deploying the contract and adding secrets for smooth joining
 *      admin: MANAGE DATA UNION            Kick and add members
 *      member: JOIN & QUERY DATA UNION     Publicly available info about dataunions and their members (with earnings and proofs)
 *      member: WITHDRAW EARNINGS           Withdrawing functions, there's many: normal, agent, donate
 */

import fetch from 'node-fetch'
import {
    Contract,
    ContractFactory,
    Wallet,
    getDefaultProvider,
    providers,
    BigNumber,
    utils as ethersUtils,
} from 'ethers'
import debug from 'debug'

import { until } from '../utils'

import authFetch, { DEFAULT_HEADERS } from './authFetch'

const { computeAddress, getAddress } = ethersUtils

const log = debug('StreamrClient::DataUnionEndpoints')

/** @typedef {String} EthereumAddress */

function throwIfBadAddress(address, variableDescription) {
    try {
        return getAddress(address)
    } catch (e) {
        throw new Error(`${variableDescription || 'Error'}: Bad Ethereum address ${address}. Original error: ${e.stack}.`)
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

async function get(client, dataUnionContractAddress, endpoint, opts = {}) {
    const url = `${client.options.restUrl}/communities/${dataUnionContractAddress}${endpoint}`
    const response = await fetch(url, {
        ...opts,
        headers: {
            ...DEFAULT_HEADERS,
            ...opts.headers,
        },
    })
    const json = await response.json()
    // server may return things like { code: "ConnectionPoolTimeoutException", message: "Timeout waiting for connection from pool" }
    //   they must still be handled as errors
    if (!response.ok && !json.error) {
        json.error = `Server returned ${response.status} ${response.statusText}`
    }

    if (json.code && !json.error) {
        json.error = json.code
    }
    return json
}

async function getOrThrow(...args) {
    const res = await get(...args)
    if (res.error) {
        throw new Error(JSON.stringify(res))
    }
    return res
}

/**
 * @typedef {object} EthereumOptions all optional, hence "options"
 * @property {Wallet | string} wallet or private key, default is currently logged in StreamrClient (if auth: privateKey)
 * @property {string} key private key, alias for String wallet
 * @property {string} privateKey, alias for String wallet
 * @property {providers.Provider} provider to use in case wallet was a String, or omitted
 * @property {number} confirmations, default is 1
 * @property {BigNumber} gasPrice in wei (part of ethers overrides), default is whatever the network recommends (ethers.js default)
 * @see https://docs.ethers.io/ethers.js/html/api-contract.html#overrides
 */
/**
 * @typedef {object} AdditionalDeployOptions for deployDataUnion
 * @property {number} adminFee fraction (number between 0...1 where 1 means 100%)
 * @property {EthereumAddress} tokenAddress stored by community, defaults to DATA, from StreamrClient options
 * @property {EthereumAddress} streamrNodeAddress defaults to StreamrClient options
 * @property {EthereumAddress} streamrOperatorAddress defaults to StreamrClient options
 * @property {EthereumAddress} factoryMainnetAddress defaults to StreamrClient options
 * @property {string} name unique (to the DataUnionFactory) identifier of the new data union, must not exist yet
 */
/**
 * @typedef {EthereumOptions & AdditionalDeployOptions} DeployOptions
 */
// TODO: gasPrice to overrides (not needed for browser, but would be useful in node.js)

function getMainnetProvider(client, options = {}) {
    if (options.provider instanceof providers.Provider) {
        return options.provider
    }

    const mainnetUrl = options.mainnetUrl || client.options.mainnetUrl
    if (mainnetUrl) {
        return new providers.JsonRpcProvider(mainnetUrl)
    }

    return getDefaultProvider()
}

function getSidechainProvider(client) {
    if (!client.options.sidechainUrl) { throw new Error('StreamrClient must be created with a sidechainUrl') }
    return new providers.JsonRpcProvider(client.options.sidechainUrl)
}

/**
 * Get a mainnet wallet from options, e.g. by parsing something that looks like a private key
 * @param {StreamrClient} client this
 * @param {EthereumOptions} options includes wallet which is Wallet or private key, or provider so StreamrClient auth: privateKey will be used
 * @returns {Wallet} "wallet with provider" that can be used to sign and send transactions
 */
function parseMainnetWalletFromOptions(client, options = {}) {
    if (options.wallet instanceof Wallet) { return options.wallet }

    // TODO: check metamask

    const provider = getMainnetProvider(client, options)

    const key = typeof options.wallet === 'string' ? options.wallet : options.key || options.privateKey || client.options.auth.privateKey
    if (!key) {
        throw new Error("Please provide options.wallet, or options.privateKey string, if you're not authenticated using a privateKey")
    }

    return new Wallet(key, provider)
}

/**
 * Get a side-chain wallet by parsing (deploy) options
 */
function parseSidechainWalletFromOptions(client, options = {}) {
    const provider = getSidechainProvider(client)

    let key
    if (!options.wallet) {
        key = options.key || options.privateKey || client.options.auth.privateKey
    } else if (options.wallet instanceof Wallet) {
        key = options.wallet.privateKey
    } else if (typeof options.wallet === 'string') {
        key = options.wallet
    } // TODO: check metamask for privatekey?

    if (!key) {
        throw new Error("Please provide options.wallet, or options.privateKey string, if you're not authenticated using a privateKey")
    }

    return new Wallet(key, provider)
}

// Sidechain contract functions that we might want to call
const dataUnionSidechainABI = [{
    name: 'addMembers',
    inputs: [{ type: 'address[]' }],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'partMembers',
    inputs: [{ type: 'address[]' }],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    // enum ActiveStatus {None, Active, Inactive, Blocked}
    // struct MemberInfo {
    //     ActiveStatus status;
    //     uint256 earnings_before_last_join;
    //     uint256 lme_at_join;
    //     uint256 withdrawnEarnings;
    // }
    name: 'memberData',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    inputs: [],
    name: 'getStats',
    outputs: [{ internalType: 'uint256[5]', name: '', type: 'uint256[5]' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'getWithdrawableEarnings',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'lifetimeMemberEarnings',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'totalWithdrawable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'totalEarnings',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'activeMemberCount',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}]

// Only the part of ABI that is needed by deployment
const factoryMainnetABI = [{
    type: 'constructor',
    inputs: [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }],
    stateMutability: 'nonpayable'
}, {
    name: 'sidechainAddress',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'mainnetAddress',
    inputs: [{ type: 'address' }, { type: 'string' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'deployNewDataUnion',
    inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'address[]' }, { type: 'string' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function'
}]

// //////////////////////////////////////////////////////////////////
//          admin: DEPLOY AND SETUP DATA UNION
// //////////////////////////////////////////////////////////////////

// TODO: calculate addresses in JS instead of asking over RPC, see data-union-solidity/contracts/CloneLib.sol
// key the cache with name only, since PROBABLY one StreamrClient will ever use only one private key
const mainnetAddressCache = {}
async function getDataUnionMainnetAddress(dataUnionName, factoryMainnetAddress, deployerWallet) {
    if (!mainnetAddressCache[dataUnionName]) {
        const factoryMainnet = new Contract(factoryMainnetAddress, factoryMainnetABI, deployerWallet)
        const promise = factoryMainnet.mainnetAddress(deployerWallet.address, dataUnionName)
        mainnetAddressCache[dataUnionName] = promise
        const value = await promise
        mainnetAddressCache[dataUnionName] = value // eslint-disable-line require-atomic-updates
    }
    return mainnetAddressCache[dataUnionName]
}

const sidechainAddressCache = {}
async function getDataUnionSidechainAddress(dataUnionName, factoryMainnetAddress, deployerWallet) {
    if (!sidechainAddressCache[dataUnionName]) {
        const factoryMainnet = new Contract(factoryMainnetAddress, factoryMainnetABI, deployerWallet)
        const promise = getDataUnionMainnetAddress(factoryMainnet, deployerWallet.address, dataUnionName)
            .then((m) => factoryMainnet.sidechainAddress(m))
        sidechainAddressCache[dataUnionName] = promise
        const value = await promise
        sidechainAddressCache[dataUnionName] = value // eslint-disable-line require-atomic-updates
    }
    return sidechainAddressCache[dataUnionName]
}

/**
 * Deploy a new DataUnion contract and create the required joinPartStream
 * Note that the Promise resolves with an ethers.js TransactionResponse, so it's only sent to the chain at that point, but not yet deployed
 * @param {DeployOptions} options such as adminFee (default: 0)
 * @return {Promise<Contract>} resolves when mainnet transaction is done, has method so that caller can `await dataUnion.isReady()` i.e. deployed over the bridge to side-chain
 */
export async function deployDataUnion(options) {
    const walletMainnet = parseMainnetWalletFromOptions(this, options)
    const walletSidechain = parseSidechainWalletFromOptions(this, options)
    const {
        dataUnionName,
        adminFee = 0,
        tokenAddress = this.options.tokenAddress,
        factoryMainnetAddress = this.options.factoryMainnetAddress,
        sidechainPollingIntervalMs = 1000,
        sidechainRetryTimeoutMs = 600000,
    } = options

    await throwIfNotContract(walletMainnet.provider, tokenAddress, 'options.tokenAddress')
    await throwIfNotContract(walletMainnet.provider, factoryMainnetAddress, 'options.factoryMainnetAddress')

    let duName = dataUnionName
    if (!duName) {
        duName = `DataUnion-${+new Date()}`
        log(`dataUnionName generated: ${duName}`)
    }

    if (adminFee < 0 || adminFee > 1) { throw new Error('options.adminFeeFraction must be a number between 0...1, got: ' + adminFee) }
    const adminFeeBN = BigNumber.from((adminFee * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish

    const factoryMainnet = new Contract(factoryMainnetAddress, factoryMainnetABI, walletMainnet)

    const duMainnetAddress = await getDataUnionMainnetAddress(duName, factoryMainnetAddress, walletMainnet)
    const duSidechainAddress = await getDataUnionSidechainAddress(duName, factoryMainnetAddress, walletMainnet)

    if (await walletMainnet.provider.getCode(duMainnetAddress) !== '0x') {
        throw new Error(`Mainnet data union "${duName}" contract ${duMainnetAddress} already exists!`)
    }

    const tx = await factoryMainnet.deployNewDataUnion(
        walletMainnet.address,
        adminFeeBN,
        [walletMainnet.address],
        duName,
    )
    const promise = tx.wait().then(() => {
        // add method so that caller can `await dataUnion.isReady()` i.e. deployed over the bridge to side-chain
        const duSidechain = new Contract(duSidechainAddress, dataUnionSidechainABI, walletSidechain)
        duSidechain.isReady = until(
            async () => await walletSidechain.getCode(duSidechainAddress) !== '0x',
            sidechainRetryTimeoutMs,
            sidechainPollingIntervalMs
        )
        return duSidechain
    })

    log(`Data Union "${duName}" contract (mainnet: ${duMainnetAddress}, sidechain: ${duSidechainAddress}) deployment started`)
    return promise
}

/**
 * Add a new data union secret
 * @param {EthereumAddress} dataUnionContractAddress
 * @param {String} secret password that can be used to join the data union without manual verification
 * @param {String} name describes the secret
 */
export async function createSecret(dataUnionContractAddress, secret, name = 'Untitled Data Union Secret') {
    const url = `${this.options.restUrl}/communities/${dataUnionContractAddress}/secrets`
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
//          admin: MANAGE DATA UNION
// //////////////////////////////////////////////////////////////////

/**
 * Kick given members from data union
 * @param {EthereumAddress} dataunionSidechainAddress to manage
 * @param {List<EthereumAddress>} memberAddressList to kick
 * @returns {Promise<TransactionReceipt>} addMembers sidechain transaction
 */
export async function kick(dataunionSidechainAddress, memberAddressList, options) {
    const wallet = parseSidechainWalletFromOptions(this, options)
    const duSidechain = new Contract(dataunionSidechainAddress, dataUnionSidechainABI, wallet)
    const members = memberAddressList.map(getAddress)
    const tx = await duSidechain.addMembers(members)
    // TODO: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
    return tx.wait()
}

/**
 * Add given Ethereum addresses as data union members
 * @param {EthereumAddress} dataUnionContractAddress to manage
 * @param {List<EthereumAddress>} memberAddressList to add
 * @returns {Promise<TransactionReceipt>} addMembers sidechain transaction
 */
export async function addMembers(dataunionSidechainAddress, memberAddressList, options) {
    const wallet = parseSidechainWalletFromOptions(this, options)
    const duSidechain = new Contract(dataunionSidechainAddress, dataUnionSidechainABI, wallet)
    const members = memberAddressList.map(getAddress)
    const tx = await duSidechain.addMembers(members)
    // TODO: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
    return tx.wait()
}

/**
 * Admin: withdraw earnings (pay gas) on behalf of a member
 * @param {EthereumAddress} memberAddress the other member who gets their tokens out of the Data Union
 * @param {EthereumAddress} dataunionSidechainAddress to withdraw my earnings from
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdrawMember(memberAddress, dataunionSidechainAddress, options) {
    const tx = await this.getWithdrawTxFor(memberAddress, dataunionSidechainAddress, options)
    return tx.wait(options.confirmations || 1)
}

/**
 * Admin: get the tx promise for withdrawing all earnings on behalf of a member
 * @param {EthereumAddress} memberAddress the other member who gets their tokens out of the Data Union
 * @param {EthereumAddress} dataunionSidechainAddress to withdraw my earnings from
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawMemberTx(memberAddress, dataunionSidechainAddress, options) {
    const wallet = parseSidechainWalletFromOptions(this, options)
    const duSidechain = new Contract(dataunionSidechainAddress, dataUnionSidechainABI, wallet)
    return duSidechain.withdrawAll(memberAddress, true) // sendToMainnet=true
}

/**
 * Admin: Withdraw a member's earnings to another address, signed by the member
 * @param {EthereumAddress} dataunionSidechainAddress to withdraw my earnings from
 * @param {EthereumAddress} memberAddress the member whose earnings are sent out
 * @param {EthereumAddress} recipientAddress the address to receive the tokens in mainnet
 * @param {string} signature from member, produced using signWithdrawTo
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdrawToSigned(memberAddress, recipientAddress, signature, dataunionSidechainAddress, options) {
    const tx = await this.getWithdrawTxTo(memberAddress, recipientAddress, signature, dataunionSidechainAddress, options)
    return tx.wait(options.confirmations || 1)
}

/**
 * Admin: Withdraw a member's earnings to another address, signed by the member
 * @param {EthereumAddress} dataunionSidechainAddress to withdraw my earnings from
 * @param {EthereumAddress} memberAddress the member whose earnings are sent out
 * @param {EthereumAddress} recipientAddress the address to receive the tokens in mainnet
 * @param {string} signature from member, produced using signWithdrawTo
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawToSignedTx(memberAddress, recipientAddress, signature, dataunionSidechainAddress, options) {
    const wallet = parseSidechainWalletFromOptions(this, options)
    const duSidechain = new Contract(dataunionSidechainAddress, dataUnionSidechainABI, wallet)
    return duSidechain.withdrawAllToSigned(memberAddress, recipientAddress, true, signature) // sendToMainnet=true
}

// //////////////////////////////////////////////////////////////////
//          member: JOIN & QUERY DATA UNION
// //////////////////////////////////////////////////////////////////

/**
 * Send a joinRequest, or get into data union instantly with a data union secret
 * @param {EthereumAddress} dataUnionContractAddress to join
 * @param {String} secret (optional) if given, and correct, join the data union immediately
 */
export async function joinDataUnion(dataUnionContractAddress, secret) {
    const authKey = this.options.auth && this.options.auth.privateKey
    if (!authKey) {
        throw new Error('joinDataUnion: StreamrClient must have auth: privateKey')
    }

    const body = {
        memberAddress: computeAddress(authKey)
    }
    if (secret) { body.secret = secret }

    const url = `${this.options.restUrl}/communities/${dataUnionContractAddress}/joinRequests`
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
 * Parse address, or use this client's auth address if input not given
 * @param {StreamrClient} this
 * @param {EthereumAddress} inputAddress from user (NOT case sensitive)
 * @returns {EthereumAddress} with checksum case
 */
function parseAddress(client, inputAddress) {
    if (inputAddress) { return getAddress(inputAddress) }

    const authKey = client.options.auth && client.options.auth.privateKey
    if (!authKey) { throw new Error("StreamrClient wasn't authenticated with privateKey, and memberAddress argument not supplied") }
    return computeAddress(authKey)
}

/**
 * Await this function when you want to make sure a member is accepted in the data union
 * @param {EthereumAddress} dataunionSidechainAddress to query
 * @param {EthereumAddress} memberAddress (optional, default is StreamrClient's auth: privateKey)
 * @param {Number} pollingIntervalMs (optional, default: 1000) ask server if member is in
 * @param {Number} retryTimeoutMs (optional, default: 60000) give up
 * @return {Promise} resolves when member is in the data union (or fails with HTTP error)
 */
export async function hasJoined(dataunionSidechainAddress, memberAddress, pollingIntervalMs = 1000, retryTimeoutMs = 60000) {
    const address = parseAddress(memberAddress)
    const provider = getSidechainProvider(this)
    const duSidechain = new Contract(dataunionSidechainAddress, dataUnionSidechainABI, provider)

    // memberData[0] is enum ActiveState, and zero means member doesn't exist
    // await until(async () => (await duSidechain.memberData(address))[0] !== 0, retryTimeoutMs, pollingIntervalMs)
    // TODO: replace with the line above
    console.log('********************************')
    console.log('Polling hasJoined')
    console.log('********************************')
    await until(async () => {
        const data = await duSidechain.memberData(address)
        console.log(data)
        console.log(JSON.stringify(data))
        return data[0] !== 0 // TODO: check if this is correct
    }, retryTimeoutMs, pollingIntervalMs)
}

/**
 * Get stats of a single data union member, including proof
 * @param {EthereumAddress} dataunionSidechainAddress to query
 * @param {EthereumAddress} memberAddress (optional) if not supplied, get the stats of currently logged in StreamrClient (if auth: privateKey)
 */
export async function getMemberStats(dataunionSidechainAddress, memberAddress) {
    const address = parseAddress(memberAddress)
    const provider = getSidechainProvider(this)
    const duSidechain = new Contract(dataunionSidechainAddress, dataUnionSidechainABI, provider)
    // TODO: parse memberData before returning
    return duSidechain.memberData(address)
}

/**
 * @typedef {Object} BalanceResponse
 * @property {BigNumber} total tokens earned less withdrawn previously, what you'd get once Operator commits the earnings to DataUnion contract
 * @property {BigNumber} withdrawable number of tokens that you'd get if you withdraw now
 */

/**
 * Calculate the amount of tokens the member would get from a successful withdraw
 * @param dataunionSidechainAddress to query
 * @param memberAddress whose balance is returned
 * @return {Promise<BalanceResponse>}
 */
export async function getBalance(dataunionSidechainAddress, memberAddress) {
    const address = parseAddress(memberAddress)
    const provider = getSidechainProvider(this)
    const duSidechain = new Contract(dataunionSidechainAddress, dataUnionSidechainABI, provider)

    const total = await duSidechain.getEarnings(address)
    const withdrawable = await duSidechain.getWithdrawableEarnings(address)
    return { total, withdrawable }
}

// TODO: this needs more thought: probably something like getEvents from sidechain? Heavy on RPC?
export async function getMembers(dataunionSidechainAddress) {
    throw new Error(`Not implemented for side-chain data union (at ${dataunionSidechainAddress})`)
    // event MemberJoined(address indexed);
    // event MemberParted(address indexed);
}

export async function getDataUnionStats(dataunionSidechainAddress) {
    const provider = getSidechainProvider(this)
    const duSidechain = new Contract(dataunionSidechainAddress, dataUnionSidechainABI, provider)
    const [
        totalEarnings,
        totalEarningsWithdrawn,
        memberCount,
        lifetimeMemberEarnings,
        joinPartAgentCount
    ] = await duSidechain.getStats()
    const totalWithdrawable = totalEarnings.sub(totalEarningsWithdrawn)
    return {
        memberCount,
        joinPartAgentCount,
        totalEarnings,
        totalWithdrawable,
        lifetimeMemberEarnings,
    }
}

// //////////////////////////////////////////////////////////////////
//          member: WITHDRAW EARNINGS
// //////////////////////////////////////////////////////////////////

/**
 * Withdraw all your earnings
 * @param {EthereumAddress} dataunionSidechainAddress to withdraw my earnings from
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdraw(dataunionSidechainAddress, options) {
    const tx = await this.getWithdrawTx(dataunionSidechainAddress, options)
    return tx.wait(options.confirmations || 1)
}

/**
 * Get the tx promise for withdrawing all your earnings
 * @param {EthereumAddress} dataunionSidechainAddress to withdraw my earnings from
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawTx(dataunionSidechainAddress, options) {
    const wallet = parseSidechainWalletFromOptions(this, options)
    const duSidechain = new Contract(dataunionSidechainAddress, dataUnionSidechainABI, wallet)
    return duSidechain.withdrawAll(wallet.address, true) // sendToMainnet=true
}

/**
 * Withdraw earnings and "donate" them to the given address
 * @param {EthereumAddress} dataunionSidechainAddress to withdraw my earnings from
 * @param {EthereumAddress} recipientAddress the address to receive the tokens
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdrawTo(recipientAddress, dataunionSidechainAddress, options) {
    const tx = await this.getWithdrawTxTo(recipientAddress, dataunionSidechainAddress, options)
    return tx.wait(options.confirmations || 1)
}

/**
 * Withdraw earnings and "donate" them to the given address
 * @param {EthereumAddress} dataunionSidechainAddress to withdraw my earnings from
 * @param {EthereumAddress} recipientAddress the address to receive the tokens
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawTxTo(recipientAddress, dataunionSidechainAddress, options) {
    const wallet = parseSidechainWalletFromOptions(this, options)
    const duSidechain = new Contract(dataunionSidechainAddress, dataUnionSidechainABI, wallet)
    return duSidechain.withdrawAllTo(recipientAddress, true) // sendToMainnet=true
}

/**
 * Member can sign off to "donate" all earnings to another address such that someone else
 *   can submit the transaction (and pay for the gas)
 * @param {EthereumAddress} recipientAddress the address authorized to receive the tokens
 * @returns {string} signature authorizing withdrawing all earnings to given recipientAddress
 */
export async function signWithdrawTo(recipientAddress, dataunionSidechainAddress, options) {
    const wallet = parseSidechainWalletFromOptions(this, options)
    const duSidechain = new Contract(dataunionSidechainAddress, dataUnionSidechainABI, wallet)
    const withdrawn = await duSidechain.getWithdrawn(wallet.address)
    const message = recipientAddress + '0' + dataunionSidechainAddress.slice(2) + withdrawn.toString(16, 64)
    const signature = await wallet.signMessage(message)
    return signature
}

/**
 * Member can sign off to "donate" specific amount of earnings to another address such that someone else
 *   can submit the transaction (and pay for the gas)
 * @param {BigNumber|number|string} amount that the signature is for (can't be used for less or for more)
 * @param {EthereumAddress} recipientAddress the address authorized to receive the tokens
 * @returns {string} signature authorizing withdrawing all earnings to given recipientAddress
 */
export async function signWithdrawAmountTo(amount, recipientAddress, dataunionSidechainAddress, options) {
    const wallet = parseSidechainWalletFromOptions(this, options)
    const duSidechain = new Contract(dataunionSidechainAddress, dataUnionSidechainABI, wallet)
    const withdrawn = await duSidechain.getWithdrawn(wallet.address)
    const message = recipientAddress + amount.toString(16, 64) + dataunionSidechainAddress.slice(2) + withdrawn.toString(16, 64)
    const signature = await wallet.signMessage(message)
    return signature
}
