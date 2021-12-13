'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZeroConnection = exports.ZeroUser = exports.ZeroKeeper = void 0;
const index_1 = __importDefault(require("libp2p/src/index")); // @ts-ignore
const logger_1 = __importDefault(require("../logger"));
//import { MockZeroConnection } from './mocks';
const util_1 = require("./util");
const it_pipe_1 = __importDefault(require("it-pipe"));
const it_length_prefixed_1 = __importDefault(require("it-length-prefixed"));
const persistence_1 = require("../persistence");
const peerId = require("peer-id");
const events_1 = require("events");
class ZeroConnection extends index_1.default {
}
exports.ZeroConnection = ZeroConnection;
class ZeroUser extends events_1.EventEmitter {
    constructor(connection, persistence) {
        super();
        this.conn = connection;
        this.conn.on('peer:discovery', () => console.log('discovered!'));
        this.keepers = [];
        this.log = (0, logger_1.default)('zero.user');
        this.storage = persistence !== null && persistence !== void 0 ? persistence : new persistence_1.InMemoryPersistenceAdapter();
    }
    subscribeKeepers() {
        return __awaiter(this, void 0, void 0, function* () {
            this.conn.pubsub.on('zero.keepers', (message) => __awaiter(this, void 0, void 0, function* () {
                const { data, from } = message;
                const { address } = (0, util_1.fromBufferToJSON)(data);
                if (!this.keepers.includes(from)) {
                    try {
                        this.keepers.push(from);
                        this.emit('keeper', from);
                        this.log.debug(`Keeper Details: `, {
                            from,
                        });
                        this.log.info(`Found keeper: ${from} with address ${address}`);
                    }
                    catch (e) {
                        this.log.error(`Timed out finding keeper: ${from}`);
                        this.log.debug(e.message);
                    }
                }
            }));
            this.conn.pubsub.subscribe('zero.keepers');
            this.log.info('Subscribed to keeper broadcasts');
        });
    }
    unsubscribeKeepers() {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.debug('Keepers before unsubscription', this.keepers);
            try {
                yield this.conn.pubsub.unsubscribe('zero.keepers');
            }
            catch (e) {
                this.log.error('Could not unsubscribe to keeper broadcasts');
                this.log.debug(e.message);
            }
            this.log.info('Unsubscribed to keeper broadcasts');
            this.keepers = [];
        });
    }
    publishTransferRequest(transferRequest) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = yield this.storage.set(transferRequest);
            if (this.keepers.length === 0) {
                this.log.error('Cannot publish transfer request if no keepers are found');
                return;
            }
            try {
                let ackReceived = false;
                // should add handler for rejection
                yield this.conn.handle('/zero/user/confirmation', ({ stream }) => __awaiter(this, void 0, void 0, function* () {
                    (0, it_pipe_1.default)(stream.source, it_length_prefixed_1.default.decode(), (rawData) => { var rawData_1, rawData_1_1; return __awaiter(this, void 0, void 0, function* () {
                        var e_1, _a;
                        let string = [];
                        try {
                            for (rawData_1 = __asyncValues(rawData); rawData_1_1 = yield rawData_1.next(), !rawData_1_1.done;) {
                                const msg = rawData_1_1.value;
                                string.push(msg.toString());
                            }
                        }
                        catch (e_1_1) { e_1 = { error: e_1_1 }; }
                        finally {
                            try {
                                if (rawData_1_1 && !rawData_1_1.done && (_a = rawData_1.return)) yield _a.call(rawData_1);
                            }
                            finally { if (e_1) throw e_1.error; }
                        }
                        const { txConfirmation } = JSON.parse(string.join(''));
                        yield this.storage.setStatus(key, 'succeeded');
                        ackReceived = true;
                        this.log.info(`txDispatch confirmed: ${txConfirmation}`);
                    }); });
                }));
                for (const keeper of this.keepers) {
                    // Typescript error: This condition will always return 'true' since the types 'false' and 'true' have no overlap.
                    // This is incorrect, because ackReceived is set to true in the handler of /zero/user/confirmation
                    // @ts-expect-error
                    if (ackReceived !== true) {
                        try {
                            const peer = yield peerId.createFromB58String(keeper);
                            const { stream } = yield this.conn.dialProtocol(peer, '/zero/keeper/dispatch');
                            (0, it_pipe_1.default)(JSON.stringify({
                                amount: transferRequest.amount,
                                asset: transferRequest.asset,
                                chainId: transferRequest.chainId,
                                contractAddress: transferRequest.contractAddress,
                                data: transferRequest.data,
                                module: transferRequest.module,
                                nonce: transferRequest.nonce,
                                pNonce: transferRequest.pNonce,
                                signature: transferRequest.signature,
                                to: transferRequest.to,
                                underwriter: transferRequest.underwriter,
                            }), it_length_prefixed_1.default.encode(), stream.sink);
                            this.log.info(`Published transfer request to ${keeper}. Waiting for keeper confirmation.`);
                        }
                        catch (e) {
                            this.log.error(`Failed dialing keeper: ${keeper} for txDispatch`);
                            this.log.debug(e.stack);
                        }
                    }
                    else {
                        break;
                    }
                }
            }
            catch (e) {
                this.log.error('Could not publish transfer request');
                this.log.debug(e.message);
                return;
            }
        });
    }
}
exports.ZeroUser = ZeroUser;
class ZeroKeeper {
    constructor(connection) {
        this.conn = connection;
        this.conn.on('peer:discovery', () => console.log('discovered from keeper!'));
        this.dispatches = [];
        this.log = (0, logger_1.default)('zero.keeper');
    }
    advertiseAsKeeper(address) {
        return __awaiter(this, void 0, void 0, function* () {
            this.active = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield this.conn.pubsub.publish('zero.keepers', (0, util_1.fromJSONtoBuffer)({
                        address,
                    }));
                    this.log.debug(`Made presence known ${this.conn.peerId.toB58String()}`);
                }
                catch (e) {
                    console.debug(e);
                    this.log.info('Could not make presence known. Retrying in 1s');
                    this.log.debug(e.message);
                }
            }), 1000);
            this.log.info('Started to listen for tx dispatch requests');
        });
    }
    setTxDispatcher(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            const handler = (duplex) => __awaiter(this, void 0, void 0, function* () {
                const stream = duplex.stream;
                (0, it_pipe_1.default)(stream.source, it_length_prefixed_1.default.decode(), (rawData) => { var rawData_2, rawData_2_1; return __awaiter(this, void 0, void 0, function* () {
                    var e_2, _a;
                    // TODO: match handle and dialProtocol spec
                    /*if (process?.env.NODE_ENV === 'test') {
                        callback(fromBufferToJSON(stream.source));
                        return;
                    }*/
                    let string = [];
                    try {
                        for (rawData_2 = __asyncValues(rawData); rawData_2_1 = yield rawData_2.next(), !rawData_2_1.done;) {
                            const msg = rawData_2_1.value;
                            string.push(msg.toString());
                        }
                    }
                    catch (e_2_1) { e_2 = { error: e_2_1 }; }
                    finally {
                        try {
                            if (rawData_2_1 && !rawData_2_1.done && (_a = rawData_2.return)) yield _a.call(rawData_2);
                        }
                        finally { if (e_2) throw e_2.error; }
                    }
                    callback(JSON.parse(string.join('')));
                }); });
            });
            yield this.conn.handle('/zero/keeper/dispatch', handler);
            this.log.info('Set the tx dispatcher');
        });
    }
    destroy() {
        clearTimeout(this.active);
    }
}
exports.ZeroKeeper = ZeroKeeper;
