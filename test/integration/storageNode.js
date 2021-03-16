import fetch from 'node-fetch'
import { waitForCondition } from 'streamr-test-utils'

// test broker "broker-node-storage-1" (development-1.env.json / using docker-1.env.json in https://github.com/streamr-dev/broker/tree/master/configs)
const BROKER_URL = 'http://10.200.10.1:8891'
const STORAGE_NODE_ADDRESS = '0xde1112f631486CfC759A50196853011528bC5FA0'

const isStreamStoredInStorageNode = async (streamId) => {
    const url = `${BROKER_URL}/api/v1/streams/${encodeURIComponent(streamId)}/storage/partitions/0`
    const response = await fetch(url)
    if (response.status === 200) {
        return true
    } else if (response.status === 404) {
        return false
    } else {
        throw new Error('Unable to fetch stream storage status')
    }
}

export const addToStorageNode = async (stream) => {
    await stream.addToStorageNode(STORAGE_NODE_ADDRESS)
    await waitForCondition(() => isStreamStoredInStorageNode(stream.id))
}