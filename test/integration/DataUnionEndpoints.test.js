/* eslint-disable no-await-in-loop, no-use-before-define */
import { Contract, ContractFactory, providers, utils, Wallet } from 'ethers'
import debug from 'debug'
import { wait } from 'streamr-test-utils'

import until from '../../src/utils'
import StreamrClient from '../../src'
import * as Token from '../../contracts/TestToken.json'
import * as DataUnionMainnet from '../../contracts/DataUnionMainnet.json'

import config from './config'

// const log = debug('StreamrClient::DataUnionEndpoints::integration-test')
const { log } = console

describe('DataUnionEndPoints', () => {
    // fresh dataUnion for each test case
    let dataUnion
    let dataUnionName
    let adminClient

    const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
    const providerMainnet = new providers.JsonRpcProvider(config.clientOptions.mainnet)
    const adminWalletMainnet = new Wallet(config.clientOptions.auth.privateKey, providerMainnet)
    const adminWalletSidechain = new Wallet(config.clientOptions.auth.privateKey, providerSidechain)

    beforeAll(async () => {
        log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
        const network = await providerMainnet.getNetwork()
        log('Connected to "mainnet" network: ', JSON.stringify(network))
        const network2 = await providerSidechain.getNetwork()
        log('Connected to sidechain network: ', JSON.stringify(network2))

        // for faster manual testing, use a factory from previous runs
        // const factoryMainnet = new Contract('0x1e144C6fdcc4FcD2d66bf2c1e1F913FF5C7d5393', factoryMainnetABI, adminWalletMainnet)
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
    }, 600000)

    beforeEach(async () => {
        await adminClient.ensureConnected()
        dataUnionName = 'test' + +new Date()
        dataUnion = await adminClient.deployDataUnion({
            dataUnionName,
        })
        log(`Waiting for ${dataUnion.address} to be registered in sidechain`)
        await dataUnion.isReady()
        await adminClient.createSecret(dataUnion.address, 'secret', 'DataUnionEndpoints test secret')
        log(`DataUnion ${dataUnion.address} is ready to roll`)
        // dataUnion = await adminClient.getDataUnionContract({ dataUnion: '0x6E89c7A2d86Cb692422b7C9721d691f81c883335' })
    }, 300000)

    afterAll(async () => {
        await providerMainnet.removeAllListeners()
        await providerSidechain.removeAllListeners()

        if (!adminClient) { return }
        await adminClient.ensureDisconnected()
    })

    describe('Admin', () => {
        const memberAddressList = [
            '0x0000000000000000000000000000000000000001',
            '0x0000000000000000000000000000000000000002',
            '0x000000000000000000000000000000000000bEEF',
        ]

        it('can add members', async () => {
            await adminClient.addMembers(memberAddressList, { dataUnion })
            await adminClient.hasJoined(memberAddressList[0], { dataUnion })
            const res = await adminClient.getDataUnionStats({ dataUnion })
            expect(+res.memberCount).toEqual(3)
        }, 100000)

        it('can remove members', async () => {
            await adminClient.addMembers(memberAddressList, { dataUnion })
            await adminClient.kick(memberAddressList.slice(1), { dataUnion })
            const res = await adminClient.getDataUnionStats({ dataUnion })
            expect(+res.memberCount).toEqual(1)
        }, 100000)

        // separate test for adding and removing secrets? Adding secret is tested in member joins dataUnion test though.

        it('can withdraw admin fees', async () => {
            log('TODO')
        })
    })

    describe('Member', () => {
        let memberClient

        const nonce = +new Date()
        const memberWallet = new Wallet(`0x100000000000000000000000000000000000000000000000001${+nonce}`, providerSidechain)
        const member2Wallet = new Wallet(`0x100000000000000000000000000000000000000000000000002${+nonce}`, providerSidechain)

        beforeEach(async () => {
            memberClient = new StreamrClient({
                ...config.clientOptions,
                auth: {
                    privateKey: memberWallet.privateKey
                },
                dataUnion: dataUnion.address,
                autoConnect: false,
                autoDisconnect: false,
            })
            await memberClient.ensureConnected()
        })

        afterEach(async () => {
            if (!memberClient) { return }
            await memberClient.ensureDisconnected()
        })

        // TODO: implement DU2 joining to EE
        it.skip('can join the data union', async () => {
            const res = await memberClient.joinDataUnion({ secret: 'secret' })
            await memberClient.hasJoined()
            expect(res).toMatchObject({
                state: 'ACCEPTED',
                memberAddress: memberWallet.address,
                contractAddress: dataUnion.address,
            })
        })

        it('can get its sidechain balances and stats', async () => {
            // TODO: change after DU2 joining is implemented in EE
            // await memberClient.joinDataUnion({ secret: 'secret' })
            await adminClient.addMembers([memberWallet.address], { dataUnion })
            const res = await memberClient.getMemberStats()
            expect(res).toEqual({
                status: 'active', // this means join worked
                earningsBeforeLastJoin: '0',
                lmeAtJoin: '0',
                totalEarnings: '0',
                withdrawableEarnings: '0',
            })
        }, 300000)

        it('can receive earnings from mainnet', async () => {
            // TODO: change after DU2 joining is implemented in EE
            // await memberClient.joinDataUnion({ secret: 'secret' })
            await adminClient.addMembers([memberWallet.address], { dataUnion })

            // transfer ERC20 to mainet contract
            const amount = '1000'
            const duSidechainBalanceBefore = await dataUnion.sidechain.totalEarnings()

            const tokenAddress = await dataUnion.token()
            console.log("token", tokenAddress)
            const adminTokenMainnet = new Contract(tokenAddress, Token.abi, adminWalletMainnet)

            console.log("admin eth balance", +await providerMainnet.getBalance(adminWalletMainnet.address))
            console.log("admin token balance", +await adminTokenMainnet.balanceOf(adminWalletMainnet.address))
            const tx1 = await adminTokenMainnet.transfer(dataUnion.address, amount)
            await tx1.wait()

            const tmAddress = await dataUnion.token_mediator()
            console.log("token_mediator", tmAddress)
            const tm = new Contract(tmAddress, [{
                name: 'erc677token',
                inputs: [],
                outputs: [{ type: 'address' }],
                stateMutability: 'view',
                type: 'function'
            }], adminWalletMainnet)
            console.log("token_mediator.erc677token()", await tm.erc677token())
            log(`Transferred ${amount} to ${dataUnion.address}, next sending to bridge`)
            const tx2 = await dataUnion.sendTokensToBridge({ gasLimit: 5000000 })
            await tx2.wait()

            log(`Sent to bridge, waiting for the tokens to appear at ${dataUnion.address} in sidechain`)
            await until(async () => !duSidechainBalanceBefore.eq(await dataUnion.sidechain.totalEarnings()), 360000)
            log(`Confirmed DU sidechain balance ${duSidechainBalanceBefore} -> ${await dataUnion.sidechain.totalEarnings()}`)

            // note: getMemberStats without explicit address => get stats of the authenticated StreamrClient
            const res = await memberClient.getMemberStats()
            expect(res).toMatchObject({
                active: true,
                address: memberWallet.address,
                earnings: '1000000000000000000',
                recordedEarnings: '1000000000000000000',
                withdrawableEarnings: '1000000000000000000',
                frozenEarnings: '0',
                withdrawableBlockNumber: res.withdrawableBlockNumber,
            })
        }, 600000)

        it('can withdraw earnings to mainnet', async () => {
            // TODO: change after DU2 joining is implemented in EE
            // await memberClient.joinDataUnion({ secret: 'secret' })
            await adminClient.addMembers([memberWallet.address], { dataUnion })

            // transfer ERC20 to mainet contract
            const amount = '1000'
            const duSidechainBalanceBefore = await dataUnion.sidechain.totalEarnings()

            const tokenAddress = await dataUnion.token()
            const adminTokenMainnet = new Contract(tokenAddress, Token.abi, adminWalletMainnet)

            const tx1 = await adminTokenMainnet.transfer(dataUnion.address, amount)
            await tx1.wait()

            log(`Transferred ${amount} to ${dataUnion.address}, next sending to bridge`)
            const tx2 = await dataUnion.sendTokensToBridge()
            await tx2.wait()

            log(`Sent to bridge, waiting for the tokens to appear at ${dataUnion.address} in sidechain`)
            await until(async () => !duSidechainBalanceBefore.eq(await dataUnion.sidechain.totalEarnings()), 360000)
            log(`Confirmed DU sidechain balance ${duSidechainBalanceBefore} -> ${await dataUnion.sidechain.totalEarnings()}`)

            const balanceBefore = await adminTokenMainnet.balanceOf(memberWallet.address)
            const tr = await memberClient.withdraw()
            const balanceAfter = await adminTokenMainnet.balanceOf(memberWallet.address)
            const diff = balanceAfter.sub(balanceBefore)

            expect(tr.logs[0].address).toBe(adminTokenMainnet.address)
            expect(diff.toString()).toBe(amount)
        }, 600000)

        it('can "donate" earnings to another mainnet address', async () => {
            // TODO: change after DU2 joining is implemented in EE
            // await memberClient.joinDataUnion({ secret: 'secret' })
            await adminClient.addMembers([memberWallet.address], { dataUnion })

            // transfer ERC20 to mainet contract
            const tokenWei = utils.parseEther('1')
            const duSidechainBalanceBefore = await dataUnion.sidechain.totalEarnings()

            const tokenAddress = await dataUnion.token()
            const adminTokenMainnet = new Contract(tokenAddress, Token.abi, adminWalletMainnet)

            const duMainnetAddress = adminClient.getDataUnionMainnetAddress(dataUnionName)
            const tx1 = await adminTokenMainnet.transfer(duMainnetAddress, tokenWei)
            await tx1.wait()

            log(`Transferred ${tokenWei} to ${duMainnetAddress}, next sending to bridge`)
            const duMainnet = new Contract(duMainnetAddress, DataUnionMainnet.abi, adminWalletMainnet)
            const tx2 = await duMainnet.sendTokensToBridge()
            await tx2.wait()

            log(`Sent to bridge, waiting for the tokens to appear at ${dataUnion.address} in sidechain`)
            await until(async () => !duSidechainBalanceBefore.eq(await dataUnion.sidechain.totalEarnings()), 360000)
            log(`Confirmed DU sidechain balance ${duSidechainBalanceBefore} -> ${await dataUnion.sidechain.totalEarnings()}`)

            const balanceBefore = await adminTokenMainnet.balanceOf(member2Wallet.address)
            const tr = await memberClient.withdrawTo(member2Wallet.address)
            const balanceAfter = await adminTokenMainnet.balanceOf(member2Wallet.address)
            const diff = balanceAfter.sub(balanceBefore)

            expect(tr.logs[0].address).toBe(adminTokenMainnet.address)
            expect(diff.toString()).toBe(tokenWei)
        }, 600000)

        // TODO: test getWithdrawTx, getWithdrawTxTo
    })

    describe('Anyone', () => {
        const memberAddressList = [
            '0x0000000000000000000000000000000000000001',
            '0x0000000000000000000000000000000000000002',
            '0x000000000000000000000000000000000000bEEF',
        ]

        let client
        beforeEach(async () => {
            client = new StreamrClient({
                auth: {
                    apiKey: 'tester1-api-key'
                },
                dataUnion: dataUnion.address,
                autoConnect: false,
                autoDisconnect: false,
                ...config.clientOptions,
            })
        })
        afterEach(async () => {
            if (!client) { return }
            await client.ensureDisconnected()
        })

        it('can get dataUnion stats', async () => {
            await adminClient.addMembers(memberAddressList, { dataUnion })
            await adminClient.hasJoined(memberAddressList[0], { dataUnion })

            // mint tokens to dataUnion to generate revenue

            const stats = client.getDataUnionStats()
            expect(stats.memberCount).toEqual(3)
            expect(stats.joinPartAgentCount).toEqual(2)
            expect(stats.totalEarnings).toEqual(3)
            expect(stats.totalWithdrawable).toEqual(3)
            expect(stats.lifetimeMemberEarnings).toEqual(3)
        })

        it('can get member stats', async () => {
            const duStats = await client.getDataUnionStats()
            const memberStats = await Promise.all(memberAddressList.map((m) => client.getMemberStats(m)))

            console.log(duStats, JSON.stringify(duStats))
            console.log(memberStats, JSON.stringify(memberStats))

            expect(duStats.memberCount).toEqual({
                total: 3, active: 3, inactive: 0
            })
            expect(duStats.totalEarnings).toBe('1000000000000000000')
            expect(duStats.latestWithdrawableBlock.memberCount).toBe(4)
            expect(duStats.latestWithdrawableBlock.totalEarnings).toBe('1000000000000000000')

            expect(memberStats).toMatchObject({
                active: true,
                address: '0x0000000000000000000000000000000000000001',
                earnings: '333333333333333333',
                recordedEarnings: '333333333333333333',
                withdrawableEarnings: '333333333333333333',
                frozenEarnings: '0',
                withdrawableBlockNumber: duStats.latestWithdrawableBlock.blockNumber,
            })
        }, 300000)
    })
})

