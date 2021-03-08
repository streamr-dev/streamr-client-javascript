"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const streamr_client_1 = __importStar(require("streamr-client")), NamedExports = streamr_client_1;
console.info('import DefaultExport, * as NamedExports from \'streamr-client\':', { DefaultExport: streamr_client_1.default, NamedExports });
const StreamrClient = streamr_client_1.default;
const auth = StreamrClient.generateEthereumAccount();
const client = new StreamrClient({
    auth,
});
console.assert(!!NamedExports.DataUnion, 'NamedExports should have DataUnion');
client.connect().then(() => {
    console.info('success');
    return client.disconnect();
});
