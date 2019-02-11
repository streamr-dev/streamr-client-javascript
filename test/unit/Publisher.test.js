import assert from 'assert'
import sinon from 'sinon'
import Web3 from 'web3'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import Publisher from '../../src/Publisher'
import FailedToPublishError from '../../src/errors/FailedToPublishError'

const { StreamMessage } = MessageLayer
const { PublishRequest } = ControlLayer

describe('Publisher', () => {
    const hashedUsername = '16F78A7D6317F102BBD95FC9A4F3FF2E3249287690B8BDAD6B7810F82B34ACE3'.toLowerCase()
    describe('getPublisherId', () => {
        it('use address', async () => {
            const account = new Web3().eth.accounts.create()
            const client = {
                options: {
                    auth: {
                        privateKey: account.privateKey,
                    },
                },
                getUserInfo: sinon.stub().resolves({
                    username: 'username',
                }),
            }
            const publisher = new Publisher(client)
            const publisherId = await publisher.getPublisherId()
            assert.strictEqual(publisherId, account.address)
        })
        it('use hash of username', async () => {
            const client = {
                options: {
                    auth: {
                        apiKey: 'apiKey',
                    },
                },
                getUserInfo: sinon.stub().resolves({
                    username: 'username',
                }),
            }
            const publisher = new Publisher(client)
            const publisherId = await publisher.getPublisherId()
            assert.strictEqual(publisherId, hashedUsername)
        })
        it('use hash of username', async () => {
            const client = {
                options: {
                    auth: {
                        username: 'username',
                    },
                },
                getUserInfo: sinon.stub().resolves({
                    username: 'username',
                }),
            }
            const publisher = new Publisher(client)
            const publisherId = await publisher.getPublisherId()
            assert.strictEqual(publisherId, hashedUsername)
        })
        it('use hash of username', async () => {
            const client = {
                options: {
                    auth: {
                        sessionToken: 'session-token',
                    },
                },
                getUserInfo: sinon.stub().resolves({
                    username: 'username',
                }),
            }
            const publisher = new Publisher(client)
            const publisherId = await publisher.getPublisherId()
            assert.strictEqual(publisherId, hashedUsername)
        })
    })

    describe('partitioner', () => {
        it('should throw if partition count is not defined', () => {
            assert.throws(() => {
                Publisher.computeStreamPartition(undefined, 'foo')
            })
        })

        it('should always return partition 0 for all keys if partition count is 1', () => {
            for (let i = 0; i < 100; i++) {
                assert.equal(Publisher.computeStreamPartition(1, `foo${i}`), 0)
            }
        })

        it('should use murmur2 partitioner and produce same results as org.apache.kafka.common.utils.Utils.murmur2(byte[])', () => {
            const keys = []
            for (let i = 0; i < 100; i++) {
                keys.push(`key-${i}`)
            }
            // Results must be the same as those produced by StreamService#partition()
            const correctResults = [5, 6, 3, 9, 3, 0, 2, 8, 2, 6, 9, 5, 5, 8, 5, 0, 0, 7, 2, 8, 5, 6,
                8, 1, 7, 9, 2, 1, 8, 5, 6, 4, 3, 3, 1, 7, 1, 5, 2, 8, 3, 3, 8, 6, 8, 7, 4, 8, 2, 3, 5,
                2, 8, 8, 8, 9, 8, 2, 7, 7, 0, 8, 8, 5, 9, 9, 9, 7, 2, 7, 0, 4, 4, 6, 4, 8, 5, 5, 0, 8,
                2, 5, 1, 8, 6, 8, 8, 1, 2, 0, 7, 3, 2, 2, 5, 7, 9, 6, 4, 7]

            assert.equal(correctResults.length, keys.length, 'key array and result array are different size!')

            for (let i = 0; i < keys.length; i++) {
                const partition = Publisher.computeStreamPartition(10, keys[i])
                assert.equal(
                    correctResults[i], partition,
                    `Partition is incorrect for key: ${keys[i]}. Was: ${partition}, should be: ${correctResults[i]}`,
                )
            }
        })
    })

    describe('publish', () => {
        const pubMsg = {
            foo: 'bar',
        }

        const stream = {
            partitions: 1,
        }
        let client
        let publisher
        beforeEach(() => {
            client = {
                options: {
                    auth: {
                        username: 'username',
                    },
                },
                session: {
                    getSessionToken: () => Promise.resolve('session-token'),
                },
                signer: {
                    signStreamMessage: () => Promise.resolve(),
                },
                connection: {
                    send: sinon.stub(),
                },
                isConnected: () => true,
                getStream: () => stream,
            }
            publisher = new Publisher(client)
        })

        function getPublishRequest(streamId, timestamp, sequenceNumber, prevMsgRef) {
            const streamMessage = StreamMessage.create(
                [streamId, 0, timestamp, sequenceNumber, hashedUsername], prevMsgRef,
                StreamMessage.CONTENT_TYPES.JSON, pubMsg, StreamMessage.SIGNATURE_TYPES.NONE, null,
            )
            return PublishRequest.create(streamMessage, 'session-token')
        }

        it('should publish messages with increasing sequence numbers', async (done) => {
            const ts = Date.now()
            const promises = []
            for (let i = 0; i < 10; i++) {
                promises.push(publisher.publish('streamId', pubMsg, ts))
            }
            Promise.all(promises).then(() => {
                let prevMsgRef = null
                for (let i = 0; i < 10; i++) {
                    assert.deepStrictEqual(client.connection.send.getCall(i).args, [getPublishRequest('streamId', ts, i, prevMsgRef)])
                    prevMsgRef = [ts, i]
                }
                done()
            })
        })

        it('should publish messages with sequence number 0', async (done) => {
            const ts = Date.now()
            const promises = []
            for (let i = 0; i < 10; i++) {
                promises.push(publisher.publish('streamId', pubMsg, ts + i))
            }
            Promise.all(promises).then(() => {
                let prevMsgRef = null
                for (let i = 0; i < 10; i++) {
                    assert.deepStrictEqual(client.connection.send.getCall(i).args, [getPublishRequest('streamId', ts + i, 0, prevMsgRef)])
                    prevMsgRef = [ts + i, 0]
                }
                done()
            })
        })

        it('should publish messages with sequence number 0 (different streams)', async (done) => {
            const ts = Date.now()
            const promises = []
            for (let i = 0; i < 10; i++) {
                promises.push(publisher.publish(`streamId${i}`, pubMsg, ts))
            }
            Promise.all(promises).then(() => {
                for (let i = 0; i < 10; i++) {
                    assert.deepStrictEqual(client.connection.send.getCall(i).args, [getPublishRequest(`streamId${i}`, ts, 0, null)])
                }
                done()
            })
        })

        it('queues messages and sends them once connected', async (done) => {
            client.isConnected = () => false
            client.options.autoConnect = true
            client.connect = async () => {
                client.isConnected = () => true
                await publisher.sendPendingPublishRequests()
            }
            const ts = Date.now()
            const promises = []
            for (let i = 0; i < 10; i++) {
                promises.push(publisher.publish('streamId', pubMsg, ts))
            }
            Promise.all(promises).then(async () => {
                let prevMsgRef = null
                for (let i = 0; i < 10; i++) {
                    assert.deepStrictEqual(client.connection.send.getCall(i).args, [getPublishRequest('streamId', ts, i, prevMsgRef)])
                    prevMsgRef = [ts, i]
                }
                done()
            })
        })

        it('queues messages and sends them once connected', (done) => {
            client.isConnected = () => false
            client.options.autoConnect = false
            publisher.publish('stream1', pubMsg).catch((err) => {
                assert(err instanceof FailedToPublishError)
                done()
            })
        })
    })
})
