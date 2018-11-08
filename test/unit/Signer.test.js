import assert from 'assert'
import { PublishRequest } from 'streamr-client-protocol'
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

    describe('publish requests signing', () => {
        it('should sign PublishRequest with appropriate fields', async () => {
            const signer = new Signer({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            })
            const streamId = 'streamId'
            const data = {
                field: 'some-data',
            }
            const timestamp = Date.now()
            const request = new PublishRequest(streamId, undefined, undefined, data, timestamp)
            const payload = signer.address + streamId + request.getTimestampAsNumber() + request.getSerializedContent()
            assert(payload)
            const signature = await signer.signData(payload)
            const signedRequest = await signer.getSignedPublishRequest(request)
            assert.deepEqual(signature, signedRequest.signature)
        })
    })
})
