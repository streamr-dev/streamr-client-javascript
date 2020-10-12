/* eslint-disable no-await-in-loop, no-use-before-define */
import { Contract, ContractFactory, providers, Wallet, utils } from 'ethers'
import { formatEther, parseEther, getAddress } from 'ethers/lib/utils'
import { Mutex } from 'async-mutex'
import debug from 'debug'

import { until } from '../../src/utils'
import StreamrClient from '../../src'
import * as Token from '../../contracts/TestToken.json'
import * as DataUnionMainnet from '../../contracts/DataUnionMainnet.json'
import * as DataUnionSidechain from '../../contracts/DataUnionSidechain.json'
import * as DataUnionFactoryMainnet from '../../contracts/DataUnionFactoryMainnet.json'
import * as DataUnionFactorySidechain from '../../contracts/DataUnionFactorySidechain.json'

import config from './config'

// const log = debug('StreamrClient::DataUnionEndpoints::integration-test')
const { log } = console

class LoggingProvider extends providers.JsonRpcProvider {
    perform(method, parameters) {
        log('>>>', method, parameters)
        return super.perform(method, parameters).then((result) => {
            log('<<<', method, parameters, result)
            return result
        })
    }
}

// fresh dataUnion for each test case
let dataUnion
let adminClient

// const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
// const providerMainnet = new providers.JsonRpcProvider(config.clientOptions.mainnet)
const providerSidechain = new LoggingProvider(config.clientOptions.sidechain)
const providerMainnet = new LoggingProvider(config.clientOptions.mainnet)
const adminWalletMainnet = new Wallet(config.clientOptions.auth.privateKey, providerMainnet)
const adminWalletSidechain = new Wallet(config.clientOptions.auth.privateKey, providerSidechain)

const tokenAdminWallet = new Wallet(config.tokenAdminPrivateKey, providerMainnet)
const tokenMainnet = new Contract(config.clientOptions.tokenAddress, Token.abi, tokenAdminWallet)

it('DataUnionEndPoints: calculate DU addresses without deployment', async () => {
    log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
    const network = await providerMainnet.getNetwork()
    log('Connected to "mainnet" network: ', JSON.stringify(network))
    const network2 = await providerSidechain.getNetwork()
    log('Connected to sidechain network: ', JSON.stringify(network2))

    // for faster manual testing, use a factory from previous runs
    // const factoryMainnet = new Contract('0xEaCA72D344C39d72bd0c434B54F4b2383d12E298', DataUnionFactoryMainnet.abi, adminWalletMainnet)
    const factorySidechain = await deployDataUnionFactorySidechain(adminWalletSidechain)
    const templateSidechain = getTemplateSidechain()
    const factoryMainnet = await deployDataUnionFactoryMainnet(adminWalletMainnet, templateSidechain.address, factorySidechain.address)
    log(`Deployed factory contracts sidechain ${factorySidechain.address}, mainnet ${factoryMainnet.address}`)

    adminClient = new StreamrClient({
        ...config.clientOptions,
        factoryMainnetAddress: factoryMainnet.address,
        autoConnect: false,
        autoDisconnect: false,
    })

    await adminClient.ensureConnected()

    const dataUnionName = '6be8ceda7a3c4fe7991eab501975b85ec2bb90452d0e4c93bc252937476eae75'
    const duMainnetAddress = await adminClient.calculateDataUnionMainnetAddress(dataUnionName, adminWalletMainnet.address)
    const duSidechainAddress = await adminClient.calculateDataUnionSidechainAddress(duMainnetAddress)

    await providerMainnet.removeAllListeners()
    await providerSidechain.removeAllListeners()

    if (adminClient) {
        await adminClient.ensureDisconnected()
    }

    expect(duMainnetAddress).toBeTruthy()
    expect(duSidechainAddress).toBeTruthy()
}, 900000)

// for the below helpers, check out https://github.com/streamr-dev/data-union-solidity/tree/master/util

// TODO: these should also go into the .env file?
const tokenMediatorSidechainAddress = '0xedD2aa644a6843F2e5133Fe3d6BD3F4080d97D9F'
const tokenMediatorMainnetAddress = '0xedD2aa644a6843F2e5133Fe3d6BD3F4080d97D9F'
let templateSidechain

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

/**
 * Deploy template DataUnion contract as well as factory to sidechain
 * @param wallet {Wallet} sidechain wallet that is used in deployment
 * @returns {Promise<Contract>} DataUnionFactorySidechain contract
 */
async function deployDataUnionFactorySidechain(wallet) {
    await throwIfNotContract(wallet.provider, tokenMediatorSidechainAddress, 'tokenMediatorSidechainAddress')
    log(`Deploying template DU sidechain contract from ${wallet.address}`)
    const templateDeployer = new ContractFactory(DataUnionSidechain.abi, DataUnionSidechain.bytecode, wallet)
    const templateTx = await templateDeployer.deploy({
        gasLimit: 6000000
    })
    templateSidechain = await templateTx.deployed()
    log(`Side-chain template DU: ${templateSidechain.address}`)

    // constructor(address _token_mediator, address _data_union_sidechain_template)
    log(`Deploying sidechain DU factory contract from ${wallet.address}`)
    const factoryDeployer = new ContractFactory(DataUnionFactorySidechain.abi, DataUnionFactorySidechain.bytecode, wallet)
    const factoryTx = await factoryDeployer.deploy(
        tokenMediatorSidechainAddress,
        templateSidechain.address,
        {
            gasLimit: 6000000
        }
    )
    return factoryTx.deployed()
}

function getTemplateSidechain() {
    if (!templateSidechain) {
        throw new Error('deployDataUnionFactorySidechain must be called (and awaited) first')
    }
    return templateSidechain
}

async function deployDataUnionFactoryMainnet(wallet, sidechainTemplateAddress, sidechainFactoryAddress) {
    await throwIfNotContract(wallet.provider, tokenMediatorMainnetAddress, 'tokenMediatorMainnetAddress')
    log(`Deploying template DU mainnet contract from ${wallet.address}`)
    const templateDeployer = new ContractFactory(DataUnionMainnet.abi, DataUnionMainnet.bytecode, wallet)
    const templateTx = await templateDeployer.deploy({
        gasLimit: 6000000
    })
    const templateDU = await templateTx.deployed()
    log(`Mainnet template DU: ${templateDU.address}. Deploying DU mainnet factory contract from ${wallet.address}`)
    const factoryDeployer = new ContractFactory(DataUnionFactoryMainnet.abi, DataUnionFactoryMainnet.bytecode, wallet)
    const factoryTx = await factoryDeployer.deploy(
        tokenMediatorMainnetAddress,
        templateDU.address,
        sidechainTemplateAddress,
        sidechainFactoryAddress,
        2000000,
        {
            gasLimit: 6000000
        }
    )
    return factoryTx.deployed()
}
