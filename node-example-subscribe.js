const StreamrClient = require('./dist/streamr-client')

// Create the client and supply either an API key or an Ethereum private key to authenticate
const client = new StreamrClient({
    // url: 'ws://localhost:8890/api/v1/ws',
    url: 'ws://localhost/api/v1/ws',
    restUrl: 'http://localhost:8081/streamr-core/api/v1',

    auth: {
        apiKey: 'tester1-api-key',
        // Or to cryptographically authenticate with Ethereum and enable data signing:
        // privateKey: 'ETHEREUM-PRIVATE-KEY',
    },
})

// Create a stream for this example if it doesn't exist
client.getOrCreateStream({
    name: 'run-canvas-spec',
}).then((stream) => {
    client.subscribe(
        {
            stream: stream.id,
            // Resend the last 10 messages on connect
            resend: {
                last: 10,
            },
        },
        (message) => {
            // Do something with the messages as they are received
            console.log('run-canvas-spec ===> ' + JSON.stringify(message) + '\n')
        },
    )
})
