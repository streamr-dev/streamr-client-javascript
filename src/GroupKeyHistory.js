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

    getKeysBetween(start, end) {
        if (typeof start !== 'number' || typeof end !== 'number' || start > end) {
            throw new Error('Both "start" and "end" must be defined numbers and "start" must be less than or equal to "end".')
        }
        let i = 0
        // discard keys that ended before 'start'
        while (i < this.keys.length - 1 && this._getKeyEnd(i) < start) {
            i += 1
        }
        const selectedKeys = []
        // add keys as long as they started before 'end'
        while (i < this.keys.length && this.keys[i].start <= end) {
            selectedKeys.push(this.keys[i])
            i += 1
        }
        return selectedKeys
    }

    addKey(groupKey, start) {
        this.keys.push({
            groupKey,
            start: start || Date.now()
        })
    }

    _getKeyEnd(keyIndex) {
        if (keyIndex < 0 || keyIndex >= this.keys.length - 1) {
            return undefined
        }
        return this.keys[keyIndex + 1].start - 1
    }
}
