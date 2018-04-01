(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define("streamr-client", [], factory);
	else if(typeof exports === 'object')
		exports["streamr-client"] = factory();
	else
		root["StreamrClient"] = factory();
})(typeof self !== 'undefined' ? self : this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 4);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var has = Object.prototype.hasOwnProperty
  , prefix = '~';

/**
 * Constructor to create a storage for our `EE` objects.
 * An `Events` instance is a plain object whose properties are event names.
 *
 * @constructor
 * @private
 */
function Events() {}

//
// We try to not inherit from `Object.prototype`. In some engines creating an
// instance in this way is faster than calling `Object.create(null)` directly.
// If `Object.create(null)` is not supported we prefix the event names with a
// character to make sure that the built-in object properties are not
// overridden or used as an attack vector.
//
if (Object.create) {
  Events.prototype = Object.create(null);

  //
  // This hack is needed because the `__proto__` property is still inherited in
  // some old browsers like Android 4, iPhone 5.1, Opera 11 and Safari 5.
  //
  if (!new Events().__proto__) prefix = false;
}

/**
 * Representation of a single event listener.
 *
 * @param {Function} fn The listener function.
 * @param {*} context The context to invoke the listener with.
 * @param {Boolean} [once=false] Specify if the listener is a one-time listener.
 * @constructor
 * @private
 */
function EE(fn, context, once) {
  this.fn = fn;
  this.context = context;
  this.once = once || false;
}

/**
 * Add a listener for a given event.
 *
 * @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
 * @param {(String|Symbol)} event The event name.
 * @param {Function} fn The listener function.
 * @param {*} context The context to invoke the listener with.
 * @param {Boolean} once Specify if the listener is a one-time listener.
 * @returns {EventEmitter}
 * @private
 */
function addListener(emitter, event, fn, context, once) {
  if (typeof fn !== 'function') {
    throw new TypeError('The listener must be a function');
  }

  var listener = new EE(fn, context || emitter, once)
    , evt = prefix ? prefix + event : event;

  if (!emitter._events[evt]) emitter._events[evt] = listener, emitter._eventsCount++;
  else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
  else emitter._events[evt] = [emitter._events[evt], listener];

  return emitter;
}

/**
 * Clear event by name.
 *
 * @param {EventEmitter} emitter Reference to the `EventEmitter` instance.
 * @param {(String|Symbol)} evt The Event name.
 * @private
 */
function clearEvent(emitter, evt) {
  if (--emitter._eventsCount === 0) emitter._events = new Events();
  else delete emitter._events[evt];
}

/**
 * Minimal `EventEmitter` interface that is molded against the Node.js
 * `EventEmitter` interface.
 *
 * @constructor
 * @public
 */
function EventEmitter() {
  this._events = new Events();
  this._eventsCount = 0;
}

/**
 * Return an array listing the events for which the emitter has registered
 * listeners.
 *
 * @returns {Array}
 * @public
 */
EventEmitter.prototype.eventNames = function eventNames() {
  var names = []
    , events
    , name;

  if (this._eventsCount === 0) return names;

  for (name in (events = this._events)) {
    if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
  }

  if (Object.getOwnPropertySymbols) {
    return names.concat(Object.getOwnPropertySymbols(events));
  }

  return names;
};

/**
 * Return the listeners registered for a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @returns {Array} The registered listeners.
 * @public
 */
EventEmitter.prototype.listeners = function listeners(event) {
  var evt = prefix ? prefix + event : event
    , handlers = this._events[evt];

  if (!handlers) return [];
  if (handlers.fn) return [handlers.fn];

  for (var i = 0, l = handlers.length, ee = new Array(l); i < l; i++) {
    ee[i] = handlers[i].fn;
  }

  return ee;
};

/**
 * Return the number of listeners listening to a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @returns {Number} The number of listeners.
 * @public
 */
EventEmitter.prototype.listenerCount = function listenerCount(event) {
  var evt = prefix ? prefix + event : event
    , listeners = this._events[evt];

  if (!listeners) return 0;
  if (listeners.fn) return 1;
  return listeners.length;
};

/**
 * Calls each of the listeners registered for a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @returns {Boolean} `true` if the event had listeners, else `false`.
 * @public
 */
EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
  var evt = prefix ? prefix + event : event;

  if (!this._events[evt]) return false;

  var listeners = this._events[evt]
    , len = arguments.length
    , args
    , i;

  if (listeners.fn) {
    if (listeners.once) this.removeListener(event, listeners.fn, undefined, true);

    switch (len) {
      case 1: return listeners.fn.call(listeners.context), true;
      case 2: return listeners.fn.call(listeners.context, a1), true;
      case 3: return listeners.fn.call(listeners.context, a1, a2), true;
      case 4: return listeners.fn.call(listeners.context, a1, a2, a3), true;
      case 5: return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
      case 6: return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
    }

    for (i = 1, args = new Array(len -1); i < len; i++) {
      args[i - 1] = arguments[i];
    }

    listeners.fn.apply(listeners.context, args);
  } else {
    var length = listeners.length
      , j;

    for (i = 0; i < length; i++) {
      if (listeners[i].once) this.removeListener(event, listeners[i].fn, undefined, true);

      switch (len) {
        case 1: listeners[i].fn.call(listeners[i].context); break;
        case 2: listeners[i].fn.call(listeners[i].context, a1); break;
        case 3: listeners[i].fn.call(listeners[i].context, a1, a2); break;
        case 4: listeners[i].fn.call(listeners[i].context, a1, a2, a3); break;
        default:
          if (!args) for (j = 1, args = new Array(len -1); j < len; j++) {
            args[j - 1] = arguments[j];
          }

          listeners[i].fn.apply(listeners[i].context, args);
      }
    }
  }

  return true;
};

/**
 * Add a listener for a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @param {Function} fn The listener function.
 * @param {*} [context=this] The context to invoke the listener with.
 * @returns {EventEmitter} `this`.
 * @public
 */
EventEmitter.prototype.on = function on(event, fn, context) {
  return addListener(this, event, fn, context, false);
};

/**
 * Add a one-time listener for a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @param {Function} fn The listener function.
 * @param {*} [context=this] The context to invoke the listener with.
 * @returns {EventEmitter} `this`.
 * @public
 */
EventEmitter.prototype.once = function once(event, fn, context) {
  return addListener(this, event, fn, context, true);
};

/**
 * Remove the listeners of a given event.
 *
 * @param {(String|Symbol)} event The event name.
 * @param {Function} fn Only remove the listeners that match this function.
 * @param {*} context Only remove the listeners that have this context.
 * @param {Boolean} once Only remove one-time listeners.
 * @returns {EventEmitter} `this`.
 * @public
 */
EventEmitter.prototype.removeListener = function removeListener(event, fn, context, once) {
  var evt = prefix ? prefix + event : event;

  if (!this._events[evt]) return this;
  if (!fn) {
    clearEvent(this, evt);
    return this;
  }

  var listeners = this._events[evt];

  if (listeners.fn) {
    if (
      listeners.fn === fn &&
      (!once || listeners.once) &&
      (!context || listeners.context === context)
    ) {
      clearEvent(this, evt);
    }
  } else {
    for (var i = 0, events = [], length = listeners.length; i < length; i++) {
      if (
        listeners[i].fn !== fn ||
        (once && !listeners[i].once) ||
        (context && listeners[i].context !== context)
      ) {
        events.push(listeners[i]);
      }
    }

    //
    // Reset the array, or remove it completely if we have no more listeners.
    //
    if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
    else clearEvent(this, evt);
  }

  return this;
};

/**
 * Remove all listeners, or those of the specified event.
 *
 * @param {(String|Symbol)} [event] The event name.
 * @returns {EventEmitter} `this`.
 * @public
 */
EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
  var evt;

  if (event) {
    evt = prefix ? prefix + event : event;
    if (this._events[evt]) clearEvent(this, evt);
  } else {
    this._events = new Events();
    this._eventsCount = 0;
  }

  return this;
};

//
// Alias methods names because people roll like that.
//
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.addListener = EventEmitter.prototype.on;

//
// Expose the prefix.
//
EventEmitter.prefixed = prefix;

//
// Allow `EventEmitter` to be imported as module namespace.
//
EventEmitter.EventEmitter = EventEmitter;

//
// Expose the module.
//
if (true) {
  module.exports = EventEmitter;
}


/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

