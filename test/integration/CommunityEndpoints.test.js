import assert from 'assert'

import {
    Wallet,
    Contract,
    providers,
    utils,
} from 'ethers'

import StreamrClient from '../../src'
// import * as Community from '../../contracts/CommunityProduct.json'
import * as Token from '../../contracts/TestToken.json'

import config from './config'

import mutex from 'async-mutex'

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

const createClient = (opts = {}) => new StreamrClient({
    autoConnect: false,
    autoDisconnect: false,
    ...config.clientOptions,
    ...opts,
})

describe('CommunityEndPoints', () => {
    let community

    let testProvider
    let adminWallet
    let adminClient
    let adminToken

    beforeAll(() => {
        testProvider = new providers.JsonRpcProvider(config.ethereumServerUrl)
        adminWallet = new Wallet(config.privateKey, testProvider)
        adminClient = createClient({
            auth: {
                privateKey: adminWallet.privateKey
            }
        })

        adminToken = new Contract(adminClient.options.tokenAddress, Token.abi, adminWallet)
        console.log('beforeAll done')
    })
    beforeEach(async () => {
        console.log('starting beforeEach')
        await adminClient.ensureConnected()
        console.log('deploying new community...')
        community = await adminClient.deployCommunity(adminWallet)
        console.log(`Going to deploy to ${community.address}`)
        await community.deployed()
        console.log(`Deployment done for ${community.address}`)
        await community.isReady()
        console.log(`Community ${community.address} is ready to roll`)
    }, 60000)

    afterAll(async () => adminClient.disconnect())

    describe('Admin', () => {
        it('can add and remove members', async () => {
            console.log('starting test')
            const memberAddressList = [
                '0x0000000000000000000000000000000000000001',
                '0x0000000000000000000000000000000000000002',
                '0x000000000000000000000000000000000000bEEF',
            ]

            await adminClient.communityIsReady(community.address, console.log)
            await adminClient.addMembers(community.address, memberAddressList, testProvider)
            await adminClient.memberHasJoined(community.address, memberAddressList[0])
            const res = await adminClient.getCommunityStats(community.address)
            assert.deepStrictEqual(res.memberCount, { total: 3, active: 3, inactive: 0 })

            await adminClient.kick(community.address, memberAddressList.slice(1), testProvider)
            await sleep(1000) // TODO: instead of sleeping, find a way to check server has registered the parting
            const res2 = await adminClient.getCommunityStats(community.address)
            assert.deepStrictEqual(res2.memberCount, { total: 3, active: 1, inactive: 2 })
        })
    })

    describe('Members', () => {
        const memberWallet = Wallet.createRandom()
        const memberClient = createClient({
            auth: {
                privateKey: memberWallet.privateKey
            }
        })

        const memberClientWithApiKey = createClient({
            auth: {
                apiKey: 'tester1-api-key'
            }
        })

        beforeAll(async () => {
            await memberClient.ensureConnected()
            await memberClientWithApiKey.ensureConnected()
            // so the member can afford to send tx
            await adminWallet.sendTransaction({
                to: memberWallet.address,
                value: utils.parseEther('1').toString(),
            })
        })

        it('can join the community when auth: privateKey', async () => {
            await adminClient.createSecret(community.address, 'secret', 'CommunityEndpoints test secret')
            const res = await memberClient.joinCommunity(community.address, 'secret')
            assert.strictEqual(res.state, 'ACCEPTED')
            console.log(res)
        })

        it('can join the community when auth: apiKey', async () => {
            await adminClient.createSecret(community.address, 'secret', 'CommunityEndpoints test secret')
            const res = await memberClientWithApiKey.joinCommunity(community.address, 'secret', memberWallet.address)
            assert.strictEqual(res.state, 'ACCEPTED')
            console.log(res)
        })

        it('can not join without giving address when auth: apiKey', async () => {
            await adminClient.createSecret(community.address, 'secret', 'CommunityEndpoints test secret')
            assert.throws(memberClientWithApiKey.joinCommunity(community.address, 'secret'), "StreamrClient wasn't authenticated with privateKey, and myAddress argument not supplied")
        })

        it('can get their own stats', async () => {
            assert.deepStrictEqual(await memberClient.getMemberStats(community.address), {
                adsf: 2
            })
        })
    })

    describe('Anyone', () => {
        const client = createClient({
            auth: {
                apiKey: 'tester1-api-key'
            }
        })
        const memberAddressList = [
            '0x0000000000000000000000000000000000000001',
            '0x0000000000000000000000000000000000000002',
            '0x000000000000000000000000000000000000bEEF',
        ]

        beforeEach(async () => mutex.runExclusive(async () => {
            await adminClient.addMembers(community.address, memberAddressList, testProvider)
            await adminToken.transfer(community.address, utils.formatEther(1))              // without mutex, transfer will have a nonce problem
        }))

        it('can get community stats', async () => {
            assert.deepStrictEqual(await client.getCommunityStats(community.address), {
                adsf: 2
            })
        })

        it('can get member list', async () => {
            assert.deepStrictEqual(await client.getMembers(community.address), [{
                adsf: 2
            }])
        })

        it('can get member stats', async () => {
            assert.deepStrictEqual(await client.getMemberStats(community.address), {
                adsf: 2
            })
        })
    })

    describe('', () => {

    })
})
