import GroupKeyHistory from './GroupKeyHistory'
import EncryptionUtil from './EncryptionUtil'

export default class KeyStorageUtil {
    // publisherGroupKeys is an object {streamId: groupKey}
    constructor(publisherGroupKeys = {}) {
        this.groupKeyHistories = {}
        Object.keys(publisherGroupKeys).forEach((streamId) => {
            EncryptionUtil.validateGroupKey(publisherGroupKeys[streamId])
            this.groupKeyHistories[streamId] = new GroupKeyHistory(publisherGroupKeys[streamId])
        })
    }

    hasKey(streamId) {
        return this.groupKeyHistories[streamId] !== undefined
    }

    getLatestKey(streamId, withStart = false) {
        if (this.groupKeyHistories[streamId]) {
            return this.groupKeyHistories[streamId].getLatestKey(withStart)
        }
        return undefined
    }

    getKeysBetween(streamId, start, end) {
        if (this.groupKeyHistories[streamId]) {
            return this.groupKeyHistories[streamId].getKeysBetween(start, end)
        }
        return []
    }

    addKey(streamId, groupKey, start) {
        if (!this.groupKeyHistories[streamId]) {
            this.groupKeyHistories[streamId] = new GroupKeyHistory()
        }
        this.groupKeyHistories[streamId].addKey(groupKey, start)
    }
}
