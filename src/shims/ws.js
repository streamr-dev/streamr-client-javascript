const WebSocket = typeof window !== 'undefined' ? window.WebSocket : require('ws')
module.exports = WebSocket
