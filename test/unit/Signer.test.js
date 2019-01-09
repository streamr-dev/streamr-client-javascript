import assert from 'assert'
import { MessageLayer } from 'streamr-client-protocol'
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
                // eslint-disable-next-line no-new
                new Signer({})
            }, /Error/)
        })
        it('Should return undefined when "never" option is set', () => {
            assert.strictEqual(Signer.createSigner({}, 'never'), undefined)
        })
        it('Should return undefined when "auto" option is set with no private key or provider', () => {
            assert.strictEqual(Signer.createSigner({}, 'auto'), undefined)
        })
        it('Should return a Signer when "auto" option is set with private key', () => {
            const signer = Signer.createSigner({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            }, 'auto')
            assert(signer instanceof Signer)
        })
        it('Should return a Signer when "always" option is set with private key', () => {
            const signer = Signer.createSigner({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            }, 'always')
            assert(signer instanceof Signer)
        })
        it('Should throw when "always" option is set with no private key or provider', () => {
            assert.throws(() => Signer.createSigner({}, 'always'), /Error/)
        })
        it('Should throw when unknown option is set', () => {
            assert.throws(() => Signer.createSigner({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            }, 'unknown'), /Error/)
        })
    })

    describe('signing', () => {
        let signer
        const streamId = 'streamId'
        const data = {
            field: 'some-data',
        }
        const timestamp = 1529549961116
        const correctSignature = '0xf1d6001f0bc603fe9e89b67b0ff3e1a7e8916ea5c8a5228a13ab45f29c0de2' +
            '6c06e711ba0d95129e3c03dbde1c7963dab7978f4e4e6974c70850470f13180ce81b'
        const wrongSignature = '0x3d5c221ebed6bf75ecd0ca8751aa18401ac60561034e3b2889dfd7bbc0a2ff3c5f1' +
            'c5239113f3fac5b648ab665d152ecece1daaafdd3d94309c2b822ec28369e1c'
        beforeEach(() => {
            signer = new Signer({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            })
        })
        it('should return correct signature', async () => {
            const payload = 'data-to-sign'
            const signature = await signer.signData(payload)
            assert.deepEqual(signature, '0x3d5c221ebed6bf75ecd0ca8751aa18401ac60561034e3b2889dfd7bbc0a2ff3' +
                'c5f1c5239113f3fac5b648ab665d152ecece1daaafdd3d94309c2b822ec28369e1c')
        })
        it('should sign StreamMessageV30 correctly', async () => {
            const streamMessage = new MessageLayer.StreamMessageV30(
                [streamId, 0, timestamp, 0, null], [timestamp - 10, 0], 0, MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
                data, MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH, null,
            )
            const payload = streamMessage.getStreamId() + streamMessage.getTimestamp() +
                signer.address.toLowerCase() + streamMessage.getSerializedContent()
            const expectedSignature = await signer.signData(payload)
            await signer.signStreamMessage(streamMessage)
            assert.strictEqual(streamMessage.signature, expectedSignature)
            assert.strictEqual(streamMessage.getPublisherId(), signer.address)
            assert.strictEqual(streamMessage.signatureType, MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH)
        })
        it('Should verify correct signature (V29)', () => {
            const signedStreamMessage = new MessageLayer.StreamMessageV29(
                streamId, 0, timestamp, 0, 0, 0, MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
                data, MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH, signer.address, correctSignature,
            )
            assert.strictEqual(Signer.verifyStreamMessage(signedStreamMessage, new Set([signer.address.toLowerCase()])), true)
        })
        it('Should verify correct signature (V30)', () => {
            const signedStreamMessage = new MessageLayer.StreamMessageV30(
                [streamId, 0, timestamp, 0, signer.address], [timestamp - 10, 0], 0, MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
                data, MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH, correctSignature,
            )
            assert.strictEqual(Signer.verifyStreamMessage(signedStreamMessage, new Set([signer.address.toLowerCase()])), true)
        })
        it('Should return false if incorrect signature (V29)', () => {
            const wrongStreamMessage = new MessageLayer.StreamMessageV29(
                streamId, 0, timestamp, 0, 0, 0, MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
                data, MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH, signer.address, wrongSignature,
            )
            assert.strictEqual(Signer.verifyStreamMessage(wrongStreamMessage, new Set([signer.address.toLowerCase()])), false)
        })
        it('Should return false if incorrect signature (V30)', () => {
            const wrongStreamMessage = new MessageLayer.StreamMessageV30(
                [streamId, 0, timestamp, 0, signer.address], [timestamp - 10, 0], 0, MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
                data, MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH, wrongSignature,
            )
            assert.strictEqual(Signer.verifyStreamMessage(wrongStreamMessage, new Set([signer.address.toLowerCase()])), false)
        })
        it('Should return false if correct signature but not from a trusted publisher', () => {
            const signedStreamMessage = new MessageLayer.StreamMessageV29(
                streamId, 0, timestamp, 0, 0, 0, MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
                data, MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH, signer.address, wrongSignature,
            )
            assert.strictEqual(Signer.verifyStreamMessage(signedStreamMessage, new Set()), false)
        })
    })
})
