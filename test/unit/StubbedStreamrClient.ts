import { StreamrClient } from '../../src/index'
import { Stream } from '../../src/stream'

export default class StubbedStreamrClient extends StreamrClient {
    // @ts-expect-error
    // eslint-disable-next-line class-methods-use-this
    getUserInfo() {
        return Promise.resolve({
            username: 'username',
        })
    }

    // eslint-disable-next-line class-methods-use-this
    async getStream() {
        return new Stream(null as any, {
            id: 'streamId',
            partitions: 1,
        })
    }
}
// publisherId is the hash of 'username'
// @ts-expect-error
StubbedStreamrClient.hashedUsername = '0x16F78A7D6317F102BBD95FC9A4F3FF2E3249287690B8BDAD6B7810F82B34ACE3'.toLowerCase()
