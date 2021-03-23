const { format, inspect } = require('util')
const { randomBytes } = require('crypto')
const Emitter = require('events')
// const { Benchmark } = require('benchmark')
const prettyBytes = require('pretty-bytes')

// eslint-disable-next-line import/no-unresolved
const StreamrClient = require('../../dist') //../streamr-client2/')
const config = require('../integration/config')

/* eslint-disable no-console */

let count = 100000 // pedantic: use large initial number so payload size is similar
const Msg = (v) => {
    count += 1
    return {
        count,
        value: v || `msg${count}`
    }
}

function createClient(opts) {
    return new StreamrClient({
        ...config.clientOptions,
        ...opts,
    })
}

async function setupClientAndStream(clientOpts, streamOpts) {
    const client = createClient(clientOpts)
    await client.connect()
    await client.session.getSessionToken()

    const stream = await client.createStream({
        name: `test-stream.${client.id}`,
        ...streamOpts,
    })
    return [client, stream]
}

const BATCH_SIZE = 16
const BATCHES = 10
const MSG_SIZES = [
    1,
    16,
    32,
    64,
    128,
    256,
    // 512,
    // 1024,
    // 4096,
].map((v) => 1024 * v)

let time = 0
const log = (...args) => process.stderr.write(format(...args) + '\n')

async function run() {
    const account1 = StreamrClient.generateEthereumAccount()
    const [client1, stream1] = await setupClientAndStream({
        auth: {
            privateKey: account1.privateKey,
        },
        // publishWithSignature: 'always',
    })

    // const account2 = StreamrClient.generateEthereumAccount()
    // const [client2, stream2] = await setupClientAndStream({
        // auth: {
            // privateKey: account2.privateKey,
        // },
    // })
    function Defer() {
        let a
        let b
        const p = new Promise((resolve, reject) => {
            a = resolve
            b = reject
        })
        p.resolve = a
        p.reject = b
        return p
    }
    class Suite extends Emitter {
        constructor() {
            super()
            this.tests = []
        }
        add(name, options) {
            this.tests.push({
                name,
                options
            })
        }
        async next() {
            const next = this.tests.shift()
            if (!next) {
                this.emit('complete')
                return
            }
            const done = Defer()
            const event = {
                target: next,
            }
            try {
                await next.options.fn.call(next, done)
            } catch (error) {
                done.reject(error)
                next.error = error
            } finally {
                console.log('done >')
                await done
                console.log('done <')
                this.emit('cycle', event)
            }

            console.log('next >')
            await this.next()
            console.log('next <')
        }

        run() {
            return this.next()
        }
    }
    const suite = new Suite()

    function buildMessages(messageSize) {
        const msgs = []
        for (let i = 0; i < BATCH_SIZE; i++) {
            msgs.push(messageSize)
        }
        return msgs
    }

    async function publish(stream, msgs) {
        time += 1
        const now = time
        for (let i = 0; i < BATCHES; i++) {
            // eslint-disable-next-line no-await-in-loop
            await Promise.all(msgs.map((messageSize) => stream.publish(Msg(`${i}:` + randomBytes(messageSize).toString('utf8')), now)))
        }
        return msgs
    }

    function test(client, stream, msgSize) {
        const msgs = buildMessages(msgSize)
        return async function Fn(deferred) {
            this.BATCH_SIZE = BATCHES * BATCH_SIZE
            this.startSize = process.memoryUsage()
            this.midSizes = []
            this.msgSize = msgSize
            let published
            const received = []
            const sub = await client.subscribe(stream.id, async (msg) => {
                received.push(msg)
                this.midSizes.push(process.memoryUsage())
                if (published && received.length === msgs.length) {
                    // eslint-disable-next-line promise/catch-or-return
                    await client.unsubscribe(sub)
                    this.endSize = process.memoryUsage()
                    deferred.resolve()
                }
            })
            published = await publish(stream, msgs)
            // sub.on('subscribed', async () => {
                // published = await publish(stream, msgs)
            // })
            // sub.on('unsubscribed', () => {
                // this.endSize = process.memoryUsage()
                // deferred.resolve()
            // })
        }
    }

    MSG_SIZES.forEach((msgSize) => {
        suite.add(`pub/sub with message size ${prettyBytes(msgSize)}`, {
            defer: true,
            fn: test(client1, stream1, msgSize)
        })
    })

    function compareMemory({ midSizes, startSize, endSize }) {
        const res = Object.keys(startSize).reduce((o, key) => {
            const value = endSize[key]
            const start = startSize[key]
            const diff = endSize[key] - startSize[key]
            return Object.assign(o, {
                [key]: key === 'arrayBuffers'
                    ? `${start} -> ${value}: ${diff}`
                    : `${prettyBytes(start)} -> ${prettyBytes(value)}: ${prettyBytes(diff, { signed: true })}`
            })
        }, {})
        res.avgMidSize = midSizes.reduce((o, midSize, index, arr) => {
            Object.keys(midSize).forEach((key) => {
                Object.assign(o, {
                    [key]: (o[key] || 0) + midSize[key],
                })
            })
            if (index === arr.length - 1) {
                Object.keys(midSize).forEach((key) => {
                    if (key === 'arrayBuffers') {
                        return
                    }
                    Object.assign(o, {
                        [key]: prettyBytes(o[key] / arr.length)
                    })
                })
            }
            return o
        }, {})
        return inspect(res)
    }

    function toStringBench(bench) {
        const { error, name } = bench
        // let { hz } = bench
        // hz *= bench.BATCH_SIZE // adjust hz by batch size
        // const size = stats.sample.length
        // const pm = '\xb1'
        let result = name
            // || (Number.isNaN(id) ? id : '<Test #' + id + '>')
        if (error) {
            return result + ' Error'
        }

        // result += ' x ' + Benchmark.formatNumber(hz.toFixed(hz < 100 ? 2 : 0)) + ' ops/sec ' + pm
            // + stats.rme.toFixed(2) + '% (' + size + ' run' + (size === 1 ? '' : 's') + ' sampled)\n'
        result += `Message Size: ${prettyBytes(bench.msgSize)}\n`
        result += `${compareMemory(bench)}\n`
        return result
    }

    suite.on('cycle', (event) => {
        log(toStringBench(event.target))
    })

    suite.on('complete', async () => {
        log('Disconnecting clients')
        await Promise.all([
            client1.disconnect(),
            // client2.disconnect(),
            // client3.disconnect(),
        ])
        log('Clients disconnected')
    })

    suite.run()
}

run()