/* WEBPACK VAR INJECTION */(function(process) {/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = __webpack_require__(7);
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  '#0000CC', '#0000FF', '#0033CC', '#0033FF', '#0066CC', '#0066FF', '#0099CC',
  '#0099FF', '#00CC00', '#00CC33', '#00CC66', '#00CC99', '#00CCCC', '#00CCFF',
  '#3300CC', '#3300FF', '#3333CC', '#3333FF', '#3366CC', '#3366FF', '#3399CC',
  '#3399FF', '#33CC00', '#33CC33', '#33CC66', '#33CC99', '#33CCCC', '#33CCFF',
  '#6600CC', '#6600FF', '#6633CC', '#6633FF', '#66CC00', '#66CC33', '#9900CC',
  '#9900FF', '#9933CC', '#9933FF', '#99CC00', '#99CC33', '#CC0000', '#CC0033',
  '#CC0066', '#CC0099', '#CC00CC', '#CC00FF', '#CC3300', '#CC3333', '#CC3366',
  '#CC3399', '#CC33CC', '#CC33FF', '#CC6600', '#CC6633', '#CC9900', '#CC9933',
  '#CCCC00', '#CCCC33', '#FF0000', '#FF0033', '#FF0066', '#FF0099', '#FF00CC',
  '#FF00FF', '#FF3300', '#FF3333', '#FF3366', '#FF3399', '#FF33CC', '#FF33FF',
  '#FF6600', '#FF6633', '#FF9900', '#FF9933', '#FFCC00', '#FFCC33'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // NB: In an Electron preload script, document will be defined but not fully
  // initialized. Since we know we're in Chrome, we'll just detect this case
  // explicitly
  if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
    return true;
  }

  // Internet Explorer and Edge do not support colors.
  if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
    return false;
  }

  // is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
  return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
    // double check webkit in userAgent just in case we are in a worker
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  try {
    return JSON.stringify(v);
  } catch (err) {
    return '[UnexpectedJSONParseError]: ' + err.message;
  }
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return;

  var c = 'color: ' + this.color;
  args.splice(1, 0, c, 'color: inherit')

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-zA-Z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}

  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
  if (!r && typeof process !== 'undefined' && 'env' in process) {
    r = process.env.DEBUG;
  }

  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
  try {
    return window.localStorage;
  } catch (e) {}
}

/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(6)))

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.decodeBrowserWrapper = decodeBrowserWrapper;
exports.decodeMessage = decodeMessage;
exports.createSubscribeRequest = createSubscribeRequest;
exports.isByeMessage = isByeMessage;
var CONTENT_TYPE_JSON = 27;
var FIELDS_BY_PROTOCOL_VERSION = {
    '28': ['version', 'streamId', 'streamPartition', 'timestamp', 'ttl', 'offset', 'previousOffset', 'contentType', 'content']
};
var MESSAGE_TYPES = ['b', 'u', 'subscribed', 'unsubscribed', 'resending', 'resent', 'no_resend'];
var BYE_KEY = '_bye';

function decodeBrowserWrapper(rawMsg) {
    var jsonMsg = JSON.parse(rawMsg);
    var version = jsonMsg[0];
    if (version !== 0) {
        throw 'Unknown message version: ' + version;
    }

    return {
        type: MESSAGE_TYPES[jsonMsg[1]],
        subId: jsonMsg[2],
        msg: jsonMsg[3]
    };
}

function decodeMessage(type, message) {
    if (type === 'b' || type === 'u') {
        if (FIELDS_BY_PROTOCOL_VERSION[message[0]] === undefined) {
            throw 'Unsupported version: ' + message[0];
        }
        var result = {};
        var fields = FIELDS_BY_PROTOCOL_VERSION[message[0]];

        for (var i = 0; i < message.length; i++) {

            // Parse content if necessary
            if (fields[i] === 'content') {
                if (result.contentType === CONTENT_TYPE_JSON) {
                    message[i] = JSON.parse(message[i]);
                } else {
                    throw 'Unknown content type: ' + result.contentType;
                }
            }

            result[fields[i]] = message[i];
        }
        return result;
    } else {
        return message;
    }
}

function createSubscribeRequest(stream, resendOptions) {
    var req = {
        stream: stream
    };
    Object.keys(resendOptions).forEach(function (key) {
        req[key] = resendOptions[key];
    });
    return req;
}

function isByeMessage(message) {
    return !!message[BYE_KEY];
}

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var WebSocket = typeof window !== 'undefined' ? window.WebSocket : __webpack_require__(3);
module.exports = WebSocket;

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _StreamrClient = __webpack_require__(5);

var _StreamrClient2 = _interopRequireDefault(_StreamrClient);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//import Subscription from './Subscription'
//import Connection from './Connection'
//import * as Protocol from './Protocol'

exports.default = _StreamrClient2.default;
module.exports = exports['default'];

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _eventemitter = __webpack_require__(0);

var _eventemitter2 = _interopRequireDefault(_eventemitter);

var _debug = __webpack_require__(1);

var _debug2 = _interopRequireDefault(_debug);

var _Subscription = __webpack_require__(9);

var _Subscription2 = _interopRequireDefault(_Subscription);

var _Connection = __webpack_require__(10);

