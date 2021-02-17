import { BigNumber } from '@ethersproject/bignumber'
import { DataUnionEndpoints } from '../rest/DataUnionEndpoints'
import { Todo } from '../types'

export interface DataUnionOptions {
    wallet?: Todo,
    provider?: Todo,
    confirmations?: Todo,
    gasPrice?: Todo,
}

export interface DataUnionWithdrawOptions {
    pollingIntervalMs?: number
    retryTimeoutMs?: number
    payForSignatureTransport?: boolean    
}

export class DataUnion {

    contractAddress: string
    dataUnionEndpoints: DataUnionEndpoints
    
    constructor(contractAddress: string, dataUnionEndpoints: DataUnionEndpoints) {
        this.contractAddress = contractAddress
        this.dataUnionEndpoints = dataUnionEndpoints
    }

    async kick(memberAddressList: string[], requiredConfirmationCount: number = 1) {
        return this.dataUnionEndpoints.kick(memberAddressList, requiredConfirmationCount, this.contractAddress)
    }

    async addMembers(memberAddressList: string[], requiredConfirmationCount: number = 1) {
        return this.dataUnionEndpoints.addMembers(memberAddressList, requiredConfirmationCount, this.contractAddress)
    }

    async withdrawMember(memberAddress: string, options?: DataUnionWithdrawOptions) {
        return this.dataUnionEndpoints.withdrawMember(memberAddress, options, this.contractAddress)
    }

    async getWithdrawMemberTx(memberAddress: string) {
        return this.dataUnionEndpoints.getWithdrawMemberTx(memberAddress, this.contractAddress)
    }

    async withdrawToSigned(memberAddress: string, recipientAddress: string, signature: string, options?: DataUnionWithdrawOptions) {
        return this.dataUnionEndpoints.withdrawToSigned(memberAddress, recipientAddress, signature, options, this.contractAddress)
    }

    async getWithdrawToSignedTx(memberAddress: string, recipientAddress: string, signature: string) {
        return this.dataUnionEndpoints.getWithdrawToSignedTx(memberAddress, recipientAddress, signature, this.contractAddress)
    }

    async setAdminFee(newFeeFraction: number) {
        return this.dataUnionEndpoints.setAdminFee(newFeeFraction, this.contractAddress)
    }

    async getAdminFee() {
        return this.dataUnionEndpoints.getAdminFee(this.contractAddress)
    }

    async getAdminAddress() {
        return this.dataUnionEndpoints.getAdminAddress(this.contractAddress)
    }

    async join(memberAddress: string, secret?: string) {
        return this.dataUnionEndpoints.join(memberAddress, secret, this.contractAddress)
    }

    async hasJoined(memberAddress: string, options?: { pollingIntervalMs?: number, retryTimeoutMs?: number }) {
        return this.dataUnionEndpoints.hasJoined(memberAddress, options, this.contractAddress)
    }

    async getMembers() {
        return this.dataUnionEndpoints.getMembers(this.contractAddress)
    }

    async getDataUnionStats() {
        return this.dataUnionEndpoints.getDataUnionStats(this.contractAddress)
    }

    async getMemberStats(memberAddress?: string) {
        return this.dataUnionEndpoints.getMemberStats(memberAddress, this.contractAddress)
    }

    async getMemberBalance(memberAddress: string) {
        return this.dataUnionEndpoints.getMemberBalance(memberAddress, this.contractAddress)
    }

    async getTokenBalance(address: string|null|undefined) {
        return this.dataUnionEndpoints.getTokenBalance(address, this.contractAddress)
    }

    async withdrawAll(options?: DataUnionWithdrawOptions) {
        return this.dataUnionEndpoints.withdrawAll(this.contractAddress, options)
    }

    async getWithdrawTx() {
        return this.dataUnionEndpoints.getWithdrawTx(this.contractAddress)
    }

    async withdrawTo(recipientAddress: string, options?: DataUnionWithdrawOptions) {
        return this.dataUnionEndpoints.withdrawAllTo(recipientAddress, options, this.contractAddress)
    }

    async getWithdrawTxTo(recipientAddress: string) {
        return this.dataUnionEndpoints.getWithdrawTxTo(recipientAddress, this.contractAddress)
    }

    async signWithdrawTo(recipientAddress: string) {
        return this.dataUnionEndpoints.signWithdrawTo(recipientAddress, this.contractAddress)
    }

    async signWithdrawAmountTo(recipientAddress: string, amountTokenWei: BigNumber|number|string) {
        return this.dataUnionEndpoints.signWithdrawAmountTo(recipientAddress, amountTokenWei, this.contractAddress)
    }
}