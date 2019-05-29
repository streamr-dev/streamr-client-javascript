import crypto from 'crypto'
import { ethers } from 'ethers'

export default class EncryptionUtil {
    /*
    Both 'data' and 'groupKey' must be Buffers. Returns a hex string without the '0x' prefix.
     */
    static encrypt(data, groupKey) {
        const iv = crypto.randomBytes(16) // always need a fresh IV when using CTR mode
        const cipher = crypto.createCipheriv('aes-256-ctr', groupKey, iv)
        return ethers.utils.hexlify(iv).slice(2) + cipher.update(data, null, 'hex') + cipher.final('hex')
    }

    /*
    'ciphertext' must be a hex string (without '0x' prefix), 'groupKey' must be a Buffer. Returns a Buffer.
     */
    static decrypt(ciphertext, groupKey) {
        const iv = ethers.utils.arrayify(`0x${ciphertext.slice(0, 32)}`)
        const decipher = crypto.createDecipheriv('aes-256-ctr', groupKey, iv)
        return Buffer.concat([decipher.update(ciphertext.slice(32), 'hex', null), decipher.final(null)])
    }
}
