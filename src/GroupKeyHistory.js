export default class GroupKeyHistory {
    constructor(initialGroupKey) {
        this.keys = []
        if (initialGroupKey) {
            this.keys.push({
                groupKey: initialGroupKey,
                start: Date.now()
            })
        }
    }

    getLatestKey(withStart = false) {
        const obj = this.keys[this.keys.length - 1]
        if (withStart) {
            return obj
        }
        return obj.groupKey
    }

    /*
    getKeysBetween(start, end) {

    } */

    addKey(groupKey, start) {
        this.keys.push({
            groupKey,
            start: start || Date.now()
        })
    }
}
