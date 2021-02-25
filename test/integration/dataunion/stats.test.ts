import { providers } from 'ethers'
import debug from 'debug'

import StreamrClient from '../../../src/StreamrClient'
import config from '../config'
import { DataUnion } from '../../../src/dataunion/DataUnion'
import { createClient, createMockAddress, expectInvalidAddress } from '../../utils'

const log = debug('StreamrClient::DataUnion::integration-test-stats')

// @ts-expect-error
const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
// @ts-expect-error
const providerMainnet = new providers.JsonRpcProvider(config.clientOptions.mainnet)

describe('DataUnion stats', () => {

    let adminClient: StreamrClient
    let dataUnion: DataUnion
    let queryClient: StreamrClient
    const nonce = Date.now()
    const activeMemberAddressList = [
        `0x100000000000000000000000000${nonce}`,
        `0x200000000000000000000000000${nonce}`,
        `0x300000000000000000000000000${nonce}`,
    ]

    beforeAll(async () => {
        log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
        const network = await providerMainnet.getNetwork()
        log('Connected to "mainnet" network: ', JSON.stringify(network))
        const network2 = await providerSidechain.getNetwork()
        log('Connected to sidechain network: ', JSON.stringify(network2))
        adminClient = new StreamrClient(config.clientOptions as any)
        await adminClient.ensureConnected()
        dataUnion = await adminClient.deployDataUnion()
        const inactiveMember = createMockAddress()
        await dataUnion.addMembers(activeMemberAddressList.concat([inactiveMember]))
        await dataUnion.removeMembers([inactiveMember])
        queryClient = createClient(providerSidechain)
    }, 60000)

    afterAll(() => {
        adminClient.ensureDisconnected()
        queryClient.ensureDisconnected()
    })

    it('DataUnion stats', async () => {
        const stats = await queryClient.getDataUnion(dataUnion.getAddress()).getStats()
        expect(+stats.activeMemberCount).toEqual(3)
        expect(+stats.inactiveMemberCount).toEqual(1)
        expect(+stats.joinPartAgentCount).toEqual(2)
        expect(+stats.totalEarnings).toEqual(0)
        expect(+stats.totalWithdrawable).toEqual(0)
        expect(+stats.lifetimeMemberEarnings).toEqual(0)
    }, 150000)

    it('member stats', async () => {
        const memberStats = await Promise.all(activeMemberAddressList.map((m) => queryClient.getDataUnion(dataUnion.getAddress()).getMemberStats(m)))
        expect(memberStats).toMatchObject([{
            status: 'active',
            earningsBeforeLastJoin: '0',
            lmeAtJoin: '0',
            totalEarnings: '0',
            withdrawableEarnings: '0',
        }, {
            status: 'active',
            earningsBeforeLastJoin: '0',
            lmeAtJoin: '0',
            totalEarnings: '0',
            withdrawableEarnings: '0',
        }, {
            status: 'active',
            earningsBeforeLastJoin: '0',
            lmeAtJoin: '0',
            totalEarnings: '0',
            withdrawableEarnings: '0',
        }])
    }, 150000)

    it('member stats: invalid address', () => {
        return expectInvalidAddress(() => dataUnion.getMemberStats('invalid-address'))
    })
})
