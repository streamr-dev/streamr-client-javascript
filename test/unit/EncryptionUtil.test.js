import assert from 'assert'
import crypto from 'crypto'
import EncryptionUtil from '../../src/EncryptionUtil'

describe('EncryptionUtil', () => {
    it('rsa decryption after encryption equals the initial plaintext', () => {
        const encryptionUtil = new EncryptionUtil()
        const plaintext = 'some random text'
        const ciphertext = EncryptionUtil.encryptWithPublicKey(Buffer.from(plaintext, 'utf8'), encryptionUtil.getPublicKey())
        assert.deepStrictEqual(encryptionUtil.decryptWithPrivateKey(ciphertext).toString('utf8'), plaintext)
    })
    it('throws if invalid public key passed in the constructor', () => {
        const keys = crypto.generateKeyPairSync('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: {
                type: 'pkcs1',
                format: 'pem',
            },
            privateKeyEncoding: {
                type: 'pkcs1',
                format: 'pem',
            },
        })
        assert.throws(() => {
            // eslint-disable-next-line no-new
            new EncryptionUtil({
                privateKey: keys.privateKey,
                publicKey: 'wrong public key',
            })
        }, /Error/)
    })
    it('throws if invalid private key passed in the constructor', () => {
        const keys = crypto.generateKeyPairSync('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: {
                type: 'pkcs1',
                format: 'pem',
            },
            privateKeyEncoding: {
                type: 'pkcs1',
                format: 'pem',
            },
        })
        assert.throws(() => {
            // eslint-disable-next-line no-new
            new EncryptionUtil({
                privateKey: 'wrong private key',
                publicKey: keys.publicKey,
            })
        }, /Error/)
    })
    it('does not throw if valid key pair passed in the constructor', () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: {
                type: 'pkcs1',
                format: 'pem',
            },
            privateKeyEncoding: {
                type: 'pkcs1',
                format: 'pem',
            },
        })
        // eslint-disable-next-line no-new
        new EncryptionUtil({
            privateKey,
            publicKey,
        })
    })
})
