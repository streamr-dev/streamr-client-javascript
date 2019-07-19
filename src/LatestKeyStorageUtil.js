export default class LatestKeyStorageUtil {
    constructor(publisherGroupKeys = {}) {
        this.latestKeys = publisherGroupKeys
    }

    hasKey(streamId) {
        return this.latestKeys[streamId] !== undefined
    }

    getLatestKey(streamId, withStart = false) {
        if (this.latestKeys[streamId]) {
            if (withStart) {
                return this.latestKeys[streamId]
            }
            return this.latestKeys[streamId].groupKey
        }
        return undefined
    }

    /* eslint-disable class-methods-use-this */
    getKeysBetween(streamId, start, end) {
        throw new Error(`Cannot retrieve historical keys for stream ${streamId} between ${start} and ${end} because only the latest key is stored.
         Set options.publisherStoreKeyHistory to true to store all historical keys.`)
    }
    /* eslint-enable class-methods-use-this */

    addKey(streamId, groupKey, start) {
        this.latestKeys[streamId] = {
            groupKey,
            start
        }
    }
}
