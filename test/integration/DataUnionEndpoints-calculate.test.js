/* eslint-disable no-await-in-loop, no-use-before-define */
import { Contract, providers, Wallet } from 'ethers'
import debug from 'debug'

import StreamrClient from '../../src'
import * as DataUnionFactoryMainnet from '../../contracts/DataUnionFactoryMainnet.json'

import config from './config'

const log = debug('StreamrClient::DataUnionEndpoints::integration-test-calculate')
// const { log } = console

const providerSidechain = new providers.JsonRpcProvider(config.clientOptions.sidechain)
const providerMainnet = new providers.JsonRpcProvider(config.clientOptions.mainnet)
const adminWalletMainnet = new Wallet(config.clientOptions.auth.privateKey, providerMainnet)

it('DataUnionEndPoints: calculate DU address before deployment', async () => {
    log(`Connecting to Ethereum networks, config = ${JSON.stringify(config)}`)
    const network = await providerMainnet.getNetwork()
    log('Connected to "mainnet" network: ', JSON.stringify(network))
    const network2 = await providerSidechain.getNetwork()
    log('Connected to sidechain network: ', JSON.stringify(network2))

    // use a DU factory from Docker dev env, see https://github.com/streamr-dev/smart-contracts-init/
    const factoryMainnet = new Contract('0x01f26Ca429FbE59617C5Fcdcb7f2214dcD09fB75', DataUnionFactoryMainnet.abi, adminWalletMainnet)

    const adminClient = new StreamrClient({
        ...config.clientOptions,
        factoryMainnetAddress: factoryMainnet.address,
        autoConnect: false,
        autoDisconnect: false,
    })

    await adminClient.ensureConnected()

    const dataUnionName = '6be8ceda7a3c4fe7991eab501975b85ec2bb90452d0e4c93bc2' + new Date()
    const duMainnetAddress = await adminClient.calculateDataUnionMainnetAddress(dataUnionName, adminWalletMainnet.address)
    const duSidechainAddress = await adminClient.calculateDataUnionSidechainAddress(duMainnetAddress)

    const dataUnion = await adminClient.deployDataUnion({ dataUnionName })

    const version = await adminClient.getDataUnionVersion(dataUnion.address)

    await providerMainnet.removeAllListeners()
    await providerSidechain.removeAllListeners()

    if (adminClient) {
        await adminClient.ensureDisconnected()
    }

    expect(duMainnetAddress).toBe(dataUnion.address)
    expect(duSidechainAddress).toBe(dataUnion.sidechain.address)
    expect(version).toBe(2)
}, 60000)
