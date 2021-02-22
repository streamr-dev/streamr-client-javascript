import { providers } from 'ethers'
import debug from 'debug'

import StreamrClient from '../../../src/StreamrClient'
import config from '../config'
import { DataUnion } from '../../../src/dataunion/DataUnion'

const log = debug('StreamrClient::DataUnionEndpoints::integration-test-member')

// @ts-expect-error
const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
// @ts-expect-error
const providerMainnet = new providers.JsonRpcProvider(config.clientOptions.mainnet)

const createMockAddress = () => '0x000000000000000000000000000' + Date.now()

describe('DataUnion member', () => {

    let dataUnion: DataUnion

    beforeAll(async () => {
        log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
        const network = await providerMainnet.getNetwork()
        log('Connected to "mainnet" network: ', JSON.stringify(network))
        const network2 = await providerSidechain.getNetwork()
        log('Connected to sidechain network: ', JSON.stringify(network2))
        const adminClient = new StreamrClient(config.clientOptions as any)
        await adminClient.ensureConnected()
        dataUnion = await adminClient.deployDataUnion()
    }, 60000)

    it('random user is not a member', async () => {
        const userAddress = createMockAddress()
        const isMember = await dataUnion.isMember(userAddress)
        expect(isMember).toBe(false)
    }, 60000)

    it('add', async () => {
        const userAddress = createMockAddress()
        await dataUnion.addMembers([userAddress])
        const isMember = await dataUnion.isMember(userAddress)
        expect(isMember).toBe(true)
    }, 60000)

    it('remove', async () => {
        const userAddress = createMockAddress()
        await dataUnion.addMembers([userAddress])
        await dataUnion.removeMembers([userAddress])
        const isMember = await dataUnion.isMember(userAddress)
        expect(isMember).toBe(false)
    }, 60000)

})
