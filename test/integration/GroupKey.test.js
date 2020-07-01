import crypto from 'crypto'

import { ethers } from 'ethers'
import { waitForCondition } from 'streamr-test-utils'

import StreamrClient from '../../src'
import { uid } from '../utils'

const config = require('./config')

const createClient = (opts = {}) => new StreamrClient({
    auth: {
        privateKey: ethers.Wallet.createRandom().privateKey,
    },
    autoConnect: false,
    autoDisconnect: false,
    ...config.clientOptions,
    ...opts,
})

describe('group key', () => {
    const ROTATE_AFTER_NUMBER = 3
    let client
    let stream

    let errors = []
    function onError(error) {
        errors.push(error)
    }

    beforeEach(async () => {
        errors = []
        client = createClient()
        await client.ensureConnected()
        client.on('error', onError)
        stream = await client.createStream({
            name: uid('stream')
        })
    })

    afterEach(async () => {
        if (!client) { return }
        client.removeListener('error', onError)
        await client.ensureDisconnected()
        expect(errors[0]).toBeFalsy()
        expect(errors).toHaveLength(0)
    })

    describe('rotation', () => {
        let sub
        let publishedMessages = []
        let receivedMessages = []

        let counter = 0
        async function rotatingPublish(msgToPublish) {
            counter += 1
            if (counter % ROTATE_AFTER_NUMBER === 0) {
                const groupKey = crypto.randomBytes(32)
                await client.publish(stream.id, msgToPublish, Date.now(), null, groupKey)
            } else {
                await client.publish(stream.id, msgToPublish)
            }
        }

        async function publishNumber(n) {
            while (publishedMessages.length < n) {
                const msg = {
                    id: uid('msg'),
                    'client-implementation': 'Javascript',
                    'string-key': Math.random().toString(36).substr(2, 5),
                    'integer-key': Math.floor(Math.random() * 100),
                    'double-key': Math.random(),
                    'array-key': [4, -5, 19]
                }
                publishedMessages.push(msg)
                // eslint-disable-next-line no-await-in-loop
                await rotatingPublish(msg)
            }
        }

        beforeEach(async () => {
            publishedMessages = []
            receivedMessages = []
        })

        afterEach(async () => {
            if (!sub) { return }
            const s = sub
            sub = undefined
            await client.unsubscribe(s)
        })

        it('works when subscribing from start', async () => {
            const MAX_MESSAGES = ROTATE_AFTER_NUMBER + 3
            sub = client.subscribe(stream.id, (msg) => {
                receivedMessages.push(msg)
            })
            await new Promise((resolve) => sub.once('subscribed', resolve))
            await publishNumber(MAX_MESSAGES)
            await waitForCondition(() => receivedMessages.length === MAX_MESSAGES, 10000)
            expect(receivedMessages).toEqual(publishedMessages)
        }, 30000)
    })
})
