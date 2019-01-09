import { MessageLayer } from 'streamr-client-protocol'

const Web3 = require('web3')
const debug = require('debug')('StreamrClient::Signer')

const web3 = new Web3()

export default class Signer {
    constructor(options = {}) {
        this.options = options
        if (this.options.privateKey) {
            const account = web3.eth.accounts.privateKeyToAccount(this.options.privateKey)
            this.address = account.address.toLowerCase()
            this.sign = (d) => account.sign(d).signature
        } else if (this.options.provider) {
            this.sign = async (d) => {
                const w3 = new Web3(this.options.provider)
                const accounts = await w3.eth.getAccounts()
                const address = accounts[0]
                if (!address) {
                    throw new Error('Cannot access account from provider')
                }
                this.address = address
                return w3.eth.personal.sign(d, this.address)
            }
        } else {
            throw new Error('Need either "privateKey" or "provider".')
        }
    }

    async signData(data, signatureType = MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH) {
        if (signatureType === MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH) {
            return this.sign(data)
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    async signStreamMessage(streamMessage, signatureType = MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH) {
        if (streamMessage.version !== 30) {
            throw new Error('Needs to be a StreamMessageV30')
        }
        const ts = streamMessage.getTimestamp()
        if (!ts) {
            throw new Error('Timestamp is required as part of the data to sign.')
        }
        const payload = Signer.getPayloadToSign(streamMessage.getStreamId(), ts, this.address, streamMessage.getSerializedContent(), signatureType)
        /* eslint-disable no-param-reassign */
        streamMessage.signature = await this.signData(payload, signatureType)
        streamMessage.signatureType = signatureType
        streamMessage.messageId.publisherId = this.address
        /* eslint-enable no-param-reassign */
    }

    static getPayloadToSign(streamId, timestamp, publisherId, content, signatureType = MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH) {
        if (signatureType === MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH) {
            return `${streamId}${timestamp}${publisherId.toLowerCase()}${content}`
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    static verifySignature(data, signature, address, signatureType = MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH) {
        if (signatureType === MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH) {
            return web3.eth.accounts.recover(data, signature).toLowerCase() === address.toLowerCase()
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    static verifyStreamMessage(msg, trustedPublishers = new Set()) {
        const payload = this.getPayloadToSign(msg.getStreamId(), msg.getTimestamp(), msg.getPublisherId(), msg.getSerializedContent())
        return this.verifySignature(payload, msg.signature, msg.getPublisherId(), msg.signatureType)
            && trustedPublishers.has(msg.getPublisherId().toLowerCase())
    }

    static createSigner(options, publishWithSignature) {
        if (publishWithSignature === 'never') {
            return undefined
        } else if (publishWithSignature === 'auto' && !options.privateKey && !options.provider) {
            return undefined
        } else if (publishWithSignature === 'auto' || publishWithSignature === 'always') {
            return new Signer(options)
        }
        throw new Error(`Unknown parameter value: ${publishWithSignature}`)
    }
}
