import assert from 'assert'
import crypto from 'crypto'

import KeyStorageUtil from '../../src/KeyStorageUtil'

describe('KeyStorageUtil', () => {
    describe('hasKey()', () => {
        it('returns true iff there is a GroupKeyHistory for the stream', () => {
            const util = new KeyStorageUtil({
                streamId: crypto.randomBytes(32)
            })
            assert.strictEqual(util.hasKey('streamId'), true)
            assert.strictEqual(util.hasKey('wrong-streamId'), false)
        })
    })
    describe('getLatestKey()', () => {
        it('returns undefined if no key history', () => {
            const util = new KeyStorageUtil()
            assert.strictEqual(util.getLatestKey('streamId'), undefined)
        })
        it('returns the last key', () => {
            const util = new KeyStorageUtil()
            util.addKey('streamId', crypto.randomBytes(32), 1)
            util.addKey('streamId', crypto.randomBytes(32), 5)
            const lastKey = crypto.randomBytes(32)
            util.addKey('streamId', lastKey, 7)
            assert.deepStrictEqual(util.getLatestKey('streamId', true), {
                groupKey: lastKey,
                start: 7,
            })
        })
    })
    describe('getKeysBetween()', () => {
        it('returns empty array for wrong streamId', () => {
            const util = new KeyStorageUtil()
            assert.deepStrictEqual(util.getKeysBetween('wrong-streamId', 1, 2), [])
        })
        it('returns empty array when end time is before start of first key', () => {
            const util = new KeyStorageUtil()
            util.addKey('streamId', crypto.randomBytes(32), 10)
            assert.deepStrictEqual(util.getKeysBetween('streamId', 1, 9), [])
        })
        it('returns only the latest key when start time is after last key', () => {
            const util = new KeyStorageUtil()
            util.addKey('streamId', crypto.randomBytes(32), 5)
            const lastKey = crypto.randomBytes(32)
            util.addKey('streamId', lastKey, 10)
            assert.deepStrictEqual(util.getKeysBetween('streamId', 15, 120), [{
                groupKey: lastKey,
                start: 10
            }])
        })
        it('returns keys in interval start-end', () => {
            const util = new KeyStorageUtil()
            const key1 = crypto.randomBytes(32)
            const key2 = crypto.randomBytes(32)
            const key3 = crypto.randomBytes(32)
            const key4 = crypto.randomBytes(32)
            const key5 = crypto.randomBytes(32)
            util.addKey('streamId', key1, 10)
            util.addKey('streamId', key2, 20)
            util.addKey('streamId', key3, 30)
            util.addKey('streamId', key4, 40)
            util.addKey('streamId', key5, 50)
            const expectedKeys = [{
                groupKey: key2,
                start: 20
            }, {
                groupKey: key3,
                start: 30
            }, {
                groupKey: key4,
                start: 40
            }]
            assert.deepStrictEqual(util.getKeysBetween('streamId', 23, 47), expectedKeys)
            assert.deepStrictEqual(util.getKeysBetween('streamId', 20, 40), expectedKeys)
        })
    })
})
