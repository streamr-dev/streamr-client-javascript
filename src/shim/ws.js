let ws

if (typeof WebSocket !== 'undefined') {
    ws = WebSocket
} else {
    ws = window.WebSocket
}

module.exports = ws