// for the below helpers, check out https://github.com/streamr-dev/data-union-solidity/tree/master/util

// TODO: these should also go into the .env file?
const tokenMediatorSidechainAddress = '0x6cCdd5d866ea766f6DF5965aA98DeCCD629ff222'
const tokenMediatorMainnetAddress = '0x3AE0ad89b0e094fD09428589849C161f0F7f4E6A'
let templateSidechain

import * as DataUnionFactoryMainnet from '../../contracts/DataUnionFactoryMainnet.json'
import * as DataUnionFactorySidechain from '../../contracts/DataUnionFactorySidechain.json'
import * as DataUnionSidechain from '../../contracts/DataUnionSidechain.json'

const factoryMainnetABI = DataUnionFactoryMainnet.abi
const factoryMainnetBytecode = DataUnionFactoryMainnet.bytecode
const factorySidechainABI = DataUnionFactorySidechain.abi
const factorySidechainBytecode = DataUnionFactorySidechain.bytecode

const dataUnionMainnetBytecode = DataUnionMainnet.bytecode
const dataUnionSidechainBytecode = DataUnionSidechain.bytecode

/**
 * Deploy template DataUnion contract as well as factory to sidechain
 * @param wallet {Wallet} sidechain wallet that is used in deployment
 * @returns {Promise<Contract>} DataUnionFactorySidechain contract
 */
async function deployDataUnionFactorySidechain(wallet) {
    log(`Deploying template DU sidechain contract from ${wallet.address}`)
    const templateDeployer = new ContractFactory([], dataUnionSidechainBytecode, wallet)
    const templateTx = await templateDeployer.deploy({
        gasLimit: 6000000
    })
    templateSidechain = await templateTx.deployed()
    log(`Side-chain template DU: ${templateSidechain.address}`)

    // constructor(address _token_mediator, address _data_union_sidechain_template)
    log(`Deploying sidechain DU factory contract from ${wallet.address}`)
    const factoryDeployer = new ContractFactory(factorySidechainABI, factorySidechainBytecode, wallet)
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
    log(`Deploying template DU mainnet contract from ${wallet.address}`)
    const templateDeployer = new ContractFactory([], dataUnionMainnetBytecode, wallet)
    const templateTx = await templateDeployer.deploy({
        gasLimit: 6000000
    })
    const templateDU = await templateTx.deployed()
    log(`Mainnet template DU: ${templateDU.address}. Deploying DU mainnet factory contract from ${wallet.address}`)
    const factoryDeployer = new ContractFactory(factoryMainnetABI, factoryMainnetBytecode, wallet)
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
