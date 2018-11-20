import assert from 'assert'
import { PublishRequest, StreamMessage } from 'streamr-client-protocol'
import Signer from '../../src/Signer'

describe('Signer', () => {
    describe('construction', () => {
        it('should sign when constructed with private key', () => {
            const signer = new Signer({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            })
            const signature = signer.signData('some-data')
            assert(signature)
        })
        it('should throw when constructed with nothing', () => {
            assert.throws(() => {
                new Signer({})
            }, /Error/)
        })
    })

    describe('signing', () => {
        let signer
        beforeEach(() => {
            signer = new Signer({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            })
        })
        it('should return correct signature', async () => {
            const payload = 'data-to-sign'
            const expectedSignature = '0x3d5c221ebed6bf75ecd0ca8751aa18401ac60561034e3b2889dfd7bbc0a2ff3c5f1c5239113f3fac5b648ab665d152ecece1daaafdd3d94309c2b822ec28369e1c'
            const signature = await signer.signData(payload)
            assert.deepEqual(signature, expectedSignature)
        })
        it('should sign PublishRequest with appropriate fields', async () => {
            const streamId = 'streamId'
            const data = {
                field: 'some-data',
            }
            const timestamp = Date.now()
            const request = new PublishRequest(streamId, undefined, undefined, data, timestamp)
            const payload = signer.address.toLowerCase() + streamId + request.getTimestampAsNumber() + request.getSerializedContent()
            assert(payload)
            const signature = await signer.signData(payload)
            const signedRequest = await signer.getSignedPublishRequest(request)
            assert.deepEqual(signer.address, signedRequest.publisherAddress)
            assert.deepEqual(1, signedRequest.signatureType)
            assert.deepEqual(signature, signedRequest.signature)
        })
        it('Should verify correct signature', async () => {
            const streamId = 'streamId'
            const data = {
                field: 'some-data',
            }
            const timestamp = Date.now()
            const signedRequest = await signer.getSignedPublishRequest(new PublishRequest(streamId, undefined, undefined, data, timestamp))
            const streamMessage = new StreamMessage(
                streamId,
                0,
                timestamp,
                0,
                0,
                0,
                StreamMessage.CONTENT_TYPES.JSON,
                data,
                1,
                signedRequest.publisherAddress,
                signedRequest.signature,
            )
            Signer.verifyStreamMessage(streamMessage)
        })

        it('Should throw if incorrect signature', async () => {
            const streamMessage = new StreamMessage(
                'streamId',
                0,
                Date.now(),
                0,
                0,
                0,
                StreamMessage.CONTENT_TYPES.JSON,
                {
                    field: 'some-data',
                },
                1,
                '0xF915eD664e43C50eB7b9Ca7CfEB992703eDe55c4',
                '0x3d5c221ebed6bf75ecd0ca8751aa18401ac60561034e3b2889dfd7bbc0a2ff3c5f1c5239113f3fac5b648ab665d152ecece1daaafdd3d94309c2b822ec28369e1c',
            )
            assert.throws(() => Signer.verifyStreamMessage(streamMessage), Error)
        })
    })
})
