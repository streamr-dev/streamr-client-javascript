/* TODO: CPS-35 these tests should pass before further modifying StreamrClient.js
 * see also CORE-1845
import assert from 'assert'

import { Contract, providers, utils, Wallet } from 'ethers'

import StreamrClient from '../../src'
import * as Token from '../../contracts/TestToken.json'

import config from './config'

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}
*/
describe('CommunityEndPoints', () => {
    /*
    let community

    let testProvider
    let adminClient
    let adminWallet
    let adminToken

    beforeAll(async () => {
        testProvider = new providers.JsonRpcProvider(config.ethereumServerUrl)
        const network = await testProvider.getNetwork().catch((e) => {
            throw new Error(`Connecting to Ethereum failed, config = ${JSON.stringify(config)}`, e)
        })
        console.log('Connected to Ethereum network: ', JSON.stringify(network))

        adminWallet = new Wallet(config.privateKey, testProvider)
        adminClient = new StreamrClient({
            auth: {
                privateKey: adminWallet.privateKey
            },
            autoConnect: false,
            autoDisconnect: false,
            ...config.clientOptions,
        })

        adminToken = new Contract(adminClient.options.tokenAddress, Token.abi, adminWallet)
        console.log('beforeAll done')
    })
    beforeEach(async () => {
        console.log('starting beforeEach')
        await adminClient.ensureConnected()
        console.log('deploying new community...')
        community = await adminClient.deployCommunity({
            provider: testProvider
        })
        console.log(`Going to deploy to ${community.address}`)
        await community.deployed()
        console.log(`Deployment done for ${community.address}`)
        await community.isReady()
        console.log(`Community ${community.address} is ready to roll`)
        await adminClient.createSecret(community.address, 'secret', 'CommunityEndpoints test secret')
    }, 60000)

    afterAll(async () => adminClient.disconnect())

    describe('Admin', () => {
        const memberAddressList = [
            '0x0000000000000000000000000000000000000001',
            '0x0000000000000000000000000000000000000002',
            '0x000000000000000000000000000000000000bEEF',
        ]

        it('can add and remove members', async () => {
            console.log('starting test')
            await adminClient.communityIsReady(community.address, console.log)

            await adminClient.addMembers(community.address, memberAddressList, testProvider)
            await adminClient.hasJoined(community.address, memberAddressList[0])
            const res = await adminClient.getCommunityStats(community.address)
            assert.deepStrictEqual(res.memberCount, {
                total: 3, active: 3, inactive: 0
            })

            await adminClient.kick(community.address, memberAddressList.slice(1), testProvider)
            await sleep(1000) // TODO: instead of sleeping, find a way to check server has registered the parting
            const res2 = await adminClient.getCommunityStats(community.address)
            assert.deepStrictEqual(res2.memberCount, {
                total: 3, active: 1, inactive: 2
            })
        })

        // separate test for adding and removing secrets? Adding secret is tested in member joins community test though.
    })

    describe('Members', () => {
        it('can join the community, and get their balances and stats, and check proof, and withdraw', async () => {
            // send eth so the member can afford to send tx
            const memberWallet = new Wallet('0x0000000000000000000000000000000000000000000000000000000000000001', testProvider)
            await adminWallet.sendTransaction({
                to: memberWallet.address,
                value: utils.parseEther('1'),
            })

            const memberClient = new StreamrClient({
                auth: {
                    privateKey: memberWallet.privateKey
                },
                autoConnect: false,
                autoDisconnect: false,
                ...config.clientOptions,
            })
            await memberClient.ensureConnected()

            const res = await memberClient.joinCommunity(community.address, 'secret')
            await memberClient.hasJoined(community.address)
            assert.strictEqual(res.state, 'ACCEPTED')
            assert.strictEqual(res.memberAddress, memberWallet.address)
            assert.strictEqual(res.communityAddress, community.address)

            // too much bother to check this in a separate test...
            const res2 = await memberClient.getMemberStats(community.address)
            assert.deepStrictEqual(res2, {
                address: memberWallet.address,
                earnings: '0',
                recordedEarnings: '0',
                withdrawableEarnings: '0',
                frozenEarnings: '0'
            })

            // add revenue, just to see some action
            const opWallet = new Wallet('0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0', testProvider)
            const opToken = new Contract(adminClient.options.tokenAddress, Token.abi, opWallet)
            const tx = await opToken.mint(community.address, utils.parseEther('1'))
            const tr = await tx.wait(2)
            assert.strictEqual(tr.events[0].event, 'Transfer')
            assert.strictEqual(tr.events[0].args.from, '0x0000000000000000000000000000000000000000')
            assert.strictEqual(tr.events[0].args.to, community.address)
            assert.strictEqual(tr.events[0].args.value.toString(), '1000000000000000000')
            await sleep(1000)

            // note: getMemberStats without explicit address => get stats of the authenticated StreamrClient
            const res3 = await memberClient.getMemberStats(community.address)
            assert.deepStrictEqual(res3, {
                address: memberWallet.address,
                earnings: '1000000000000000000',
                recordedEarnings: '1000000000000000000',
                withdrawableEarnings: '1000000000000000000',
                frozenEarnings: '0',
                withdrawableBlockNumber: res3.withdrawableBlockNumber,
                proof: ['0xb7238c98e8baedc7aae869ecedd9900b1c2a767bbb482df81ef7539dbe71abe4']
            })

            const isValid = await memberClient.validateProof(community.address, {
                provider: testProvider
            })
            assert(isValid)

            const walletBefore = await opToken.balanceOf(memberWallet.address)

            const tr2 = await memberClient.withdraw(community.address, {
                provider: testProvider
            })
            assert.strictEqual(tr2.logs[0].address, adminClient.options.tokenAddress)

            const walletAfter = await opToken.balanceOf(memberWallet.address)
            const diff = walletAfter.sub(walletBefore)
            assert.strictEqual(diff.toString(), res3.withdrawableEarnings)
        }, 60000)

        // TODO: test withdrawTo, withdrawFor, getBalance
    })

    describe('Anyone', () => {
        const client = new StreamrClient({
            auth: {
                apiKey: 'tester1-api-key'
            },
            autoConnect: false,
            autoDisconnect: false,
            ...config.clientOptions,
        })
        const memberAddressList = [
            '0x0000000000000000000000000000000000000001',
            '0x0000000000000000000000000000000000000002',
            '0x000000000000000000000000000000000000bEEF',
        ]

        it('can get community stats, member list, and member stats', async () => {
            await adminClient.addMembers(community.address, memberAddressList, testProvider)
            await adminClient.hasJoined(community.address, memberAddressList[0])

            // mint tokens to community to generate revenue
            const opWallet = new Wallet('0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0', testProvider)
            const opToken = new Contract(adminClient.options.tokenAddress, Token.abi, opWallet)
            const tx = await opToken.mint(community.address, utils.parseEther('1'))
            const tr = await tx.wait(2)
            assert.strictEqual(tr.events[0].event, 'Transfer')
            assert.strictEqual(tr.events[0].args.from, '0x0000000000000000000000000000000000000000')
            assert.strictEqual(tr.events[0].args.to, community.address)
            await sleep(1000)

            const cstats = await client.getCommunityStats(community.address)
            const mlist = await client.getMembers(community.address)
            const mstats = await client.getMemberStats(community.address, memberAddressList[0])

            assert.deepStrictEqual(cstats.memberCount, {
                total: 3, active: 3, inactive: 0
            })
            assert.deepStrictEqual(cstats.totalEarnings, '1000000000000000000')
            assert.deepStrictEqual(cstats.latestWithdrawableBlock.memberCount, 4)
            assert.deepStrictEqual(cstats.latestWithdrawableBlock.totalEarnings, '1000000000000000000')
            assert.deepStrictEqual(mlist, [{
                address: '0x0000000000000000000000000000000000000001',
                earnings: '333333333333333333'
            },
            {
                address: '0x0000000000000000000000000000000000000002',
                earnings: '333333333333333333'
            },
            {
                address: '0x000000000000000000000000000000000000bEEF',
                earnings: '333333333333333333'
            }])
            assert.deepStrictEqual(mstats, {
                address: '0x0000000000000000000000000000000000000001',
                earnings: '333333333333333333',
                recordedEarnings: '333333333333333333',
                withdrawableEarnings: '333333333333333333',
                frozenEarnings: '0',
                withdrawableBlockNumber: cstats.latestWithdrawableBlock.blockNumber,
                proof: [
                    '0xb7238c98e8baedc7aae869ecedd9900b1c2a767bbb482df81ef7539dbe71abe4',
                    '0xe482f62a15e13774223a74cc4db3abb30d4ec3af8bf89f2f56116b9af1dbbe05',
                ]
            })
        }, 30000)
    })
    */
})
