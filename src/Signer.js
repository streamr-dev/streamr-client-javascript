import { MessageLayer, Utils } from 'streamr-client-protocol'
import { computeAddress } from '@ethersproject/transactions'
import { Web3Provider } from '@ethersproject/providers/lib/web3-provider'

const { StreamMessage } = MessageLayer
const { SigningUtil } = Utils
const { SIGNATURE_TYPES } = StreamMessage

export default class Signer {
    constructor(options = {}) {
        // copy options to prevent possible later mutation
        this.options = {
            ...options,
        }

        // TODO: options should get a async getAddress from creator, toss these details from here (e.g. to StreamrClient)

        const { privateKey, provider } = this.options
        if (privateKey) {
            this.getAddress = () => computeAddress(privateKey)
            const key = (typeof privateKey === 'string' && privateKey.startsWith('0x'))
                ? privateKey.slice(2) // strip leading 0x
                : privateKey
            this.sign = async (d) => {
                return SigningUtil.sign(d, key)
            }
        } else if (provider) {
            const web3Provider = new Web3Provider(provider)
            const signer = web3Provider.getSigner()
            this.getAddress = async () => signer.getAddress()
            this.sign = async (d) => signer.signMessage(d)
        } else {
            throw new Error('Need either "privateKey" or "provider".')
        }
    }

    async signData(data, signatureType = SIGNATURE_TYPES.ETH) {
        if (signatureType === SIGNATURE_TYPES.ETH_LEGACY || signatureType === SIGNATURE_TYPES.ETH) {
            return this.sign(data)
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    async signStreamMessage(streamMessage, signatureType = SIGNATURE_TYPES.ETH) {
        if (!streamMessage.getTimestamp()) {
            throw new Error('Timestamp is required as part of the data to sign.')
        }
        /* eslint-disable no-param-reassign,require-atomic-updates */ // TODO: comment why atomic-updates is not an issue
        // set signature & publisher so getting of payload works correctly
        streamMessage.signatureType = signatureType
        streamMessage.messageId.publisherId = await this.getAddress()
        const payload = streamMessage.getPayloadToSign()
        streamMessage.signature = await this.signData(payload, signatureType)
        /* eslint-enable no-param-reassign */
    }

    static createSigner(options, publishWithSignature) {
        if (publishWithSignature === 'never') {
            return undefined
        }

        if (publishWithSignature === 'auto' && !options.privateKey && !options.provider) {
            return undefined
        }

        if (publishWithSignature === 'auto' || publishWithSignature === 'always') {
            return new Signer(options)
        }
        throw new Error(`Unknown parameter value: ${publishWithSignature}`)
    }
}