var _Connection2 = _interopRequireDefault(_Connection);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var StreamrClient = function (_EventEmitter) {
    _inherits(StreamrClient, _EventEmitter);

    function StreamrClient(options) {
        _classCallCheck(this, StreamrClient);

        // Default options
        var _this = _possibleConstructorReturn(this, (StreamrClient.__proto__ || Object.getPrototypeOf(StreamrClient)).call(this));

        _this.options = {
            // The server to connect to
            url: 'wss://www.streamr.com/api/v1/ws',
            // Automatically connect on first subscribe
            autoConnect: true,
            // Automatically disconnect on last unsubscribe
            autoDisconnect: true,
            authKey: null
        };
        _this.subsByStream = {};
        _this.subById = {};

        _this.connection = null;
        _this.connected = false;

        Object.assign(_this.options, options || {});
        return _this;
    }

    _createClass(StreamrClient, [{
        key: '_addSubscription',
        value: function _addSubscription(sub) {
            this.subById[sub.id] = sub;

            if (!this.subsByStream[sub.streamId]) {
                this.subsByStream[sub.streamId] = [sub];
            } else {
                this.subsByStream[sub.streamId].push(sub);
            }
        }
    }, {
        key: '_removeSubscription',
        value: function _removeSubscription(sub) {
            delete this.subById[sub.id];

            if (this.subsByStream[sub.streamId]) {
                this.subsByStream[sub.streamId] = this.subsByStream[sub.streamId].filter(function (it) {
                    return it !== sub;
                });

                if (this.subsByStream[sub.streamId].length === 0) {
                    delete this.subsByStream[sub.streamId];
                }
            }
        }
    }, {
        key: 'getSubscriptions',
        value: function getSubscriptions(streamId) {
            return this.subsByStream[streamId] || [];
        }
    }, {
        key: 'subscribe',
        value: function subscribe(options, callback, legacyOptions) {
            var _this2 = this;

            if (!options) {
                throw 'subscribe: Invalid arguments: subscription options is required!';
            } else if (!callback) {
                throw 'subscribe: Invalid arguments: callback is required!';
            }

            // Backwards compatibility for giving a streamId as first argument
            if (typeof options === 'string') {
                options = {
                    stream: options
                };
            } else if ((typeof options === 'undefined' ? 'undefined' : _typeof(options)) !== 'object') {
                throw 'subscribe: options must be an object';
            }

            // Backwards compatibility for giving an options object as third argument
            Object.assign(options, legacyOptions);

            if (!options.stream) {
                throw 'subscribe: Invalid arguments: options.stream is not given';
            }

            // Create the Subscription object and bind handlers
            var sub = new _Subscription2.default(options.stream, options.partition || 0, options.authKey || this.options.authKey, callback, options);
            sub.on('gap', function (from, to) {
                _this2._requestResend(sub, {
                    resend_from: from, resend_to: to
                });
            });
            sub.on('done', function () {
                (0, _debug2.default)('done event for sub %d', sub.id);
                _this2.unsubscribe(sub);
            });

            // Add to lookups
            this._addSubscription(sub);

            // If connected, emit a subscribe request
            if (this.connected) {
                this._resendAndSubscribe(sub);
            } else if (this.options.autoConnect) {
                this.connect();
            }

            return sub;
        }
    }, {
        key: 'unsubscribe',
        value: function unsubscribe(sub) {
            if (!sub || !sub.streamId) {
                throw 'unsubscribe: please give a Subscription object as an argument!';
            }

            // If this is the last subscription for this stream, unsubscribe the client too
            if (this.subsByStream[sub.streamId] !== undefined && this.subsByStream[sub.streamId].length === 1 && this.connected && !this.disconnecting && sub.isSubscribed() && !sub.unsubscribing) {
                sub.unsubscribing = true;
                this._requestUnsubscribe(sub.streamId);
            } else if (!sub.unsubscribing) {
                // Else the sub can be cleaned off immediately
                this._removeSubscription(sub);
                sub.emit('unsubscribed');
                this._checkAutoDisconnect();
            }
        }
    }, {
        key: 'unsubscribeAll',
        value: function unsubscribeAll(streamId) {
            var _this3 = this;

            if (!streamId) {
                throw 'unsubscribeAll: a stream id is required!';
            } else if (typeof streamId !== 'string') {
                throw 'unsubscribe: stream id must be a string!';
            }

            if (this.subsByStream[streamId]) {
                // Copy the list to avoid concurrent modifications
                var l = this.subsByStream[streamId].slice();
                l.forEach(function (sub) {
                    _this3.unsubscribe(sub);
                });
            }
        }
    }, {
        key: 'isConnected',
        value: function isConnected() {
            return this.connected;
        }
    }, {
        key: 'reconnect',
        value: function reconnect() {
            return this.connect(true);
        }
    }, {
        key: 'connect',
        value: function connect() {
            var _this4 = this;

            if (this.connected) {
                (0, _debug2.default)('connect() called while already connected, doing nothing...');
                return;
            } else if (this.connecting) {
                (0, _debug2.default)('connect() called while connecting, doing nothing...');
                return;
            }

            (0, _debug2.default)('Connecting to %s', this.options.url);
            this.connecting = true;
            this.disconnecting = false;

            this.connection = new _Connection2.default(this.options);

            // Broadcast messages to all subs listening on stream
            this.connection.on('b', function (msg) {
                // Notify the Subscriptions for this stream. If this is not the message each individual Subscription
                // is expecting, they will either ignore it or request resend via gap event.
                var streamId = msg.streamId;
                var subs = _this4.subsByStream[streamId];
                if (subs) {
                    for (var i = 0; i < subs.length; i++) {
                        subs[i].handleMessage(msg, false);
                    }
                } else {
                    (0, _debug2.default)('WARN: message received for stream with no subscriptions: %s', streamId);
                }
            });

            // Unicast messages to a specific subscription only
            this.connection.on('u', function (msg, sub) {
                if (sub !== undefined && _this4.subById[sub] !== undefined) {
                    _this4.subById[sub].handleMessage(msg, true);
                } else {
                    (0, _debug2.default)('WARN: subscription not found for stream: %s, sub: %s', msg.streamId, sub);
                }
            });

            this.connection.on('subscribed', function (response) {
                if (response.error) {
                    _this4.handleError('Error subscribing to ' + response.stream + ': ' + response.error);
                } else {
                    var subs = _this4.subsByStream[response.stream];
                    delete subs._subscribing;

                    (0, _debug2.default)('Client subscribed: %o', response);

                    // Report subscribed to all non-resending Subscriptions for this stream
                    subs.filter(function (sub) {
                        return !sub.resending;
                    }).forEach(function (sub) {
                        sub.emit('subscribed');
                    });
                }
            });

            this.connection.on('unsubscribed', function (response) {
                (0, _debug2.default)('Client unsubscribed: %o', response);

                if (_this4.subsByStream[response.stream]) {
                    // Copy the list to avoid concurrent modifications
                    var l = _this4.subsByStream[response.stream].slice();
                    l.forEach(function (sub) {
                        _this4._removeSubscription(sub);
                        sub.emit('unsubscribed');
                    });
                }

                _this4._checkAutoDisconnect();
            });

            // Route resending state messages to corresponding Subscriptions
            this.connection.on('resending', function (response) {
                if (_this4.subById[response.sub]) {
                    _this4.subById[response.sub].emit('resending', response);
                } else {
                    (0, _debug2.default)('resent: Subscription %d is gone already', response.sub);
                }
            });

            this.connection.on('no_resend', function (response) {
                if (_this4.subById[response.sub]) {
                    _this4.subById[response.sub].emit('no_resend', response);
                } else {
                    (0, _debug2.default)('resent: Subscription %d is gone already', response.sub);
                }
            });

            this.connection.on('resent', function (response) {
                if (_this4.subById[response.sub]) {
                    _this4.subById[response.sub].emit('resent', response);
                } else {
                    (0, _debug2.default)('resent: Subscription %d is gone already', response.sub);
                }
            });

            // On connect/reconnect, send pending subscription requests
            this.connection.on('connected', function () {
                (0, _debug2.default)('Connected!');
                _this4.connected = true;
                _this4.connecting = false;
                _this4.disconnecting = false;
                _this4.emit('connected');

                Object.keys(_this4.subsByStream).forEach(function (streamId) {
                    var subs = _this4.subsByStream[streamId];
                    subs.forEach(function (sub) {
                        if (!sub.isSubscribed()) {
                            _this4._resendAndSubscribe(sub);
                        }
                    });
                });
            });

            this.connection.on('disconnected', function () {
                (0, _debug2.default)('Disconnected.');
                _this4.connected = false;
                _this4.connecting = false;
                _this4.disconnecting = false;
                _this4.emit('disconnected');

                Object.keys(_this4.subsByStream).forEach(function (streamId) {
                    var subs = _this4.subsByStream[streamId];
                    delete subs._subscribing;
                    subs.forEach(function (sub) {
                        sub.emit('disconnected');
                    });
                });
            });

            this.connection.connect(); // TODO: i did not find this anywhere else?
            return this.subsByStream;
        }
    }, {
        key: 'pause',
        value: function pause() {
            this.connection.disconnect();
        }
    }, {
        key: 'disconnect',
        value: function disconnect() {
            var _this5 = this;

            this.connecting = false;
            this.disconnecting = true;

            Object.keys(this.subsByStream).forEach(function (streamId) {
                _this5.unsubscribeAll(streamId);
            });

            this.connection.disconnect();
        }
    }, {
        key: '_checkAutoDisconnect',
        value: function _checkAutoDisconnect() {
            // Disconnect if no longer subscribed to any streams
            if (this.options.autoDisconnect && Object.keys(this.subsByStream).length === 0) {
                (0, _debug2.default)('Disconnecting due to no longer being subscribed to any streams');
                this.disconnect();
            }
        }
    }, {
        key: '_resendAndSubscribe',
        value: function _resendAndSubscribe(sub) {
            var _this6 = this;

            if (!sub.subscribing && !sub.resending) {
                sub.subscribing = true;
                this._requestSubscribe(sub);

                // Once subscribed, ask for a resend
                sub.once('subscribed', function () {
                    if (sub.hasResendOptions()) {
                        _this6._requestResend(sub);
                    }
                });
            }
        }
    }, {
        key: '_requestSubscribe',
        value: function _requestSubscribe(sub) {
            var subs = this.subsByStream[sub.streamId];

            var subscribedSubs = subs.filter(function (it) {
                return it.isSubscribed();
            });

            // If this is the first subscription for this stream, send a subscription request to the server
            if (!subs._subscribing && subscribedSubs.length === 0) {
                var req = Object.assign({}, sub.options, {
                    type: 'subscribe', stream: sub.streamId, authKey: sub.authKey
                });
                (0, _debug2.default)('_requestSubscribe: subscribing client: %o', req);
                subs._subscribing = true;
                this.connection.send(req);
            } else if (subscribedSubs.length > 0) {
                // If there already is a subscribed subscription for this stream, this new one will just join it immediately
                (0, _debug2.default)('_requestSubscribe: another subscription for same stream: %s, insta-subscribing', sub.streamId);

                setTimeout(function () {
                    sub.emit('subscribed');
                }, 0);
            }
        }
    }, {
        key: '_requestUnsubscribe',
        value: function _requestUnsubscribe(streamId) {
            (0, _debug2.default)('Client unsubscribing stream %o', streamId);
            this.connection.send({
                type: 'unsubscribe',
                stream: streamId
            });
        }
    }, {
        key: '_requestResend',
        value: function _requestResend(sub, resendOptions) {
            // If overriding resendOptions are given, need to remove resend options in sub.options
            var options = Object.assign({}, sub.getEffectiveResendOptions());
            if (resendOptions) {
                Object.keys(options).forEach(function (key) {
                    if (key.match(/resend_.*/)) {
                        delete options[key];
                    }
                });
            }

            sub.resending = true;

            var request = Object.assign({}, options, resendOptions, {
                type: 'resend', stream: sub.streamId, partition: sub.streamPartition, authKey: sub.authKey, sub: sub.id
            });
            (0, _debug2.default)('_requestResend: %o', request);
            this.connection.send(request);
        }
    }, {
        key: 'handleError',
        value: function handleError(msg) {
            (0, _debug2.default)(msg);
            this.emit('error', msg);
        }
    }]);

    return StreamrClient;
}(_eventemitter2.default);

