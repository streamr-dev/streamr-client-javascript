import * as StreamEndpoints from './StreamEndpoints'
import * as LoginEndpoints from './LoginEndpoints'
import * as CommunityEndpoints from './CommunityEndpoints'

export default {
    ...StreamEndpoints,
    ...LoginEndpoints,
    ...CommunityEndpoints,
}
