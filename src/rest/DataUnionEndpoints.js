/**
 * Streamr Data Union related functions
 *
 * Table of Contents:
 *      generic helpers
 *      ABIs
 *      contract helpers
 *      admin: DEPLOY AND SETUP DATA UNION  Functions for deploying the contract and adding secrets for smooth joining
 *      admin: MANAGE DATA UNION            Kick and add members
 *      member: JOIN & QUERY DATA UNION     Publicly available info about dataunions and their members (with earnings and proofs)
 *      member: WITHDRAW EARNINGS           Withdrawing functions, there's many: normal, agent, donate
 */

import {
    Contract,
    Wallet,
    getDefaultProvider,
    providers,
    BigNumber,
    utils as ethersUtils,
} from 'ethers'
import debug from 'debug'

import { until } from '../utils'

import authFetch from './authFetch'

const {
    computeAddress,
    getAddress,
    isAddress,
} = ethersUtils

const log = debug('StreamrClient::DataUnionEndpoints')
// const log = console.log

// //////////////////////////////////////////////////////////////////
//          Generic utils
// //////////////////////////////////////////////////////////////////

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

// ///////////////////////////////////////////////////////////////////////
//          ABIs: contract functions we want to call within the client
// ///////////////////////////////////////////////////////////////////////

const dataUnionMainnetABI = [{
    name: 'sendTokensToBridge',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'token',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'adminFeesWithdrawable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'withdrawAdminFees',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
}]

