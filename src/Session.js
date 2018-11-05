const Web3 = require('web3')

const web3 = new Web3()

export default class Session {
    constructor(client, options) {
        this._client = client
        this.options = options.auth || {}
        this.state = Session.State.LOGGED_OUT

        if (this.options.privateKey) {
            const account = web3.eth.accounts.privateKeyToAccount(this.options.privateKey)
            this.sign = (d) => account.sign(d).signature
            this.loginFunction = async () => this._client.loginWithChallengeResponse(this.sign, account.address)
        } else if (this.options.provider) {
            const w3 = new Web3(this.options.provider)
            const accounts = w3.eth.getAccounts()
            const address = accounts[0]
            if (!address) {
                throw new Error('Cannot access account from provider')
            }
            this.sign = (d) => w3.eth.personal.sign(d, address)
            this.loginFunction = async () => this._client.loginWithChallengeResponse(this.sign, address)
        } else if (this.options.apiKey) {
            this.loginFunction = async () => this._client.loginWithApiKey(this.options.apiKey)
        } else if (this.options.username && this.options.password) {
            this.loginFunction = async () => this._client.loginWithUsernamePassword(this.options.username, this.options.password)
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
        if (this.state === Session.State.LOGGING_IN) {
            return Promise.reject(new Error('Already logging in!'))
        }
        this.state = Session.State.LOGGING_IN
        return this.loginFunction().then((tokenObj) => {
            this.options.sessionToken = tokenObj.token
            this.state = Session.State.LOGGED_IN
            return tokenObj.token
        })
    }
}

Session.State = {
    LOGGED_OUT: 'logged out',
    LOGGING_IN: 'logging in',
    LOGGED_IN: 'logged in',
}
