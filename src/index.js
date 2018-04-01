import StreamrClient from './StreamrClient'
import AllEndpoints from './rest/AllEndpoints'

// Mixin the rest endpoints to the StreamrClient
Object.assign(StreamrClient.prototype, AllEndpoints)

export default StreamrClient
