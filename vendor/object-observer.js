/* Blob.js
 * A Blob, File, FileReader & URL implementation.
 * 2019-04-30
 *
 * By Eli Grey, http://eligrey.com
 * By Jimmy Wärting, https://github.com/jimmywarting
 * License: MIT
 *   See https://github.com/eligrey/Blob.js/blob/master/LICENSE.md
 */

(function(global) {
	(function (factory) {
		if (typeof define === "function" && define.amd) {
			// AMD. Register as an anonymous module.
			define(["exports"], factory);
		} else if (typeof exports === "object" && typeof exports.nodeName !== "string") {
			// CommonJS
			factory(exports);
		} else {
			// Browser globals
			factory(global);
		}
	})(function (exports) {
		"use strict";

		var BlobBuilder = global.BlobBuilder
			|| global.WebKitBlobBuilder
			|| global.MSBlobBuilder
			|| global.MozBlobBuilder;

		var URL = global.URL || global.webkitURL || function (href, a) {
			a = document.createElement("a");
			a.href = href;
			return a;
		};

		var origBlob = global.Blob;
		var createObjectURL = URL.createObjectURL;
		var revokeObjectURL = URL.revokeObjectURL;
		var strTag = global.Symbol && global.Symbol.toStringTag;
		var blobSupported = false;
		var blobSupportsArrayBufferView = false;
		var arrayBufferSupported = !!global.ArrayBuffer;
		var blobBuilderSupported = BlobBuilder
			&& BlobBuilder.prototype.append
			&& BlobBuilder.prototype.getBlob;

		try {
			// Check if Blob constructor is supported
			blobSupported = new Blob(["ä"]).size === 2;

			// Check if Blob constructor supports ArrayBufferViews
			// Fails in Safari 6, so we need to map to ArrayBuffers there.
			blobSupportsArrayBufferView = new Blob([new Uint8Array([1, 2])]).size === 2;
		} catch (e) {/**/}


		// Helper function that maps ArrayBufferViews to ArrayBuffers
		// Used by BlobBuilder constructor and old browsers that didn't
		// support it in the Blob constructor.
		function mapArrayBufferViews (ary) {
			return ary.map(function (chunk) {
				if (chunk.buffer instanceof ArrayBuffer) {
					var buf = chunk.buffer;

					// if this is a subarray, make a copy so we only
					// include the subarray region from the underlying buffer
					if (chunk.byteLength !== buf.byteLength) {
						var copy = new Uint8Array(chunk.byteLength);
						copy.set(new Uint8Array(buf, chunk.byteOffset, chunk.byteLength));
						buf = copy.buffer;
					}

					return buf;
				}

				return chunk;
			});
		}

		function BlobBuilderConstructor (ary, options) {
			options = options || {};

			var bb = new BlobBuilder();
			mapArrayBufferViews(ary).forEach(function (part) {
				bb.append(part);
			});

			return options.type ? bb.getBlob(options.type) : bb.getBlob();
		}

		function BlobConstructor (ary, options) {
			return new origBlob(mapArrayBufferViews(ary), options || {});
		}

		if (global.Blob) {
			BlobBuilderConstructor.prototype = Blob.prototype;
			BlobConstructor.prototype = Blob.prototype;
		}

		/********************************************************/
		/*               String Encoder fallback                */
		/********************************************************/
		function stringEncode (string) {
			var pos = 0;
			var len = string.length;
			var Arr = global.Uint8Array || Array; // Use byte array when possible

			var at = 0; // output position
			var tlen = Math.max(32, len + (len >> 1) + 7); // 1.5x size
			var target = new Arr((tlen >> 3) << 3); // ... but at 8 byte offset

			while (pos < len) {
				var value = string.charCodeAt(pos++);
				if (value >= 0xd800 && value <= 0xdbff) {
					// high surrogate
					if (pos < len) {
						var extra = string.charCodeAt(pos);
						if ((extra & 0xfc00) === 0xdc00) {
							++pos;
							value = ((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000;
						}
					}
					if (value >= 0xd800 && value <= 0xdbff) {
						continue; // drop lone surrogate
					}
				}

				// expand the buffer if we couldn't write 4 bytes
				if (at + 4 > target.length) {
					tlen += 8; // minimum extra
					tlen *= (1.0 + (pos / string.length) * 2); // take 2x the remaining
					tlen = (tlen >> 3) << 3; // 8 byte offset

					var update = new Uint8Array(tlen);
					update.set(target);
					target = update;
				}

				if ((value & 0xffffff80) === 0) { // 1-byte
					target[at++] = value; // ASCII
					continue;
				} else if ((value & 0xfffff800) === 0) { // 2-byte
					target[at++] = ((value >> 6) & 0x1f) | 0xc0;
				} else if ((value & 0xffff0000) === 0) { // 3-byte
					target[at++] = ((value >> 12) & 0x0f) | 0xe0;
					target[at++] = ((value >> 6) & 0x3f) | 0x80;
				} else if ((value & 0xffe00000) === 0) { // 4-byte
					target[at++] = ((value >> 18) & 0x07) | 0xf0;
					target[at++] = ((value >> 12) & 0x3f) | 0x80;
					target[at++] = ((value >> 6) & 0x3f) | 0x80;
				} else {
					// FIXME: do we care
					continue;
				}

				target[at++] = (value & 0x3f) | 0x80;
			}

			return target.slice(0, at);
		}

		/********************************************************/
		/*               String Decoder fallback                */
		/********************************************************/
		function stringDecode (buf) {
			var end = buf.length;
			var res = [];

			var i = 0;
			while (i < end) {
				var firstByte = buf[i];
				var codePoint = null;
				var bytesPerSequence = (firstByte > 0xEF) ? 4
					: (firstByte > 0xDF) ? 3
						: (firstByte > 0xBF) ? 2
							: 1;

				if (i + bytesPerSequence <= end) {
					var secondByte, thirdByte, fourthByte, tempCodePoint;

					switch (bytesPerSequence) {
					case 1:
						if (firstByte < 0x80) {
							codePoint = firstByte;
						}
						break;
					case 2:
						secondByte = buf[i + 1];
						if ((secondByte & 0xC0) === 0x80) {
							tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
							if (tempCodePoint > 0x7F) {
								codePoint = tempCodePoint;
							}
						}
						break;
					case 3:
						secondByte = buf[i + 1];
						thirdByte = buf[i + 2];
						if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
							tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
							if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
								codePoint = tempCodePoint;
							}
						}
						break;
					case 4:
						secondByte = buf[i + 1];
						thirdByte = buf[i + 2];
						fourthByte = buf[i + 3];
						if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
							tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
							if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
								codePoint = tempCodePoint;
							}
						}
					}
				}

				if (codePoint === null) {
					// we did not generate a valid codePoint so insert a
					// replacement char (U+FFFD) and advance only 1 byte
					codePoint = 0xFFFD;
					bytesPerSequence = 1;
				} else if (codePoint > 0xFFFF) {
					// encode to utf16 (surrogate pair dance)
					codePoint -= 0x10000;
					res.push(codePoint >>> 10 & 0x3FF | 0xD800);
					codePoint = 0xDC00 | codePoint & 0x3FF;
				}

				res.push(codePoint);
				i += bytesPerSequence;
			}

			var len = res.length;
			var str = "";
			var j = 0;

			while (j < len) {
				str += String.fromCharCode.apply(String, res.slice(j, j += 0x1000));
			}

			return str;
		}

		// string -> buffer
		var textEncode = typeof TextEncoder === "function"
			? TextEncoder.prototype.encode.bind(new TextEncoder())
			: stringEncode;

		// buffer -> string
		var textDecode = typeof TextDecoder === "function"
			? TextDecoder.prototype.decode.bind(new TextDecoder())
			: stringDecode;

		function FakeBlobBuilder () {
			function isDataView (obj) {
				return obj && DataView.prototype.isPrototypeOf(obj);
			}
			function bufferClone (buf) {
				var view = new Array(buf.byteLength);
				var array = new Uint8Array(buf);
				var i = view.length;
				while (i--) {
					view[i] = array[i];
				}
				return view;
			}
			function array2base64 (input) {
				var byteToCharMap = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

				var output = [];

				for (var i = 0; i < input.length; i += 3) {
					var byte1 = input[i];
					var haveByte2 = i + 1 < input.length;
					var byte2 = haveByte2 ? input[i + 1] : 0;
					var haveByte3 = i + 2 < input.length;
					var byte3 = haveByte3 ? input[i + 2] : 0;

					var outByte1 = byte1 >> 2;
					var outByte2 = ((byte1 & 0x03) << 4) | (byte2 >> 4);
					var outByte3 = ((byte2 & 0x0F) << 2) | (byte3 >> 6);
					var outByte4 = byte3 & 0x3F;

					if (!haveByte3) {
						outByte4 = 64;

						if (!haveByte2) {
							outByte3 = 64;
						}
					}

					output.push(
						byteToCharMap[outByte1], byteToCharMap[outByte2],
						byteToCharMap[outByte3], byteToCharMap[outByte4]
					);
				}

				return output.join("");
			}

			var create = Object.create || function (a) {
				function c () {}
				c.prototype = a;
				return new c();
			};

			if (arrayBufferSupported) {
				var viewClasses = [
					"[object Int8Array]",
					"[object Uint8Array]",
					"[object Uint8ClampedArray]",
					"[object Int16Array]",
					"[object Uint16Array]",
					"[object Int32Array]",
					"[object Uint32Array]",
					"[object Float32Array]",
					"[object Float64Array]"
				];

				var isArrayBufferView = ArrayBuffer.isView || function (obj) {
					return obj && viewClasses.indexOf(Object.prototype.toString.call(obj)) > -1;
				};
			}

			function concatTypedarrays (chunks) {
				var size = 0;
				var j = chunks.length;
				while (j--) { size += chunks[j].length; }
				var b = new Uint8Array(size);
				var offset = 0;
				for (var i = 0; i < chunks.length; i++) {
					var chunk = chunks[i];
					b.set(chunk, offset);
					offset += chunk.byteLength || chunk.length;
				}

				return b;
			}

			/********************************************************/
			/*                   Blob constructor                   */
			/********************************************************/
			function Blob (chunks, opts) {
				chunks = chunks || [];
				opts = opts == null ? {} : opts;
				for (var i = 0, len = chunks.length; i < len; i++) {
					var chunk = chunks[i];
					if (chunk instanceof Blob) {
						chunks[i] = chunk._buffer;
					} else if (typeof chunk === "string") {
						chunks[i] = textEncode(chunk);
					} else if (arrayBufferSupported && (ArrayBuffer.prototype.isPrototypeOf(chunk) || isArrayBufferView(chunk))) {
						chunks[i] = bufferClone(chunk);
					} else if (arrayBufferSupported && isDataView(chunk)) {
						chunks[i] = bufferClone(chunk.buffer);
					} else {
						chunks[i] = textEncode(String(chunk));
					}
				}

				this._buffer = global.Uint8Array
					? concatTypedarrays(chunks)
					: [].concat.apply([], chunks);
				this.size = this._buffer.length;

				this.type = opts.type || "";
				if (/[^\u0020-\u007E]/.test(this.type)) {
					this.type = "";
				} else {
					this.type = this.type.toLowerCase();
				}
			}

			Blob.prototype.arrayBuffer = function () {
				return Promise.resolve(this._buffer);
			};

			Blob.prototype.text = function () {
				return Promise.resolve(textDecode(this._buffer));
			};

			Blob.prototype.slice = function (start, end, type) {
				var slice = this._buffer.slice(start || 0, end || this._buffer.length);
				return new Blob([slice], {type: type});
			};

			Blob.prototype.toString = function () {
				return "[object Blob]";
			};

			/********************************************************/
			/*                   File constructor                   */
			/********************************************************/
			function File (chunks, name, opts) {
				opts = opts || {};
				var a = Blob.call(this, chunks, opts) || this;
				a.name = name.replace(/\//g, ":");
				a.lastModifiedDate = opts.lastModified ? new Date(opts.lastModified) : new Date();
				a.lastModified = +a.lastModifiedDate;

				return a;
			}

			File.prototype = create(Blob.prototype);
			File.prototype.constructor = File;

			if (Object.setPrototypeOf) {
				Object.setPrototypeOf(File, Blob);
			} else {
				try {
					File.__proto__ = Blob;
				} catch (e) {/**/}
			}

			File.prototype.toString = function () {
				return "[object File]";
			};

			/********************************************************/
			/*                FileReader constructor                */
			/********************************************************/
			function FileReader () {
				if (!(this instanceof FileReader)) {
					throw new TypeError("Failed to construct 'FileReader': Please use the 'new' operator, this DOM object constructor cannot be called as a function.");
				}

				var delegate = document.createDocumentFragment();
				this.addEventListener = delegate.addEventListener;
				this.dispatchEvent = function (evt) {
					var local = this["on" + evt.type];
					if (typeof local === "function") local(evt);
					delegate.dispatchEvent(evt);
				};
				this.removeEventListener = delegate.removeEventListener;
			}

			function _read (fr, blob, kind) {
				if (!(blob instanceof Blob)) {
					throw new TypeError("Failed to execute '" + kind + "' on 'FileReader': parameter 1 is not of type 'Blob'.");
				}

				fr.result = "";

				setTimeout(function () {
					this.readyState = FileReader.LOADING;
					fr.dispatchEvent(new Event("load"));
					fr.dispatchEvent(new Event("loadend"));
				});
			}

			FileReader.EMPTY = 0;
			FileReader.LOADING = 1;
			FileReader.DONE = 2;
			FileReader.prototype.error = null;
			FileReader.prototype.onabort = null;
			FileReader.prototype.onerror = null;
			FileReader.prototype.onload = null;
			FileReader.prototype.onloadend = null;
			FileReader.prototype.onloadstart = null;
			FileReader.prototype.onprogress = null;

			FileReader.prototype.readAsDataURL = function (blob) {
				_read(this, blob, "readAsDataURL");
				this.result = "data:" + blob.type + ";base64," + array2base64(blob._buffer);
			};

			FileReader.prototype.readAsText = function (blob) {
				_read(this, blob, "readAsText");
				this.result = textDecode(blob._buffer);
			};

			FileReader.prototype.readAsArrayBuffer = function (blob) {
				_read(this, blob, "readAsText");
				// return ArrayBuffer when possible
				this.result = (blob._buffer.buffer || blob._buffer).slice();
			};

			FileReader.prototype.abort = function () {};

			/********************************************************/
			/*                         URL                          */
			/********************************************************/
			URL.createObjectURL = function (blob) {
				return blob instanceof Blob
					? "data:" + blob.type + ";base64," + array2base64(blob._buffer)
					: createObjectURL.call(URL, blob);
			};

			URL.revokeObjectURL = function (url) {
				revokeObjectURL && revokeObjectURL.call(URL, url);
			};

			/********************************************************/
			/*                         XHR                          */
			/********************************************************/
			var _send = global.XMLHttpRequest && global.XMLHttpRequest.prototype.send;
			if (_send) {
				XMLHttpRequest.prototype.send = function (data) {
					if (data instanceof Blob) {
						this.setRequestHeader("Content-Type", data.type);
						_send.call(this, textDecode(data._buffer));
					} else {
						_send.call(this, data);
					}
				};
			}

			exports.Blob = Blob;
			exports.File = File;
			exports.FileReader = FileReader;
			exports.URL = URL;
		}

		function fixFileAndXHR () {
			var isIE = !!global.ActiveXObject || (
				"-ms-scroll-limit" in document.documentElement.style &&
				"-ms-ime-align" in document.documentElement.style
			);

			// Monkey patched
			// IE don't set Content-Type header on XHR whose body is a typed Blob
			// https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/6047383
			var _send = global.XMLHttpRequest && global.XMLHttpRequest.prototype.send;
			if (isIE && _send) {
				XMLHttpRequest.prototype.send = function (data) {
					if (data instanceof Blob) {
						this.setRequestHeader("Content-Type", data.type);
						_send.call(this, data);
					} else {
						_send.call(this, data);
					}
				};
			}

			try {
				new File([], "");
			} catch (e) {
				try {
					exports.File = new Function("class File extends Blob {" +
						"constructor(chunks, name, opts) {" +
							"opts = opts || {};" +
							"super(chunks, opts || {});" +
							"this.name = name.replace(/\\//g, \":\");" +
							"this.lastModifiedDate = opts.lastModified ? new Date(opts.lastModified) : new Date();" +
							"this.lastModified = +this.lastModifiedDate;" +
						"}};" +
						"return new File([], \"\"), File"
					)();
				} catch (e) {
					exports.File = function (b, d, c) {
						var blob = new Blob(b, c);
						var t = c && void 0 !== c.lastModified ? new Date(c.lastModified) : new Date();

						blob.name = d.replace(/\//g, ":");
						blob.lastModifiedDate = t;
						blob.lastModified = +t;
						blob.toString = function () {
							return "[object File]";
						};

						if (strTag) {
							blob[strTag] = "File";
						}

						return blob;
					};
				}
			}
		}

		if (blobSupported) {
			fixFileAndXHR();
			exports.Blob = blobSupportsArrayBufferView ? global.Blob : BlobConstructor;
		} else if (blobBuilderSupported) {
			fixFileAndXHR();
			exports.Blob = BlobBuilderConstructor;
		} else {
			FakeBlobBuilder();
		}

		if (strTag) {
			exports.File.prototype[strTag] = "File";
			exports.Blob.prototype[strTag] = "Blob";
			exports.FileReader.prototype[strTag] = "FileReader";
		}

		var blob = exports.Blob.prototype;
		var stream;

		try {
			new ReadableStream({ type: "bytes" });
			stream = function stream() {
				var position = 0;
				var blob = this;

				return new ReadableStream({
					type: "bytes",
					autoAllocateChunkSize: 524288,

					pull: function (controller) {
						var v = controller.byobRequest.view;
						var chunk = blob.slice(position, position + v.byteLength);
						return chunk.arrayBuffer()
							.then(function (buffer) {
								var uint8array = new Uint8Array(buffer);
								var bytesRead = uint8array.byteLength;

								position += bytesRead;
								v.set(uint8array);
								controller.byobRequest.respond(bytesRead);

								if(position >= blob.size)
									controller.close();
							});
					}
				});
			};
		} catch (e) {
			try {
				new ReadableStream({});
				stream = function stream(blob){
					var position = 0;

					return new ReadableStream({
						pull: function (controller) {
							var chunk = blob.slice(position, position + 524288);

							return chunk.arrayBuffer().then(function (buffer) {
								position += buffer.byteLength;
								var uint8array = new Uint8Array(buffer);
								controller.enqueue(uint8array);

								if (position == blob.size)
									controller.close();
							});
						}
					});
				};
			} catch (e) {
				try {
					new Response("").body.getReader().read();
					stream = function stream() {
						return (new Response(this)).body;
					};
				} catch (e) {
					stream = function stream() {
						throw new Error("Include https://github.com/MattiasBuelens/web-streams-polyfill");
					};
				}
			}
		}

		function promisify(obj) {
			return new Promise(function(resolve, reject) {
				obj.onload = obj.onerror = function(evt) {
					obj.onload = obj.onerror = null;

					evt.type === "load" ?
						resolve(obj.result || obj) :
						reject(new Error("Failed to read the blob/file"));
				};
			});
		}

		if (!blob.arrayBuffer) {
			blob.arrayBuffer = function arrayBuffer() {
				var fr = new FileReader();
				fr.readAsArrayBuffer(this);
				return promisify(fr);
			};
		}

		if (!blob.text) {
			blob.text = function text() {
				var fr = new FileReader();
				fr.readAsText(this);
				return promisify(fr);
			};
		}

		if (!blob.stream) {
			blob.stream = stream;
		}
	});
})(
	typeof self !== "undefined" && self ||
		typeof window !== "undefined" && window ||
		typeof global !== "undefined" && global ||
		this
);
//object objserver
const
	INSERT = 'insert',
	UPDATE = 'update',
	DELETE = 'delete',
	REVERSE = 'reverse',
	SHUFFLE = 'shuffle',
	sysObsKey = Symbol('system-observer-key'),
	validOptionsKeys = ['path', 'pathsFrom'],
	observableDefinition = {
		revoke: {
			value: function () {
				this[sysObsKey].revoke();
			}
		},
		observe: {
			value: function (observer, options) {
				const
					systemObserver = this[sysObsKey],
					observers = systemObserver.observers;

				if (typeof observer !== 'function') {
					throw new Error('observer parameter MUST be a function');
				}
				if (options) {
					if ('path' in options && (typeof options.path !== 'string' || !options.path)) {
						throw new Error('"path" option, if/when provided, MUST be a non-empty string');
					}
					if ('pathsFrom' in options && options.path) {
						throw new Error('"pathsFrom" option MAY NOT be specified together with "path" option');
					}
					if ('pathsFrom' in options && (typeof options.pathsFrom !== 'string' || !options.pathsFrom)) {
						throw new Error('"pathsFrom" option, if/when provided, MUST be a non-empty string');
					}
					const invalidOption = Object.keys(options).find(option => !validOptionsKeys.includes(option));
					if (invalidOption) {
						throw new Error('"' + invalidOption + '" is not a one of the valid options (' + validOptionsKeys.join(', ') + ')');
					}
				}

				if (!observers.has(observer)) {
					observers.set(observer, Object.assign({}, options));
				} else {
					console.info('observer may be bound to an observable only once');
				}
			}
		},
		unobserve: {
			value: function () {
				const
					systemObserver = this[sysObsKey],
					observers = systemObserver.observers;
				let l;
				if (observers.size) {
					l = arguments.length;
					if (l) {
						while (l) {
							observers.delete(arguments[--l]);
						}
					} else {
						observers.clear();
					}
				}
			}
		}
	},
	prepareArray = function (source, observer) {
		let l = source.length, item;
		const target = new Array(l);
		target[sysObsKey] = observer;
		while (l) {
			l--;
			item = source[l];
			if (item && typeof item === 'object' && isObservableType(item)) {
				target[l] = Array.isArray(item)
					? new ArrayObserver({ target: item, ownKey: l, parent: observer }).proxy
					: new ObjectObserver({ target: item, ownKey: l, parent: observer }).proxy;
			} else {
				target[l] = item;
			}
		}
		return target;
	},
	prepareObject = function (source, observer) {
		const
			keys = Object.keys(source),
			target = { [sysObsKey]: observer };
		let l = keys.length, key, item;
		while (l) {
			l--;
			key = keys[l];
			item = source[key];
			if (item && typeof item === 'object' && isObservableType(item)) {
				target[key] = Array.isArray(item)
					? new ArrayObserver({ target: item, ownKey: key, parent: observer }).proxy
					: new ObjectObserver({ target: item, ownKey: key, parent: observer }).proxy;
			} else {
				target[key] = item;
			}
		}
		return target;
	},
	callObservers = function (observers, changes) {
		let target, options, relevantChanges, oPath, oPaths;
		for (target of observers.keys()) {
			try {
				options = observers.get(target);
				relevantChanges = changes;

				if (options.path) {
					oPath = options.path;
					relevantChanges = changes.filter(change => change.path.join('.') === oPath);
				} else if (options.pathsFrom) {
					oPaths = options.pathsFrom;
					relevantChanges = changes.filter(change => change.path.join('.').startsWith(oPaths));
				}
				if (relevantChanges.length) {
					target(relevantChanges);
				}
			} catch (e) {
				console.error('failed to deliver changes to listener ' + target, e);
			}
		}
	},
	getAncestorInfo = function (self) {
		const tmp = [];
		let l1 = 0, l2 = 0;
		while (self.parent) {
			tmp[l1++] = self.ownKey;
			self = self.parent;
		}
		const result = new Array(l1);
		while (l1) result[l2++] = tmp[--l1];
		return { observers: self.observers, path: result };
	},
	nonObservableTypes = [Date, Blob, Number, String, Boolean, Error, Function, Promise, RegExp],
	isObservableType = function (candidate) {
		return !nonObservableTypes.some(t => candidate instanceof t);
	};