const dataUnionSidechainABI = [{
    name: 'addMembers',
    inputs: [{ type: 'address[]', internalType: 'address payable[]', }],
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
    name: 'withdrawAll',
    inputs: [{ type: 'address' }, { type: 'bool' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'withdrawAllTo',
    inputs: [{ type: 'address' }, { type: 'bool' }],
    outputs: [{ type: 'uint256' }],
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
    outputs: [{ type: 'uint256[5]' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'getEarnings',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
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

// Only the part of ABI that is needed by deployment (and address resolution)
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
//          Contract utils
// //////////////////////////////////////////////////////////////////

function getPrivateKey(client, options = {}) {
    const key = typeof options.wallet === 'string' ? options.wallet : options.key || options.privateKey || client.options.auth.privateKey
    if (!key) {
        throw new Error('Please either provide auth.privateKey when creating StreamrClient, or options.privateKey string')
    }
    return key
}

/**
 * Parse address, or use this client's auth address if input not given
 * @param {StreamrClient} this
 * @param {EthereumAddress} inputAddress from user (NOT case sensitive)
 * @returns {EthereumAddress} with checksum case
 */
function parseAddress(client, inputAddress, options = {}) {
    if (isAddress(inputAddress)) {
        return getAddress(inputAddress)
    }
    const key = getPrivateKey(client, options)
    return computeAddress(key)
}

function getMainnetProvider(client, options = {}) {
    if (options.provider instanceof providers.Provider) {
        return options.provider
    }

    const mainnet = options.mainnet || client.options.mainnet
    if (mainnet) {
        return new providers.JsonRpcProvider(mainnet)
    }

    return getDefaultProvider()
}

function getSidechainProvider(client, options = {}) {
    const sidechainOptions = options.sidechain || client.options.sidechain
    if (!sidechainOptions) { throw new Error('StreamrClient must be created with a "sidechain" property for ethers.js provider') }
    return new providers.JsonRpcProvider(sidechainOptions)
}

/**
 * Get a mainnet wallet from options, e.g. by parsing something that looks like a private key
 * @param {StreamrClient} client this
 * @param {EthereumOptions} options includes wallet which is Wallet or private key, or provider so StreamrClient auth: privateKey will be used
 * @returns {Wallet} "wallet with provider" that can be used to sign and send transactions
 */
function getMainnetWallet(client, options = {}) {
    if (options.wallet instanceof Wallet) { return options.wallet }

    // TODO: check metamask

    const provider = getMainnetProvider(client, options)
    const key = getPrivateKey(client, options)
    return new Wallet(key, provider)
}

/**
 * Get a side-chain wallet by parsing (deploy) options
 */
function getSidechainWallet(client, options = {}) {
    const provider = getSidechainProvider(client, options)

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

async function getDataUnionFactoryMainnet(client, options = {}) {
    const factoryMainnetAddress = options.factoryMainnetAddress || client.options.factoryMainnetAddress
    const wallet = getMainnetWallet(client, options)
    await throwIfNotContract(wallet.provider, factoryMainnetAddress, 'options.factoryMainnetAddress')

    const factoryMainnet = new Contract(factoryMainnetAddress, factoryMainnetABI, wallet)
    return factoryMainnet
}

// TODO: calculate addresses in JS instead of asking over RPC, see data-union-solidity/contracts/CloneLib.sol
// key the cache with name only, since PROBABLY one StreamrClient will ever use only one private key
const mainnetAddressCache = {} // mapping: "name" -> mainnet address
/** @returns {Promise<EthereumAddress>} Mainnet address for Data Union */
export async function getDataUnionMainnetAddress(client, dataUnionName, deployerAddress, options = {}) {
    if (!mainnetAddressCache[dataUnionName]) {
        const promise = getDataUnionFactoryMainnet(client, options).then((f) => f.mainnetAddress(deployerAddress, dataUnionName))
        mainnetAddressCache[dataUnionName] = promise
        const value = await promise
        mainnetAddressCache[dataUnionName] = value // eslint-disable-line require-atomic-updates
    }
    return mainnetAddressCache[dataUnionName]
}

// TODO: calculate addresses in JS
const sidechainAddressCache = {} // mapping: mainnet address -> sidechain address
/** @returns {Promise<EthereumAddress>} Sidechain address for Data Union */
export async function getDataUnionSidechainAddress(client, duMainnetAddress, options = {}) {
    if (!sidechainAddressCache[duMainnetAddress]) {
        const promise = getDataUnionFactoryMainnet(client, options).then((f) => f.sidechainAddress(duMainnetAddress))
        sidechainAddressCache[duMainnetAddress] = promise
        const value = await promise
        sidechainAddressCache[duMainnetAddress] = value // eslint-disable-line require-atomic-updates
    }
    return sidechainAddressCache[duMainnetAddress]
}

function getMainnetContract(client, options = {}) {
    const wallet = getMainnetWallet(client, options)
    let dataUnion = options.dataUnion || options.dataUnionAddress || client.options.dataUnion
    if (isAddress(dataUnion)) {
        dataUnion = new Contract(dataUnion, dataUnionMainnetABI, wallet)
    }

    if (!(dataUnion instanceof Contract)) {
        throw new Error(`Option dataUnion=${dataUnion} was not a good Ethereum address or Contract`)
    }
    return dataUnion
}

async function getSidechainContract(client, options = {}) {
    const wallet = getSidechainWallet(client, options)
    const duMainnet = getMainnetContract(client, options)
    const duSidechainAddress = await getDataUnionSidechainAddress(client, duMainnet.address, options)
    const duSidechain = new Contract(duSidechainAddress, dataUnionSidechainABI, wallet)
    return duSidechain
}

// //////////////////////////////////////////////////////////////////
//          admin: DEPLOY AND SETUP DATA UNION
// //////////////////////////////////////////////////////////////////

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
 * @property {EthereumAddress} factoryMainnetAddress defaults to StreamrClient options
 * @property {string} name unique (to the DataUnionFactory) identifier of the new data union, must not exist yet
 */
/**
 * @typedef {EthereumOptions & AdditionalDeployOptions} DeployOptions
 */
// TODO: gasPrice to overrides (not needed for browser, but would be useful in node.js)

/**
 * Create a new DataUnionMainnet contract to mainnet with DataUnionFactoryMainnet
 * This triggers DataUnionSidechain contract creation in sidechain, over the bridge (AMB)
 * @param {DeployOptions} options such as adminFee (default: 0)
 * @return {Promise<Contract>} resolves when mainnet transaction is done, has method so that caller can `await dataUnion.isReady()` i.e. deployed over the bridge to side-chain
 */
export async function deployDataUnion(options = {}) {
    const {
        dataUnionName,
        adminFee = 0,
        sidechainPollingIntervalMs = 1000,
        sidechainRetryTimeoutMs = 600000,
    } = options

    let duName = dataUnionName
    if (!duName) {
        duName = `DataUnion-${+new Date()}`
        log(`dataUnionName generated: ${duName}`)
    }

    if (adminFee < 0 || adminFee > 1) { throw new Error('options.adminFeeFraction must be a number between 0...1, got: ' + adminFee) }
    const adminFeeBN = BigNumber.from((adminFee * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish

    const mainnetWallet = getMainnetWallet(this, options)
    const sidechainWallet = getSidechainWallet(this, options)

    const duMainnetAddress = await getDataUnionMainnetAddress(this, duName, mainnetWallet.address, options)
    const duSidechainAddress = await getDataUnionSidechainAddress(this, duMainnetAddress, options)

    if (await mainnetWallet.provider.getCode(duMainnetAddress) !== '0x') {
        throw new Error(`Mainnet data union "${duName}" contract ${duMainnetAddress} already exists!`)
    }

    const factoryMainnet = await getDataUnionFactoryMainnet(this, options)
    const tx = await factoryMainnet.deployNewDataUnion(
        mainnetWallet.address,
        adminFeeBN,
        [mainnetWallet.address],
        duName,
    )
    const promise = tx.wait().then((tr) => {
        const dataUnion = new Contract(duMainnetAddress, dataUnionMainnetABI, mainnetWallet)
        // add method so that caller can `await dataUnion.isReady()` i.e. deployed over the bridge to side-chain
        dataUnion.isReady = async () => until(
            async () => await sidechainWallet.provider.getCode(duSidechainAddress) !== '0x',
            sidechainRetryTimeoutMs,
            sidechainPollingIntervalMs
        )
        dataUnion.deployTxReceipt = tr
        dataUnion.sidechain = new Contract(duSidechainAddress, dataUnionSidechainABI, sidechainWallet)
        return dataUnion
    })

    log(`Data Union "${duName}" contract (mainnet: ${duMainnetAddress}, sidechain: ${duSidechainAddress}) deployment started`)
    return promise
}

export async function getDataUnionContract(options = {}) {
    const ret = getMainnetContract(this, options)
    ret.sidechain = await getSidechainContract(this, options)
    return ret
}

/**
 * Add a new data union secret
 * @param {EthereumAddress} dataUnionMainnetAddress
 * @param {String} secret password that can be used to join the data union without manual verification
 * @param {String} name describes the secret
 */
export async function createSecret(dataUnionMainnetAddress, secret, name = 'Untitled Data Union Secret') {
    const url = `${this.options.restUrl}/dataunions/${dataUnionMainnetAddress}/secrets`
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
 * @param {List<EthereumAddress>} memberAddressList to kick
 * @returns {Promise<TransactionReceipt>} partMembers sidechain transaction
 */
export async function kick(memberAddressList, options = {}) {
    const duSidechain = await getSidechainContract(this, options)
    const members = memberAddressList.map(getAddress)
    const tx = await duSidechain.partMembers(members)
    // TODO: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
    return tx.wait(options.confirmations || 1)
}

/**
 * Add given Ethereum addresses as data union members
 * @param {List<EthereumAddress>} memberAddressList to add
 * @returns {Promise<TransactionReceipt>} addMembers sidechain transaction
 */
export async function addMembers(memberAddressList, options = {}) {
    const duSidechain = await getSidechainContract(this, options)
    const members = memberAddressList.map(getAddress) // throws if there are bad addresses
    const tx = await duSidechain.addMembers(members)
    // const tx = await duSidechain.addMember(members[0])
    // TODO: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
    return tx.wait(options.confirmations || 1)
}

/**
 * Admin: withdraw earnings (pay gas) on behalf of a member
 * @param {EthereumAddress} memberAddress the other member who gets their tokens out of the Data Union
 * @param {EthereumAddress} dataUnion to withdraw my earnings from
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdrawMember(memberAddress, options = {}) {
    const tx = await this.getWithdrawTxFor(memberAddress, options)
    return tx.wait(options.confirmations || 1)
}

/**
 * Admin: get the tx promise for withdrawing all earnings on behalf of a member
 * @param {EthereumAddress} memberAddress the other member who gets their tokens out of the Data Union
 * @param {EthereumAddress} dataUnion to withdraw my earnings from
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawMemberTx(memberAddress, options) {
    const duSidechain = await getSidechainContract(this, options)
    return duSidechain.withdrawAll(memberAddress, true) // sendToMainnet=true
}

/**
 * Admin: Withdraw a member's earnings to another address, signed by the member
 * @param {EthereumAddress} dataUnion to withdraw my earnings from
 * @param {EthereumAddress} memberAddress the member whose earnings are sent out
 * @param {EthereumAddress} recipientAddress the address to receive the tokens in mainnet
 * @param {string} signature from member, produced using signWithdrawTo
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdrawToSigned(memberAddress, recipientAddress, signature, options = {}) {
    const tx = await this.getWithdrawTxTo(memberAddress, recipientAddress, signature, options)
    return tx.wait(options.confirmations || 1)
}

/**
 * Admin: Withdraw a member's earnings to another address, signed by the member
 * @param {EthereumAddress} dataUnion to withdraw my earnings from
 * @param {EthereumAddress} memberAddress the member whose earnings are sent out
 * @param {EthereumAddress} recipientAddress the address to receive the tokens in mainnet
 * @param {string} signature from member, produced using signWithdrawTo
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawToSignedTx(memberAddress, recipientAddress, signature, options) {
    const duSidechain = await getSidechainContract(this, options)
    return duSidechain.withdrawAllToSigned(memberAddress, recipientAddress, true, signature) // sendToMainnet=true
}

// //////////////////////////////////////////////////////////////////
//          member: JOIN & QUERY DATA UNION
// //////////////////////////////////////////////////////////////////

/**
 * Send a joinRequest, or get into data union instantly with a data union secret
 * @param {JoinOptions} options
 *
 * @typedef {object} JoinOptions
 * @property {String} dataUnion Ethereum mainnet address of the data union. If not given, use one given when creating StreamrClient
 * @property {String} member Ethereum mainnet address of the joining member. If not given, use StreamrClient authentication key
 * @property {String} secret if given, and correct, join the data union immediately
 */
export async function joinDataUnion(options = {}) {
    const {
        member,
        secret,
    } = options
    const dataUnion = getMainnetContract(this, options)

    const body = {
        memberAddress: parseAddress(this, member, options)
    }
    if (secret) { body.secret = secret }

    const url = `${this.options.restUrl}/dataunions/${dataUnion.address}/joinRequests`
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
 * Await this function when you want to make sure a member is accepted in the data union
 * @param {EthereumAddress} memberAddress (optional, default is StreamrClient's auth: privateKey)
 * @param {Number} pollingIntervalMs (optional, default: 1000) ask server if member is in
 * @param {Number} retryTimeoutMs (optional, default: 60000) give up
 * @return {Promise} resolves when member is in the data union (or fails with HTTP error)
 */
export async function hasJoined(memberAddress, options = {}) {
    const {
        pollingIntervalMs = 1000,
        retryTimeoutMs = 60000,
    } = options
    const address = parseAddress(this, memberAddress, options)
    const duSidechain = await getSidechainContract(this, options)

    // memberData[0] is enum ActiveStatus {None, Active, Inactive}, and zero means member has never joined
    await until(async () => (await duSidechain.memberData(address))[0] !== 0, retryTimeoutMs, pollingIntervalMs)
}

/**
 * Get stats of a single data union member
 * @param {EthereumAddress} dataUnion to query
 * @param {EthereumAddress} memberAddress (optional) if not supplied, get the stats of currently logged in StreamrClient (if auth: privateKey)
 */
export async function getMemberStats(memberAddress, options) {
    const address = parseAddress(this, memberAddress, options)
    const duSidechain = await getSidechainContract(this, options)
    const mdata = await duSidechain.memberData(address)
    const total = await duSidechain.getEarnings(address).catch(() => 0)
    const withdrawnEarnings = mdata[3].toString()
    const withdrawable = total ? total.sub(withdrawnEarnings) : 0
    return {
        status: ['unknown', 'active', 'inactive', 'blocked'][mdata[0]],
        earningsBeforeLastJoin: mdata[1].toString(),
        lmeAtJoin: mdata[2].toString(),
        totalEarnings: total.toString(),
        withdrawableEarnings: withdrawable.toString(),
    }
}

/**
 * Get the amount of tokens the member would get from a successful withdraw
 * @param dataUnion to query
 * @param memberAddress whose balance is returned
 * @return {Promise<BigNumber>}
 */
export async function getMemberBalance(memberAddress, options) {
    const address = parseAddress(this, memberAddress, options)
    const duSidechain = await getSidechainContract(this, options)
    return duSidechain.getWithdrawableEarnings(address)
}

export async function getTokenBalance(address, options) {
    const a = parseAddress(this, address, options)
    const tokenAddressMainnet = this.options.tokenAddress || options.tokenAddress
    if (!tokenAddressMainnet) { throw new Error('tokenAddress option not found') }
    const provider = getMainnetProvider(this, options)
    const token = new Contract(tokenAddressMainnet, [{
        name: 'balanceOf',
        inputs: [{ type: 'address' }],
        outputs: [{ type: 'uint256' }],
        constant: true,
        payable: false,
        stateMutability: 'view',
        type: 'function'
    }], provider)
    return token.balanceOf(a)
}

// TODO: this needs more thought: probably something like getEvents from sidechain? Heavy on RPC?
export async function getMembers(options) {
    const duSidechain = await getSidechainContract(this, options)
    throw new Error(`Not implemented for side-chain data union (at ${duSidechain.address})`)
    // event MemberJoined(address indexed);
    // event MemberParted(address indexed);
}

export async function getDataUnionStats(options) {
    const duSidechain = await getSidechainContract(this, options)
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

/**
 * Figure out if given mainnet address is old DataUnion (v 1.0) or current 2.0
 * NOTE: Current version of streamr-client-javascript can only handle current version!
 * @param {EthereumAddress} contractAddress
 * @returns {number} 1 for old, 2 for current, zero for "not a data union"
 */
export async function getDataUnionVersion(contractAddress) {
    try {
        const du = getMainnetContract(this)
        const addr = await du.amb()
        getAddress(addr) // throws if address is bad
        return 2
    } catch (e) {
        // continue
    }

    try {
        const provider = getMainnetProvider(this)
        const du = new Contract(contractAddress, [{
            name: 'operator',
            inputs: [],
            outputs: [{ type: 'address' }],
            stateMutability: 'view',
            type: 'function'
        }], provider)
        const addr = await du.operator()
        getAddress(addr) // throws if address is bad
        return 1
    } catch (e) {
        // continue
    }

    return 0
}

// //////////////////////////////////////////////////////////////////
//          member: WITHDRAW EARNINGS
// //////////////////////////////////////////////////////////////////

/**
 * Withdraw all your earnings
 * @param {EthereumAddress} dataUnion to withdraw my earnings from
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdraw(options = {}) {
    const {
        pollingIntervalMs = 1000,
        retryTimeoutMs = 60000,
    } = options
    const balanceBefore = await this.getTokenBalance(null, options)
    const tx = await this.getWithdrawTx(options)
    const tr = await tx.wait()
    const getBalance = this.getTokenBalance.bind(this)
    tr.isComplete = async () => until(async () => !(await getBalance(null, options)).eq(balanceBefore), retryTimeoutMs, pollingIntervalMs)
    return tr
}

/**
 * Get the tx promise for withdrawing all your earnings
 * @param {EthereumAddress} dataUnion to withdraw my earnings from
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawTx(options) {
    const wallet = getSidechainWallet(this, options)
    const duSidechain = await getSidechainContract(this, options)
    const withdrawable = await duSidechain.getWithdrawableEarnings(wallet.address)
    if (withdrawable.eq(0)) {
        throw new Error(`${wallet.address} has nothing to withdraw in (sidechain) data union ${duSidechain.address}`)
    }
    return duSidechain.withdrawAll(wallet.address, true) // sendToMainnet=true
}

/**
 * Withdraw earnings and "donate" them to the given address
 * @param {EthereumAddress} dataUnion to withdraw my earnings from
 * @param {EthereumAddress} recipientAddress the address to receive the tokens
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionReceipt>} get receipt once withdraw transaction is confirmed
 */
export async function withdrawTo(recipientAddress, options = {}) {
    const {
        pollingIntervalMs = 1000,
        retryTimeoutMs = 60000,
    } = options
    const balanceBefore = await this.getTokenBalance(null, options)
    const tx = await this.getWithdrawTxTo(recipientAddress, options)
    const tr = await tx.wait()
    const getBalance = this.getTokenBalance.bind(this)
    tr.isComplete = async () => until(async () => !(await getBalance(null, options)).eq(balanceBefore), retryTimeoutMs, pollingIntervalMs)
    return tr
}

/**
 * Withdraw earnings and "donate" them to the given address
 * @param {EthereumAddress} dataUnion to withdraw my earnings from
 * @param {EthereumAddress} recipientAddress the address to receive the tokens
 * @param {EthereumOptions} options
 * @returns {Promise<providers.TransactionResponse>} await on call .wait to actually send the tx
 */
export async function getWithdrawTxTo(recipientAddress, options) {
    const wallet = getSidechainWallet(this, options)
    const duSidechain = await getSidechainContract(this, options)
    const withdrawable = await duSidechain.getWithdrawableEarnings(wallet.address)
    if (withdrawable.eq(0)) {
        throw new Error(`${wallet.address} has nothing to withdraw in (sidechain) data union ${duSidechain.address}`)
    }
    return duSidechain.withdrawAllTo(recipientAddress, true) // sendToMainnet=true
}

/**
 * Member can sign off to "donate" all earnings to another address such that someone else
 *   can submit the transaction (and pay for the gas)
 * @param {EthereumAddress} recipientAddress the address authorized to receive the tokens
 * @returns {string} signature authorizing withdrawing all earnings to given recipientAddress
 */
export async function signWithdrawTo(recipientAddress, options) {
    return this.signWithdrawAmountTo(recipientAddress, '0', options)
}

/**
 * Member can sign off to "donate" specific amount of earnings to another address such that someone else
 *   can submit the transaction (and pay for the gas)
 * @param {BigNumber|number|string} amount that the signature is for (can't be used for less or for more)
 * @param {EthereumAddress} recipientAddress the address authorized to receive the tokens
 * @returns {string} signature authorizing withdrawing all earnings to given recipientAddress
 */
export async function signWithdrawAmountTo(recipientAddress, amount, options) {
    const wallet = getSidechainWallet(this, options)
    const duSidechain = await getSidechainContract(this, options)
    const memberData = await duSidechain.memberData(wallet.address)
    if (memberData[0] === '0') { throw new Error(`${wallet.address} is not a member in Data Union (sidechain address ${duSidechain.address})`) }
    const withdrawn = memberData[3]
    const message = recipientAddress + amount.toString(16, 64) + duSidechain.address.slice(2) + withdrawn.toString(16, 64)
    const signature = await wallet.signMessage(message)
    return signature
}
