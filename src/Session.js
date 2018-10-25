const Web3 = require('web3')

const web3 = new Web3()

export default class Session {
    constructor(client) {
        this._client = client
        this.options = {
            privateKey: null,
            provider: null,
            apiKey: null,
            username: null,
            password: null,
            sessionToken: null,
        }
        Object.assign(this.options, client.options.auth)

        if (this.options.privateKey) {
            this.account = web3.eth.accounts.privateKeyToAccount(this.options.privateKey)
            this.loginFunction = async () => this._client.loginWithChallengeResponse((d) => this.account.sign(d).signature, this.account.address)
        } else if (this.options.provider) {
            const w3 = new Web3(this.options.provider)
            const accounts = w3.eth.getAccounts()
            const address = accounts[0]
            if (!address) {
                throw new Error('Cannot access account from provider')
            }
            this.loginFunction = async () => this._client.loginWithChallengeResponse((d) =>
                w3.eth.personal.sign(d, this.address), this.account.address)
        } else if (this.options.apiKey) {
            this.loginFunction = async () => this._client.loginWithApiKey({
                apikey: this.options.apiKey,
            })
        } else if (this.options.username && this.options.password) {
            this.loginFunction = async () => this._client.loginWithUsernamePassword({
                username: this.options.username,
                password: this.options.password,
            })
        } else {
            this.loginFunction = async () => {
                throw new Error('Need either "privateKey", "apiKey" or "username"+"password" to login.')
            }
        }
    }

    async getSessionToken(requireNewToken = false) {
        if (this.options.sessionToken && !requireNewToken) {
            return this.options.sessionToken
        }
        const tokenObj = await this.loginFunction()
        this.options.sessionToken = tokenObj.token
        return tokenObj.token
    }
}