class ObserverBase {
	constructor(properties, cloningFunction) {
		const
			source = properties.target,
			targetClone = cloningFunction(source, this);
		if (properties.parent === null) {
			this.isRevoked = false;
			Object.defineProperty(this, 'observers', { value: new Map() });
			Object.defineProperties(targetClone, observableDefinition);
		} else {
			this.parent = properties.parent;
			this.ownKey = properties.ownKey;
		}
		this.revokable = Proxy.revocable(targetClone, this);
		this.proxy = this.revokable.proxy;
		this.target = targetClone;
	}

	set(target, key, value) {
		let newValue, oldValue = target[key], changes;

		if (value === oldValue) {
			return true;
		}

		if (value && typeof value === 'object' && isObservableType(value)) {
			newValue = Array.isArray(value)
				? new ArrayObserver({ target: value, ownKey: key, parent: this }).proxy
				: new ObjectObserver({ target: value, ownKey: key, parent: this }).proxy;
		} else {
			newValue = value;
		}
		target[key] = newValue;

		if (oldValue && typeof oldValue === 'object') {
			const tmpObserved = oldValue[sysObsKey];
			if (tmpObserved) {
				oldValue = tmpObserved.revoke();
			}
		}

		//	publish changes
		const ad = getAncestorInfo(this);
		if (ad.observers.size) {
			ad.path.push(key);
			changes = typeof oldValue === 'undefined'
				? [{ type: INSERT, path: ad.path, value: newValue, object: this.proxy }]
				: [{ type: UPDATE, path: ad.path, value: newValue, oldValue: oldValue, object: this.proxy }];
			callObservers(ad.observers, changes);
		}
		return true;
	}

