const ethereumConfig = {
    sidechain: {
        url: process.env.SIDECHAIN_URL || 'http://10.200.10.1:8546',
        timeout: process.env.TEST_TIMEOUT,
    },
    mainnet: {
        url: process.env.ETHEREUM_SERVER_URL || 'http://10.200.10.1:8545',
        timeout: process.env.TEST_TIMEOUT,
    },
    // ganache 1: 0x4178baBE9E5148c6D5fd431cD72884B07Ad855a0
    privateKey: process.env.ETHEREUM_PRIVATE_KEY || '0xe5af7834455b7239881b85be89d905d6881dcb4751063897f12be1b0dd546bdb',
}

module.exports = {
    clientOptions: {
        url: process.env.WEBSOCKET_URL || 'ws://localhost/api/v1/ws',
        restUrl: process.env.REST_URL || 'http://localhost:8081/streamr-core/api/v1',
        sidechainUrl: ethereumConfig.sidechain.url,
        tokenAddress: process.env.TOKEN_ADDRESS || '0xbAA81A0179015bE47Ad439566374F2Bae098686F',
        tokenAddressSidechain: process.env.TOKEN_ADDRESS_SIDECHAIN || '0x3b11D489411BF11e843Cb28f8824dedBfcB75Df3',
        streamrNodeAddress: process.env.STREAMR_NODE_ADDRESS || '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c',
        streamrOperatorAddress: process.env.OPERATOR_ADDRESS || '0xa3d1F77ACfF0060F7213D7BF3c7fEC78df847De1',
    },
    ...ethereumConfig,
}
