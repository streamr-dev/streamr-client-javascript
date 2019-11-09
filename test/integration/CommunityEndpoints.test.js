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
        await adminClient.createSecret(community.address, 'secret', 'CommunityEndpoints test secret')
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
        it('can join the community, and get their stats, and check proof, and withdraw', async () => {
            // send eth so the member can afford to send tx
            const memberWallet = new Wallet("0x0000000000000000000000000000000000000000000000000000000000000001", testProvider)
            await adminWallet.sendTransaction({
                to: memberWallet.address,
                value: utils.parseEther('1'),
            })

            const memberClient = createClient({
                auth: {
                    privateKey: memberWallet.privateKey
                }
            })
            await memberClient.ensureConnected()

            const res = await memberClient.joinCommunity(community.address, 'secret')
            await memberClient.hasJoined(community.address)
            assert.strictEqual(res.state, 'ACCEPTED')
            assert.strictEqual(res.memberAddress, memberWallet.address)
            assert.strictEqual(res.communityAddress, community.address)

            // too much bother to check this in a separate test...
            const res2 = await memberClient.getMemberStats(community.address)
            console.log(res2)
            assert.deepStrictEqual(res2, {
                address: memberWallet.address,
                earnings: '0',
                recordedEarnings: '0',
                withdrawableEarnings: '0',
                frozenEarnings: '0' }
            )

            // add revenue, just to see some action
            const opWallet = new Wallet("0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0", testProvider)
            const opToken = new Contract(adminClient.options.tokenAddress, Token.abi, opWallet)
            const tx = await opToken.mint(community.address, utils.parseEther('1'))
            const tr = await tx.wait(2)
            assert.strictEqual(tr.events[0].event, "Transfer")
            assert.strictEqual(tr.events[0].args.from, "0x0000000000000000000000000000000000000000")
            assert.strictEqual(tr.events[0].args.to, community.address)

            const res3 = await memberClient.getMemberStats(community.address)
            assert.deepStrictEqual(res3, {
                address: memberWallet.address,
                earnings: '1000000000000000000',
                recordedEarnings: '1000000000000000000',
                withdrawableEarnings: '1000000000000000000',
                frozenEarnings: '0',
                withdrawableBlockNumber: res3.withdrawableBlockNumber,
                proof: [ '0xb7238c98e8baedc7aae869ecedd9900b1c2a767bbb482df81ef7539dbe71abe4' ] }
            )

            const opts = { provider: testProvider }

            const isValid = await memberClient.validateProof(community.address, opts)
            assert(isValid)

            const tr2 = await memberClient.withdraw(community.address, opts)
            assert.strictEqual(tr2.logs[0].address, adminClient.options.tokenAddress)

            // TODO: assert withdrawing produced tokens to member
        }, 60000)

        // TODO: test withdrawTo, withdrawFor
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
})
