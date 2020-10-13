/* eslint-disable no-await-in-loop, no-use-before-define */
import { Contract, providers, Wallet } from 'ethers'
import { formatEther, parseEther } from 'ethers/lib/utils'
import debug from 'debug'

import { until } from '../../src/utils'
import StreamrClient from '../../src'
import * as Token from '../../contracts/TestToken.json'
import * as DataUnionFactoryMainnet from '../../contracts/DataUnionFactoryMainnet.json'
import * as DataUnionSidechain from '../../contracts/DataUnionSidechain.json'

import config from './config'

const log = debug('StreamrClient::DataUnionEndpoints::integration-test-withdraw')
// const { log } = console

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

it('DataUnionEndPoints test withdraw', async () => {
    log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
    const network = await providerMainnet.getNetwork()
    log('Connected to "mainnet" network: ', JSON.stringify(network))
    const network2 = await providerSidechain.getNetwork()
    log('Connected to sidechain network: ', JSON.stringify(network2))

    log(`Minting 100 tokens to ${adminWalletMainnet.address}`)
    const tx1 = await tokenMainnet.mint(adminWalletMainnet.address, parseEther('100'))
    await tx1.wait()

    // use a DU factory from Docker dev env, see https://github.com/streamr-dev/smart-contracts-init/
    const factoryMainnet = new Contract('0x01f26Ca429FbE59617C5Fcdcb7f2214dcD09fB75', DataUnionFactoryMainnet.abi, adminWalletMainnet)

    adminClient = new StreamrClient({
        ...config.clientOptions,
        factoryMainnetAddress: factoryMainnet.address,
        autoConnect: false,
        autoDisconnect: false,
    })
    await adminClient.ensureConnected()

    dataUnion = await adminClient.deployDataUnion()
    log(`Waiting for ${dataUnion.sidechain.address} to be registered in sidechain`)
    await dataUnion.isReady()
    await adminClient.createSecret(dataUnion.address, 'secret', 'DataUnionEndpoints test secret')
    log(`DataUnion ${dataUnion.address} is ready to roll`)
    // dataUnion = await adminClient.getDataUnionContract({dataUnion: "0xd778CfA9BB1d5F36E42526B2BAFD07B74b4066c0"})

    const memberWallet = new Wallet(`0x100000000000000000000000000000000000000012300000001${+new Date()}`, providerSidechain)
    const memberClient = new StreamrClient({
        ...config.clientOptions,
        auth: {
            privateKey: memberWallet.privateKey
        },
        dataUnion: dataUnion.address,
        autoConnect: false,
        autoDisconnect: false,
    })
    await memberClient.ensureConnected()

    // TODO: change after DU2 joining is implemented in EE
    // await memberClient.joinDataUnion({ secret: 'secret' })
    await adminClient.addMembers([memberWallet.address], { dataUnion })

    const tokenAddress = await dataUnion.token()
    log(`Token address: ${tokenAddress}`)
    const adminTokenMainnet = new Contract(tokenAddress, Token.abi, adminWalletMainnet)

    const amount = parseEther('1')
    const duSidechainEarningsBefore = await dataUnion.sidechain.totalEarnings()

    const duBalance1 = await adminTokenMainnet.balanceOf(dataUnion.address)
    log(`Token balance of ${dataUnion.address}: ${formatEther(duBalance1)} (${duBalance1.toString()})`)
    const balance1 = await adminTokenMainnet.balanceOf(adminWalletMainnet.address)
    log(`Token balance of ${adminWalletMainnet.address}: ${formatEther(balance1)} (${balance1.toString()})`)

    log(`Transferring ${amount} token-wei ${adminWalletMainnet.address}->${dataUnion.address}`)
    const txTokenToDU = await adminTokenMainnet.transfer(dataUnion.address, amount)
    await txTokenToDU.wait()

    const duBalance2 = await adminTokenMainnet.balanceOf(dataUnion.address)
    log(`Token balance of ${dataUnion.address}: ${formatEther(duBalance2)} (${duBalance2.toString()})`)
    const balance2 = await adminTokenMainnet.balanceOf(adminWalletMainnet.address)
    log(`Token balance of ${adminWalletMainnet.address}: ${formatEther(balance2)} (${balance2.toString()})`)

    log(`DU member count: ${await dataUnion.sidechain.activeMemberCount()}`)

    log(`Transferred ${formatEther(amount)} tokens, next sending to bridge`)
    const tx2 = await dataUnion.sendTokensToBridge()
    await tx2.wait()

    log(`Sent to bridge, waiting for the tokens to appear at ${dataUnion.sidechain.address} in sidechain`)
    const tokenSidechain = new Contract(config.clientOptions.tokenAddressSidechain, Token.abi, adminWalletSidechain)
    await until(async () => !(await tokenSidechain.balanceOf(dataUnion.sidechain.address)).eq('0'), 300000, 3000)
    log(`Confirmed tokens arrived, DU balance: ${duSidechainEarningsBefore} -> ${await dataUnion.sidechain.totalEarnings()}`)

    const sidechainContract = new Contract(dataUnion.sidechain.address, DataUnionSidechain.abi, adminWalletSidechain)
    const tx3 = await sidechainContract.addRevenue()
    const tr3 = await tx3.wait()
    log(`addRevenue returned ${JSON.stringify(tr3)}`)
    log(`DU balance: ${await dataUnion.sidechain.totalEarnings()}`)

    const duBalance3 = await adminTokenMainnet.balanceOf(dataUnion.address)
    log(`Token balance of ${dataUnion.address}: ${formatEther(duBalance3)} (${duBalance3.toString()})`)
    const balance3 = await adminTokenMainnet.balanceOf(adminWalletMainnet.address)
    log(`Token balance of ${adminWalletMainnet.address}: ${formatEther(balance3)} (${balance3.toString()})`)

    // note: getMemberStats without explicit address => get stats of the authenticated StreamrClient
    const stats = await memberClient.getMemberStats()

    const balanceBefore = await adminTokenMainnet.balanceOf(memberWallet.address)
    const withdrawTr = await memberClient.withdraw()
    log(`Withdraw transaction sent: ${JSON.stringify(withdrawTr)}. Waiting for tokens to appear in mainnet`)
    await withdrawTr.isComplete()
    const balanceAfter = await adminTokenMainnet.balanceOf(memberWallet.address)
    const balanceIncrease = balanceAfter.sub(balanceBefore)

    await providerMainnet.removeAllListeners()
    await providerSidechain.removeAllListeners()
    await memberClient.ensureDisconnected()
    await adminClient.ensureDisconnected()

    expect(stats).toMatchObject({
        status: 'active',
        earningsBeforeLastJoin: '0',
        lmeAtJoin: '0',
        totalEarnings: '1000000000000000000',
        withdrawableEarnings: '1000000000000000000',
    })
    expect(withdrawTr.logs[0].address).toBe(adminTokenMainnet.address)
    expect(balanceIncrease.toString()).toBe(amount)
}, 900000)