exports.default = StreamrClient;
module.exports = exports['default'];

/***/ }),
/* 6 */
/***/ (function(module, exports) {

// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };


/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {


/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = __webpack_require__(8);

/**
 * Active `debug` instances.
 */
exports.instances = [];

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
 */

exports.formatters = {};

/**
 * Select a color.
 * @param {String} namespace
 * @return {Number}
 * @api private
 */

function selectColor(namespace) {
  var hash = 0, i;

  for (i in namespace) {
    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  return exports.colors[Math.abs(hash) % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function createDebug(namespace) {

  var prevTime;

  function debug() {
    // disabled?
    if (!debug.enabled) return;

    var self = debug;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // turn the `arguments` into a proper Array
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %O
      args.unshift('%O');
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    // apply env-specific formatting (colors, etc.)
    exports.formatArgs.call(self, args);

    var logFn = debug.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }

  debug.namespace = namespace;
  debug.enabled = exports.enabled(namespace);
  debug.useColors = exports.useColors();
  debug.color = selectColor(namespace);
  debug.destroy = destroy;

  // env-specific initialization logic for debug instances
  if ('function' === typeof exports.init) {
    exports.init(debug);
  }

  exports.instances.push(debug);

  return debug;
}

function destroy () {
  var index = exports.instances.indexOf(this);
  if (index !== -1) {
    exports.instances.splice(index, 1);
    return true;
  } else {
    return false;
  }
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  exports.names = [];
  exports.skips = [];

  var i;
  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
  var len = split.length;

  for (i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }

  for (i = 0; i < exports.instances.length; i++) {
    var instance = exports.instances[i];
    instance.enabled = exports.enabled(instance.namespace);
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  if (name[name.length - 1] === '*') {
    return true;
  }
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}


/***/ }),
/* 8 */
/***/ (function(module, exports) {

/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  if (ms >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (ms >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return;
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name;
  }
  return Math.ceil(ms / n) + ' ' + name + 's';
}


/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _eventemitter = __webpack_require__(0);

var _eventemitter2 = _interopRequireDefault(_eventemitter);

var _debug = __webpack_require__(1);

var _debug2 = _interopRequireDefault(_debug);

var _Protocol = __webpack_require__(2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var subId = 0;
function generateSubscriptionId() {
    var id = subId++;
    return id.toString();
}

var Subscription = function (_EventEmitter) {
    _inherits(Subscription, _EventEmitter);

    function Subscription(streamId, streamPartition, authKey, callback, options) {
        _classCallCheck(this, Subscription);

        var _this = _possibleConstructorReturn(this, (Subscription.__proto__ || Object.getPrototypeOf(Subscription)).call(this));

        if (!streamId) {
            throw 'No stream id given!';
        }
        if (!callback) {
            throw 'No callback given!';
        }

        _this.id = generateSubscriptionId();
        _this.streamId = streamId;
        _this.streamPartition = streamPartition;
        _this.authKey = authKey;
        _this.callback = callback;
        _this.options = options || {};
        _this.queue = [];
        _this.subscribing = false;
        _this.subscribed = false;
        _this.lastReceivedOffset = null;

        // Check that multiple resend options are not given
        var resendOptionCount = 0;
        if (_this.options.resend_all) {
            resendOptionCount++;
        }
        if (_this.options.resend_from != null) {
            resendOptionCount++;
        }
        if (_this.options.resend_last != null) {
            resendOptionCount++;
        }
        if (_this.options.resend_from_time != null) {
            resendOptionCount++;
        }
        if (resendOptionCount > 1) {
            throw 'Multiple resend options active! Please use only one: ' + JSON.stringify(options);
        }

        // Automatically convert Date objects to numbers for resend_from_time
        if (_this.options.resend_from_time != null && typeof _this.options.resend_from_time !== 'number') {

            if (typeof _this.options.resend_from_time.getTime === 'function') {
                _this.options.resend_from_time = _this.options.resend_from_time.getTime();
            } else {
                throw 'resend_from_time option must be a Date object or a number representing time!';
            }
        }

        /*** Message handlers ***/

        _this.on('subscribed', function () {
            (0, _debug2.default)('Sub %s subscribed to stream: %s', _this.id, _this.streamId);
            _this.subscribed = true;
            _this.subscribing = false;
        });

        _this.on('unsubscribed', function () {
            (0, _debug2.default)('Sub %s unsubscribed: %s', _this.id, _this.streamId);
            _this.subscribed = false;
            _this.subscribing = false;
            _this.unsubscribing = false;
            _this.resending = false;
        });

        _this.on('resending', function (response) {
            (0, _debug2.default)('Sub %s resending: %o', _this.id, response);
            // this.resending = true was set elsewhere before making the request
        });

        _this.on('no_resend', function (response) {
            (0, _debug2.default)('Sub %s no_resend: %o', _this.id, response);
            _this.resending = false;
            _this.checkQueue();
        });

        _this.on('resent', function (response) {
            (0, _debug2.default)('Sub %s resent: %o', _this.id, response);
            _this.resending = false;
            _this.checkQueue();
        });

        _this.on('connected', function () {});

        _this.on('disconnected', function () {
            _this.subscribed = false;
            _this.subscribing = false;
            _this.resending = false;
        });
        return _this;
    }

    _createClass(Subscription, [{
        key: 'handleMessage',
        value: function handleMessage(msg, isResend) {
            var content = msg.content;
            var offset = msg.offset;
            var previousOffset = msg.previousOffset;

            if (previousOffset == null) {
                (0, _debug2.default)('handleMessage: prevOffset is null, gap detection is impossible! message: %o', msg);
            }

            // TODO: check this.options.resend_last ?
            // If resending, queue broadcasted messages
            if (this.resending && !isResend) {
                this.queue.push(msg);
            } else {
                // Gap check
                if (previousOffset != null && // previousOffset is required to check for gaps
                this.lastReceivedOffset != null && // and we need to know what msg was the previous one
                previousOffset > this.lastReceivedOffset && // previous message had larger offset than our previous msg => gap!
                !this.resending) {

                    // Queue the message to be processed after resend
                    this.queue.push(msg);

                    var from = this.lastReceivedOffset + 1;
                    var to = previousOffset;
                    (0, _debug2.default)('Gap detected, requesting resend for stream %s from %d to %d', this.streamId, from, to);
                    this.emit('gap', from, to);
                } else if (this.lastReceivedOffset != null && offset <= this.lastReceivedOffset) {
                    // Prevent double-processing of messages for any reason
                    (0, _debug2.default)('Sub %s already received message: %d, lastReceivedOffset: %d. Ignoring message.', this.id, offset, this.lastReceivedOffset);
                } else {
                    // Normal case where prevOffset == null || lastReceivedOffset == null || prevOffset === lastReceivedOffset
                    this.lastReceivedOffset = offset;
                    this.callback(content, msg);
                    if ((0, _Protocol.isByeMessage)(content)) {
                        this.emit('done');
                    }
                }
            }
        }
    }, {
        key: 'checkQueue',
        value: function checkQueue() {
            if (this.queue.length) {
                (0, _debug2.default)('Attempting to process %d queued messages for stream %s', this.queue.length, this.streamId);

                var i = void 0;
                var length = this.queue.length;

                var originalQueue = this.queue;
                this.queue = [];

                for (i = 0; i < length; i++) {
                    var msg = originalQueue[i];
                    this.handleMessage(msg, false);
                }
            }
        }
    }, {
        key: 'hasResendOptions',
        value: function hasResendOptions() {
            return this.options.resend_all === true || this.options.resend_from >= 0 || this.options.resend_from_time >= 0 || this.options.resend_last > 0;
        }

        /**
         * Resend needs can change if messages have already been received.
         * This function always returns the effective resend options:
         *
         * If messages have been received:
         * - resend_all becomes resend_from
         * - resend_from becomes resend_from the latest received message
         * - resend_from_time becomes resend_from the latest received message
         * - resend_last stays the same
         */

    }, {
        key: 'getEffectiveResendOptions',
        value: function getEffectiveResendOptions() {
            if (this.hasReceivedMessages() && this.hasResendOptions()) {
                if (this.options.resend_all || this.options.resend_from || this.options.resend_from_time) {
                    return {
                        resend_from: this.lastReceivedOffset + 1
                    };
                } else if (this.options.resend_last) {
                    return this.options;
                }
            } else {
                return this.options;
            }
        }
    }, {
        key: 'hasReceivedMessages',
        value: function hasReceivedMessages() {
            return this.lastReceivedOffset != null;
        }
    }, {
        key: 'isSubscribed',
        value: function isSubscribed() {
            return this.subscribed;
        }
    }]);

    return Subscription;
}(_eventemitter2.default);

exports.default = Subscription;
module.exports = exports['default'];

/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _eventemitter = __webpack_require__(0);

var _eventemitter2 = _interopRequireDefault(_eventemitter);

var _debug = __webpack_require__(1);

var _debug2 = _interopRequireDefault(_debug);

var _ws = __webpack_require__(3);

var _ws2 = _interopRequireDefault(_ws);

var _Protocol = __webpack_require__(2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Connection = function (_EventEmitter) {
    _inherits(Connection, _EventEmitter);

    function Connection(options) {
        _classCallCheck(this, Connection);

        var _this = _possibleConstructorReturn(this, (Connection.__proto__ || Object.getPrototypeOf(Connection)).call(this));

        if (!options.url) {
            throw 'URL is not defined!';
        }
        _this.options = options;
        _this.connected = false;
        _this.connecting = false;
        _this.disconnecting = false;

        if (options.autoConnect) {
            _this.connect();
        }
        return _this;
    }

    _createClass(Connection, [{
        key: 'connect',
        value: function connect() {
            var _this2 = this;

            if (!(this.connected || this.connecting)) {
                this.connecting = true;

                this.socket = new _ws2.default(this.options.url);
                this.socket.binaryType = 'arraybuffer';
                this.emit('connecting');

                this.socket.onopen = function () {
                    (0, _debug2.default)('Connected to ', _this2.options.url);
                    _this2.connected = true;
                    _this2.connecting = false;
                    _this2.emit('connected');
                };

                this.socket.onclose = function () {
                    if (!_this2.disconnecting) {
                        (0, _debug2.default)('Connection lost. Attempting to reconnect');
                        setTimeout(function () {
                            _this2.connect();
                        }, 2000);
                    } else {
                        _this2.disconnecting = false;
                    }

                    _this2.connected = false;
                    _this2.connecting = false;
                    _this2.emit('disconnected');
                };

                this.socket.onmessage = function (messageEvent) {
                    var decoded = (0, _Protocol.decodeBrowserWrapper)(messageEvent.data);
                    _this2.emit(decoded.type, (0, _Protocol.decodeMessage)(decoded.type, decoded.msg), decoded.subId);
                };
            }
        }
    }, {
        key: 'disconnect',
        value: function disconnect() {
            if (this.socket !== undefined && (this.connected || this.connecting)) {
                this.disconnecting = true;
                this.socket.close();
            }
        }
    }, {
        key: 'send',
        value: function send(req) {
            this.socket.send(JSON.stringify(req));
        }
    }]);

    return Connection;
}(_eventemitter2.default);

exports.default = Connection;
module.exports = exports['default'];

/***/ })
/******/ ]);
});
//# sourceMappingURL=streamr-client.js.map