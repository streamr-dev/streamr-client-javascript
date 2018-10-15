import StreamrClient from './StreamrClient'
import * as AllEndpoints from './rest/AllEndpoints'
import * as Protocol from './protocol'

// Mixin the rest endpoints to the StreamrClient
Object.assign(StreamrClient.prototype, AllEndpoints)

// Expose protocol messages under StreamrClient.Protocol
StreamrClient.Protocol = Protocol

export default StreamrClient
