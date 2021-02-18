import { providers, Wallet } from 'ethers'
import debug from 'debug'

import StreamrClient from '../../../src/StreamrClient'
import config from '../config'

const log = debug('StreamrClient::DataUnionEndpoints::integration-test-calculate')
// const { log } = console

// @ts-expect-error
const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
// @ts-expect-error
const providerMainnet = new providers.JsonRpcProvider(config.clientOptions.mainnet)
const adminWalletMainnet = new Wallet(config.clientOptions.auth.privateKey, providerMainnet)

it('DataUnionEndPoints: calculate DU address before deployment', async () => {
    log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
    const network = await providerMainnet.getNetwork()
    log('Connected to "mainnet" network: ', JSON.stringify(network))
    const network2 = await providerSidechain.getNetwork()
    log('Connected to sidechain network: ', JSON.stringify(network2))

    const adminClient = new StreamrClient(config.clientOptions as any)
    await adminClient.ensureConnected()

    const dataUnionName = '6be8ceda7a3c4fe7991eab501975b85ec2bb90452d0e4c93bc2' + Date.now()
    const duMainnetAddress = await adminClient.calculateDataUnionMainnetAddress(dataUnionName, adminWalletMainnet.address)
    const duSidechainAddress = await adminClient.calculateDataUnionSidechainAddress(duMainnetAddress)

    const dataUnion = await adminClient.deployDataUnion({ dataUnionName })

    const version = await adminClient.getDataUnionVersion(dataUnion.getContractAddress())

    await providerMainnet.removeAllListeners()
    await providerSidechain.removeAllListeners()
    await adminClient.ensureDisconnected()

    expect(duMainnetAddress).toBe(dataUnion.getContractAddress())
    const contract = await dataUnion.getContract()
    expect(duSidechainAddress).toBe(contract.sidechain.address)
    expect(version).toBe(2)
}, 60000)
