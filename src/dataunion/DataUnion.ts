import { BigNumber } from '@ethersproject/bignumber'
import { DataUnionEndpoints, DataUnionEndpointOptions } from '../rest/DataUnionEndpoints'
import { Todo } from '../types'

export interface DataUnionOptions {
    wallet?: Todo,
    provider?: Todo,
    confirmations?: Todo,
    gasPrice?: Todo,
    tokenAddress?: Todo,
    minimumWithdrawTokenWei?: BigNumber|number|string,
    payForSignatureTransport?: boolean
}

export class DataUnion {

    contractAddress: string
    dataUnionEndpoints: DataUnionEndpoints
    
    constructor(contractAddress: string, dataUnionEndpoints: DataUnionEndpoints) {
        this.contractAddress = contractAddress
        this.dataUnionEndpoints = dataUnionEndpoints
    }

    async kick(memberAddressList: string[], options?: DataUnionOptions) {
        return this.dataUnionEndpoints.kick(memberAddressList, this.getEndpointOptions(options))
    }

    async addMembers(memberAddressList: string[], options?: DataUnionOptions ) {
        return this.dataUnionEndpoints.addMembers(memberAddressList, this.getEndpointOptions(options))
    }

    async withdrawMember(memberAddress: string, options?: DataUnionOptions) {
        return this.dataUnionEndpoints.withdrawMember(memberAddress, this.getEndpointOptions(options))
    }

    async getWithdrawMemberTx(memberAddress: string, options?: DataUnionOptions) {
        return this.dataUnionEndpoints.getWithdrawMemberTx(memberAddress, this.getEndpointOptions(options))
    }

    async withdrawToSigned(memberAddress: string, recipientAddress: string, signature: string, options?: DataUnionOptions) {
        return this.dataUnionEndpoints.withdrawToSigned(memberAddress, recipientAddress, signature, this.getEndpointOptions(options))
    }

    async getWithdrawToSignedTx(memberAddress: string, recipientAddress: string, signature: string, options?: DataUnionOptions) {
        return this.dataUnionEndpoints.getWithdrawToSignedTx(memberAddress, recipientAddress, signature, this.getEndpointOptions(options))
    }

    async setAdminFee(newFeeFraction: number, options?: DataUnionOptions) {
        return this.dataUnionEndpoints.setAdminFee(newFeeFraction, this.getEndpointOptions(options))
    }

    async getAdminFee(options?: DataUnionOptions) {
        return this.dataUnionEndpoints.getAdminFee(this.getEndpointOptions(options))
    }

    async getAdminAddress(options?: DataUnionOptions) {
        return this.dataUnionEndpoints.getAdminAddress(this.getEndpointOptions(options))
    }

    async join(memberAddress: string, secret?: string) {
        return this.dataUnionEndpoints.join(memberAddress, secret, this.contractAddress)
    }

    async hasJoined(memberAddress: string, options?: { pollingIntervalMs?: number, retryTimeoutMs?: number }) {
        return this.dataUnionEndpoints.hasJoined(memberAddress, options, this.contractAddress)
    }

    async getMembers(options?: DataUnionOptions) {
        return this.dataUnionEndpoints.getMembers(this.getEndpointOptions(options))
    }

    async getDataUnionStats(options?: DataUnionOptions) {
        return this.dataUnionEndpoints.getDataUnionStats(this.getEndpointOptions(options))
    }

    async getMemberStats(memberAddress?: string, options?: DataUnionOptions) {
        return this.dataUnionEndpoints.getMemberStats(memberAddress, this.getEndpointOptions(options))
    }

    async getMemberBalance(memberAddress: string, options?: DataUnionOptions) {
        return this.dataUnionEndpoints.getMemberBalance(memberAddress, this.getEndpointOptions(options))
    }

    async getTokenBalance(address: string|null|undefined, options?: DataUnionOptions) {
        return this.dataUnionEndpoints.getTokenBalance(address, this.getEndpointOptions(options))
    }

    async withdrawAll(options?: DataUnionOptions) {
        return this.dataUnionEndpoints.withdrawAll(this.contractAddress, options)
    }

    async getWithdrawTx(options?: DataUnionOptions) {
        return this.dataUnionEndpoints.getWithdrawTx(this.getEndpointOptions(options))
    }

    async withdrawTo(recipientAddress: string, options?: DataUnionOptions) {
        return this.dataUnionEndpoints.withdrawAllTo(recipientAddress, this.contractAddress, options)
    }

    async getWithdrawTxTo(recipientAddress: string, options?: DataUnionOptions) {
        return this.dataUnionEndpoints.getWithdrawTxTo(recipientAddress, this.getEndpointOptions(options))
    }

    async signWithdrawTo(recipientAddress: string, options?: DataUnionOptions) {
        return this.dataUnionEndpoints.signWithdrawTo(recipientAddress, this.getEndpointOptions(options))
    }

    async signWithdrawAmountTo(recipientAddress: string, amountTokenWei: BigNumber|number|string, options?: DataUnionOptions) {
        return this.dataUnionEndpoints.signWithdrawAmountTo(recipientAddress, amountTokenWei, this.getEndpointOptions(options))
    }

    getEndpointOptions(options?: DataUnionOptions) {
        return {
            dataUnion: this.contractAddress,
            ...options
        }
    }
}