	deleteProperty(target, key) {
		let oldValue = target[key], changes;

		delete target[key];

		if (oldValue && typeof oldValue === 'object') {
			const tmpObserved = oldValue[sysObsKey];
			if (tmpObserved) {
				oldValue = tmpObserved.revoke();
			}
		}

		//	publish changes
		const ad = getAncestorInfo(this);
		if (ad.observers.size) {
			ad.path.push(key);
			changes = [{ type: DELETE, path: ad.path, oldValue: oldValue, object: this.proxy }];
			callObservers(ad.observers, changes);
		}

		return true;
	}
}

class ArrayObserver extends ObserverBase {
	constructor(properties) {
		super(properties, prepareArray);
	}

	//	returns an unobserved graph (effectively this is an opposite of an ArrayObserver constructor logic)
	revoke() {
		//	revoke native proxy
		this.revokable.revoke();

		//	roll back observed array to an unobserved one
		const target = this.target;
		let l = target.length, item, tmpObserved;
		while (l) {
			l--;
			item = target[l];
			if (item && typeof item === 'object') {
				tmpObserved = item[sysObsKey];
				if (tmpObserved) {
					target[l] = tmpObserved.revoke();
				}
			}
		}
		return target;
	}

	get(target, key) {
		const proxiedArrayMethods = {
			pop: function proxiedPop(target, observed) {
				const poppedIndex = target.length - 1;
				let popResult = target.pop();
				if (popResult && typeof popResult === 'object') {
					const tmpObserved = popResult[sysObsKey];
					if (tmpObserved) {
						popResult = tmpObserved.revoke();
					}
				}

				//	publish changes
				const ad = getAncestorInfo(observed);
				if (ad.observers.size) {
					ad.path.push(poppedIndex);
					callObservers(ad.observers, [{
						type: DELETE,
						path: ad.path,
						oldValue: popResult,
						object: observed.proxy
					}]);
				}
				return popResult;
			},
			push: function proxiedPush(target, observed) {
				let i, l = arguments.length - 2, item, changes, path;
				const
					pushContent = new Array(l),
					initialLength = target.length;

				for (i = 0; i < l; i++) {
					item = arguments[i + 2];
					if (item && typeof item === 'object' && isObservableType(item)) {
						item = Array.isArray(item)
							? new ArrayObserver({ target: item, ownKey: initialLength + i, parent: observed }).proxy
							: new ObjectObserver({ target: item, ownKey: initialLength + i, parent: observed }).proxy;
					}
					pushContent[i] = item;
				}
				const pushResult = Reflect.apply(target.push, target, pushContent);

				//	publish changes
				const ad = getAncestorInfo(observed);
				if (ad.observers.size) {
					changes = [];
					for (i = initialLength, l = target.length; i < l; i++) {
						path = ad.path.slice(0);
						path.push(i);
						changes[i - initialLength] = {
							type: INSERT,
							path: path,
							value: target[i],
							object: observed.proxy
						};
					}
					callObservers(ad.observers, changes);
				}
				return pushResult;
			},
			shift: function proxiedShift(target, observed) {
				let shiftResult, i, l, item, changes, tmpObserved;

				shiftResult = target.shift();
				if (shiftResult && typeof shiftResult === 'object') {
					tmpObserved = shiftResult[sysObsKey];
					if (tmpObserved) {
						shiftResult = tmpObserved.revoke();
					}
				}

				//	update indices of the remaining items
				for (i = 0, l = target.length; i < l; i++) {
					item = target[i];
					if (item && typeof item === 'object') {
						tmpObserved = item[sysObsKey];
						if (tmpObserved) {
							tmpObserved.ownKey = i;
						}
					}
				}

				//	publish changes
				const ad = getAncestorInfo(observed);
				if (ad.observers.size) {
					ad.path.push(0);
					changes = [{ type: DELETE, path: ad.path, oldValue: shiftResult, object: observed.proxy }];
					callObservers(ad.observers, changes);
				}
				return shiftResult;
			},
			unshift: function proxiedUnshift(target, observed) {
				const unshiftContent = Array.from(arguments);
				let changes;
				unshiftContent.splice(0, 2);
				unshiftContent.forEach((item, index) => {
					if (item && typeof item === 'object' && isObservableType(item)) {
						unshiftContent[index] = Array.isArray(item)
							? new ArrayObserver({ target: item, ownKey: index, parent: observed }).proxy
							: new ObjectObserver({ target: item, ownKey: index, parent: observed }).proxy;
					}
				});
				const unshiftResult = Reflect.apply(target.unshift, target, unshiftContent);
				for (let i = 0, l = target.length, item; i < l; i++) {
					item = target[i];
					if (item && typeof item === 'object') {
						const tmpObserved = item[sysObsKey];
						if (tmpObserved) {
							tmpObserved.ownKey = i;
						}
					}
				}

				//	publish changes
				const ad = getAncestorInfo(observed);
				if (ad.observers.size) {
					const l = unshiftContent.length;
					let path;
					changes = new Array(l);
					for (let i = 0; i < l; i++) {
						path = ad.path.slice(0);
						path.push(i);
						changes[i] = { type: INSERT, path: path, value: target[i], object: observed.proxy };
					}
					callObservers(ad.observers, changes);
				}
				return unshiftResult;
			},
			reverse: function proxiedReverse(target, observed) {
				let i, l, item, changes;
				target.reverse();
				for (i = 0, l = target.length; i < l; i++) {
					item = target[i];
					if (item && typeof item === 'object') {
						const tmpObserved = item[sysObsKey];
						if (tmpObserved) {
							tmpObserved.ownKey = i;
						}
					}
				}

				//	publish changes
				const ad = getAncestorInfo(observed);
				if (ad.observers.size) {
					changes = [{ type: REVERSE, path: ad.path, object: observed.proxy }];
					callObservers(ad.observers, changes);
				}
				return observed.proxy;
			},
			sort: function proxiedSort(target, observed, comparator) {
				let i, l, item, changes;
				target.sort(comparator);
				for (i = 0, l = target.length; i < l; i++) {
					item = target[i];
					if (item && typeof item === 'object') {
						const tmpObserved = item[sysObsKey];
						if (tmpObserved) {
							tmpObserved.ownKey = i;
						}
					}
				}

				//	publish changes
				const ad = getAncestorInfo(observed);
				if (ad.observers.size) {
					changes = [{ type: SHUFFLE, path: ad.path, object: observed.proxy }];
					callObservers(ad.observers, changes);
				}
				return observed.proxy;
			},
			fill: function proxiedFill(target, observed) {
				const
					ad = getAncestorInfo(observed),
					changes = [],
					tarLen = target.length,
					normArgs = Array.from(arguments);
				normArgs.splice(0, 2);
				const
					argLen = normArgs.length,
					start = argLen < 2 ? 0 : (normArgs[1] < 0 ? tarLen + normArgs[1] : normArgs[1]),
					end = argLen < 3 ? tarLen : (normArgs[2] < 0 ? tarLen + normArgs[2] : normArgs[2]),
					prev = target.slice(0);
				Reflect.apply(target.fill, target, normArgs);

				let tmpObserved, path;
				for (let i = start, item, tmpTarget; i < end; i++) {
					item = target[i];
					if (item && typeof item === 'object' && isObservableType(item)) {
						target[i] = Array.isArray(item)
							? new ArrayObserver({ target: item, ownKey: i, parent: observed }).proxy
							: new ObjectObserver({ target: item, ownKey: i, parent: observed }).proxy;
					}
					if (prev.hasOwnProperty(i)) {
						tmpTarget = prev[i];
						if (tmpTarget && typeof tmpTarget === 'object') {
							tmpObserved = tmpTarget[sysObsKey];
							if (tmpObserved) {
								tmpTarget = tmpObserved.revoke();
							}
						}

						path = ad.path.slice(0);
						path.push(i);
						changes.push({
							type: UPDATE,
							path: path,
							value: target[i],
							oldValue: tmpTarget,
							object: observed.proxy
						});
					} else {
						path = ad.path.slice(0);
						path.push(i);
						changes.push({ type: INSERT, path: path, value: target[i], object: observed.proxy });
					}
				}

				//	publish changes
				if (ad.observers.size) {
					callObservers(ad.observers, changes);
				}
				return observed.proxy;
			},
			splice: function proxiedSplice(target, observed) {
				const
					ad = getAncestorInfo(observed),
					changes = [],
					spliceContent = Array.from(arguments),
					tarLen = target.length;

				spliceContent.splice(0, 2);
				const splLen = spliceContent.length;

				//	observify the newcomers
				for (let i = 2, item; i < splLen; i++) {
					item = spliceContent[i];
					if (item && typeof item === 'object' && isObservableType(item)) {
						spliceContent[i] = Array.isArray(item)
							? new ArrayObserver({ target: item, ownKey: i, parent: observed }).proxy
							: new ObjectObserver({ target: item, ownKey: i, parent: observed }).proxy;
					}
				}

				//	calculate pointers
				const
					startIndex = splLen === 0 ? 0 : (spliceContent[0] < 0 ? tarLen + spliceContent[0] : spliceContent[0]),
					removed = splLen < 2 ? tarLen - startIndex : spliceContent[1],
					inserted = Math.max(splLen - 2, 0),
					spliceResult = Reflect.apply(target.splice, target, spliceContent),
					newTarLen = target.length;

				//	reindex the paths
				let tmpObserved;
				for (let i = 0, item; i < newTarLen; i++) {
					item = target[i];
					if (item && typeof item === 'object') {
						tmpObserved = item[sysObsKey];
						if (tmpObserved) {
							tmpObserved.ownKey = i;
						}
					}
				}

				//	revoke removed Observed
				let i, l, item;
				for (i = 0, l = spliceResult.length; i < l; i++) {
					item = spliceResult[i];
					if (item && typeof item === 'object') {
						tmpObserved = item[sysObsKey];
						if (tmpObserved) {
							spliceResult[i] = tmpObserved.revoke();
						}
					}
				}

				//	publish changes
				if (ad.observers.size) {
					let index, path;
					for (index = 0; index < removed; index++) {
						path = ad.path.slice(0);
						path.push(startIndex + index);
						if (index < inserted) {
							changes.push({
								type: UPDATE,
								path: path,
								value: target[startIndex + index],
								oldValue: spliceResult[index],
								object: observed.proxy
							});
						} else {
							changes.push({
								type: DELETE,
								path: path,
								oldValue: spliceResult[index],
								object: observed.proxy
							});
						}
					}
					for (; index < inserted; index++) {
						path = ad.path.slice(0);
						path.push(startIndex + index);
						changes.push({
							type: INSERT,
							path: path,
							value: target[startIndex + index],
							object: observed.proxy
						});
					}
					callObservers(ad.observers, changes);
				}
				return spliceResult;
			}
		};
		if (proxiedArrayMethods.hasOwnProperty(key)) {
			return proxiedArrayMethods[key].bind(undefined, target, this);
		} else {
			return target[key];
		}
	}
}

