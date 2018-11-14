import { PublishRequest } from 'streamr-client-protocol'

const Web3 = require('web3')

const web3 = new Web3()

const SIGNATURE_TYPE_ETH = 1

export default class Signer {
    constructor(options) {
        this.options = options || {}
        if (this.options.privateKey) {
            const account = web3.eth.accounts.privateKeyToAccount(this.options.privateKey)
            this.address = account.address
            this.sign = (d) => account.sign(d).signature
        } else if (this.options.provider) {
            const w3 = new Web3(this.options.provider)
            const accounts = w3.eth.getAccounts()
            const address = accounts[0]
            if (!address) {
                throw new Error('Cannot access account from provider')
            }
            this.address = address
            this.sign = async (d) => w3.eth.personal.sign(d, this.address)
        } else {
            throw new Error('Need either "privateKey" or "provider".')
        }
    }

    async signData(data, signatureType = SIGNATURE_TYPE_ETH) {
        if (signatureType === SIGNATURE_TYPE_ETH) {
            return this.sign(data)
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    async getSignedPublishRequest(publishRequest, signatureType = SIGNATURE_TYPE_ETH) {
        const ts = publishRequest.getTimestampAsNumber()
        if (!ts) {
            throw new Error('Timestamp is required as part of the data to sign.')
        }
        const payload = this.address.toLowerCase() + publishRequest.streamId + ts + publishRequest.getSerializedContent()
        const signature = await this.signData(payload, signatureType)
        return new PublishRequest(
            publishRequest.streamId,
            publishRequest.apiKey,
            publishRequest.sessionToken,
            publishRequest.content,
            publishRequest.timestamp,
            publishRequest.partitionKey,
            this.address,
            signatureType,
            signature,
        )
    }

    static verifySignature(data, signature, address, signatureType = SIGNATURE_TYPE_ETH) {
        if (signatureType === SIGNATURE_TYPE_ETH) {
            return web3.eth.accounts.recover(data, signature).toLowerCase() === address.toLowerCase()
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    // TODO: should be used by the StreamrClient before calling Subscription.handleMessage but only if client required signature verification
    // on that stream. Should also check that msg.publisherAddress is trusted (need to know set of authorized stream writers).
    static verifyStreamMessage(msg) {
        const data = msg.publisherAddress.toLowerCase() + msg.streamId + msg.timestamp + msg.getSerializedContent()
        if (!this.verifySignature(data, msg.signature, msg.publisherAddress, msg.signatureType)) {
            throw new Error(`Invalid signature: ${msg.signature}`)
        }
    }
}
