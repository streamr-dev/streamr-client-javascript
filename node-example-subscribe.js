const StreamrClient = require('./dist/streamr-client')

// Create the client and supply either an API key or an Ethereum private key to authenticate
const client = new StreamrClient({
    auth: {
        apiKey: 'FA_S12IXQqqCR6pbDBg0Twj2rCb0JjRu-ptsazFekZTA',
        // Or to cryptographically authenticate with Ethereum and enable data signing:
        // privateKey: 'ETHEREUM-PRIVATE-KEY',
    },
})

// Create a stream for this example if it doesn't exist
client.getOrCreateStream({
    id: 'cueeTiqTQUmHjZJhv4rOhA',
}).then((stream) => {
    client.subscribe(
        {
            stream: stream.id,
            // Resend the last 10 messages on connect
            resend: {
                last: 100,
            },
        },
        (message) => {
            // Do something with the messages as they are received
            console.log(JSON.stringify(message))
        },
    )
})