class ObjectObserver extends ObserverBase {
	constructor(properties) {
		super(properties, prepareObject);
	}

	//	returns an unobserved graph (effectively this is an opposite of an ObjectObserver constructor logic)
	revoke() {
		//	revoke native proxy
		this.revokable.revoke();

		//	roll back observed graph to an unobserved one
		const
			target = this.target,
			keys = Object.keys(target);
		let l = keys.length, key, item, tmpObserved;
		while (l) {
			key = keys[--l];
			item = target[key];
			if (item && typeof item === 'object') {
				tmpObserved = item[sysObsKey];
				if (tmpObserved) {
					target[key] = tmpObserved.revoke();
				}
			}
		}
		return target;
	}
}

class Observable {
	constructor() {
		throw new Error('Observable MAY NOT be created via constructor, see "Observable.from" API');
	}

	static from(target) {
		if (target && typeof target === 'object' && isObservableType(target) && !('observe' in target) && !('unobserve' in target) && !('revoke' in target)) {
			const observed = Array.isArray(target)
				? new ArrayObserver({ target: target, ownKey: null, parent: null })
				: new ObjectObserver({ target: target, ownKey: null, parent: null });
			return observed.proxy;
		} else {
			if (!target || typeof target !== 'object') {
				throw new Error('observable MAY ONLY be created from non-null object only');
			} else if ('observe' in target || 'unobserve' in target || 'revoke' in target) {
				throw new Error('target object MUST NOT have nor own neither inherited properties from the following list: "observe", "unobserve", "revoke"');
			} else if (!isObservableType(target)) {
				throw new Error(target + ' found to be one of non-observable object types: ' + nonObservableTypes);
			}
		}
	}

	static isObservable(input) {
		return !!(input && input[sysObsKey] && input.observe);
	}
}

Object.freeze(Observable);

export { Observable };