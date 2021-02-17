import { BigNumber } from '@ethersproject/bignumber'
import { DataUnionEndpoints } from '../rest/DataUnionEndpoints'

export interface DataUnionDeployOptions {
    owner?: string,
    joinPartAgents?: string[],
    dataUnionName?: string,
    adminFee?: number,
    sidechainPollingIntervalMs?: number,
    sidechainRetryTimeoutMs?: number
    /* TODO these were maybe included for DUv1, should we add the support to deployDataUnion method or remove the fields
    wallet?: Todo,
    provider?: Todo,
    confirmations?: Todo,
    gasPrice?: Todo,*/
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

    async join(memberAddress: string, secret?: string) {
        return this.dataUnionEndpoints.join(memberAddress, secret, this.contractAddress)
    }

    async hasJoined(memberAddress: string, options?: { pollingIntervalMs?: number, retryTimeoutMs?: number }) {
        return this.dataUnionEndpoints.hasJoined(memberAddress, options, this.contractAddress)
    }

    async withdrawAll(options?: DataUnionWithdrawOptions) {
        return this.dataUnionEndpoints.withdrawAll(this.contractAddress, options)
    }

    async withdrawAllTo(recipientAddress: string, options?: DataUnionWithdrawOptions) {
        return this.dataUnionEndpoints.withdrawAllTo(recipientAddress, options, this.contractAddress)
    }

    async signWithdrawAllTo(recipientAddress: string) {
        return this.dataUnionEndpoints.signWithdrawAllTo(recipientAddress, this.contractAddress)
    }

    async signWithdrawAmountTo(recipientAddress: string, amountTokenWei: BigNumber|number|string) {
        return this.dataUnionEndpoints.signWithdrawAmountTo(recipientAddress, amountTokenWei, this.contractAddress)
    }

    async addMembers(memberAddressList: string[], requiredConfirmationCount: number = 1) {
        return this.dataUnionEndpoints.addMembers(memberAddressList, requiredConfirmationCount, this.contractAddress)
    }

    async partMembers(memberAddressList: string[], requiredConfirmationCount: number = 1) {
        return this.dataUnionEndpoints.partMembers(memberAddressList, requiredConfirmationCount, this.contractAddress)
    }

    async getAdminAddress() {
        return this.dataUnionEndpoints.getAdminAddress(this.contractAddress)
    }

    async getMembers() {
        return this.dataUnionEndpoints.getMembers(this.contractAddress)
    }

    async setAdminFee(newFeeFraction: number) {
        return this.dataUnionEndpoints.setAdminFee(newFeeFraction, this.contractAddress)
    }

    async getAdminFee() {
        return this.dataUnionEndpoints.getAdminFee(this.contractAddress)
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

    async withdrawAllToMember(memberAddress: string, options?: DataUnionWithdrawOptions) {
        return this.dataUnionEndpoints.withdrawAllToMember(memberAddress, options, this.contractAddress)
    }

    async withdrawAllToSigned(memberAddress: string, recipientAddress: string, signature: string, options?: DataUnionWithdrawOptions) {
        return this.dataUnionEndpoints.withdrawAllToSigned(memberAddress, recipientAddress, signature, options, this.contractAddress)
    }

    // TODO move to somewhere else?
    async getTokenBalance(address: string|null|undefined) {
        return this.dataUnionEndpoints.getTokenBalance(address, this.contractAddress)
    }
}