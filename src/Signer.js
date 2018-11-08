import { PublishRequest } from 'streamr-client-protocol'

const Web3 = require('web3')

const web3 = new Web3()

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

    async signData(data) {
        return this.sign(data)
    }

    async getSignedPublishRequest(publishRequest) {
        const payload = this.address + publishRequest.streamId + publishRequest.getTimestampAsNumber() + publishRequest.getSerializedContent()
        const signature = await this.sign(payload)
        return new PublishRequest(
            publishRequest.streamId,
            publishRequest.apiKey,
            publishRequest.sessionToken,
            publishRequest.content,
            publishRequest.timestamp,
            publishRequest.partitionKey,
            signature,
        )
    }
}
