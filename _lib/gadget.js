/**
 * gadget.js
 *
 * @author Louis Vulpes
 * @copyright Missouri State University 2024-2026
 */

(function (gadgetWindow) {

/**
 * Gadget bridge for iframe <-> host communication using window.postMessage.
 * Exposes a global `window.gadget` with:
 *   - request/response helpers (Deferred)
 *   - environment collection
 *   - a small event-bus via $(gadget).trigger(...)
 */

  "use strict";

  function parseMessageData(raw) {

  /**
   * Best-effort parse for postMessage payloads.
   * Host may send either objects or JSON strings.
   */

    if (typeof raw !== "string") return raw;

    try {

      return JSON.parse(raw);

    }

    catch (e) {

      console.log("Cannot parse message:", raw);

      return null;

    }

  }

  /**
   * Security boundary:
   * Only accept messages from the expected host origin.
   * Consider also checking `event.source === gadgetWindow.top` if you want to
   * guarantee the sender window is the parent (not just the same origin).
   */
  const isTrustedEvent = (event) => event.source === gadgetWindow.top && event.origin === gadget.msghost;

  function sendMessageToTop(name, payload, options) {

  /**
   * Send a request to the host window and resolve when the matching response arrives.
   * Message listeners timeout if the host never replies.
   */

    options = options || {};

    // Timeout precedence: per-call option -> gadget.requestTimeoutMs -> default
    var timeoutMs = (typeof options.timeoutMs === "number") ?

      options.timeoutMs :

      (typeof gadget.requestTimeoutMs === "number") ?

        gadget.requestTimeoutMs :

        15000;

    // Callback id ties request <-> response together.
    var msgid = Math.random().toString().slice(2);

    // Envelope sent to host. Host can use these fields to identify the gadget + context.
    var message = {

      name : name, 
      gid : gadget.gid,
      origin : gadget.url,
      token : gadget.token,
      place : gadget.place,
      payload : payload,
      callback : msgid,

    };

    var deferred = new $.Deferred();

    // Must have a known host origin so postMessage uses a specific targetOrigin.
    if (!gadget.msghost) {

      deferred.reject({

        code: 'missing_msghost',
        message: 'gadget.msghost is not set; cannot postMessage() safely.',
        name: name,
        callback: msgid,

      });

      return deferred;

    }

    var timerId = null;
    var cleanedUp = false;

    const _messageHandler = function (event) {

    /**
      * Per-request response listener.
      * This only resolves the Deferred for the matching callback id.
      */

      if (!isTrustedEvent(event)) return;

      let parsed = parseMessageData(event.data);

      if (!parsed) return;

      // The callback id ties this response to the original request.
      if (parsed.callback === msgid) {

        cleanup();

        deferred.resolve(parsed.payload);

      }

    };

    function cleanup() {

    /**
     * Remove listener + clear timeout.
     * Guarded so it’s safe to call multiple times.
     */

      if (cleanedUp) return;

      cleanedUp = true;

      if (timerId !== null) clearTimeout(timerId);

      gadgetWindow.removeEventListener('message', _messageHandler, false);

    }

    // Attach listener BEFORE sending so we never miss a fast response.
    gadgetWindow.addEventListener('message', _messageHandler, false);

    // Timeout protection in case host never replies.
    if (isFinite(timeoutMs) && timeoutMs > 0) {

      timerId = setTimeout(() => {

        cleanup();

        deferred.reject({
          code: 'timeout',
          message: 'Timed out waiting for host response.',
          name: name,
          callback: msgid,
          timeoutMs: timeoutMs,
        });

      }, timeoutMs);

    }

    try {

      gadgetWindow.top.postMessage(JSON.stringify(message), gadget.msghost);

    }

    catch (e) {

      cleanup();

      deferred.reject(e);

    }

    return deferred;

  }

  function messageHandler(event) {

  /**
   * Global message listener for unsolicited host events (non-callback).
   * Callback responses are handled by the per-request listener in sendMessageToTop().
   *
   * Host can broadcast events like:
   *   { name: "file-changed", payload: {...} }
   *
   * Consumers can subscribe with:
   *   $(gadget).on("file-changed", (e, payload) => { ... })
   */

    if (!isTrustedEvent(event)) return;

    var message = parseMessageData(event.data);

    if (!message) return;

    // Callback responses should be handled by sendMessageToTop's listener.
    if (message.callback) return;

    // Event bus: forward as jQuery event on the gadget object.
    $(gadget).trigger(message.name, message.payload);

  }

  let gadget = {

    ready : function (callback) {

    /**
     * Resolve when gadget finished collecting initial data from URL + host env.
     * - If already ready, resolves immediately.
     * - Otherwise resolves when "ready" event is triggered.
     *
     * @param {Function} [callback]
     * @returns {JQueryDeferred<void>}
     */

      var deferred = new $.Deferred();

      if (this.isReady) {

        callback && callback();

        deferred.resolve();

      }

      else {

        $(this).one('ready', function () {

          callback && callback();

          deferred.resolve();

        });

      }

      return deferred;

    },

    get : function (propName) {

    /**
     * Get a property.
     * Objects are deep-cloned to prevent outside code from mutating gadget state.
     */

      if (typeof this[propName] == 'object') return JSON.parse(JSON.stringify(this[propName]));

      return this[propName];

    },

    set : function (arg0, arg1) {

    /**
     * Set one or many properties.
     * Supports:
     *   gadget.set("favoriteColor", "blue")
     *   gadget.set({ favoriteColor: "blue", favoriteFlavor: "vanilla" })
     */

      if (typeof arg0 == 'string') this[arg0] = arg1;

      if (typeof arg0 == 'object') for (var key in arg0) if (Object.prototype.hasOwnProperty.call(arg0, key)) this[key] = arg0[key];
  
    },

    resize : function (height) {

    /**
     * Only meaningful in sidebar placement; asks host to resize container.
     * No-op if not in sidebar.
     *
     * @param {number} height
     * @returns {JQueryDeferred<any>|undefined}
     */

      if (this.place != 'sidebar') return;

      let config = {

        gid : this.gid,
        place : this.place,
        height : height,

      };

      return sendMessageToTop('set-gadget-height', config);

    },

    collectData : function () {

    /**
     * Collect URL params + host-provided environment and store them on gadget.
     */

      let urlData = this.getUrlData();

      this.set(urlData);

      return this.getEnvironment()

        .then(data => {

          if (data) this.set(data);

          return {...urlData, ...data};

        });

    },

    getUrlData : function () {

    /**
     * Parse URL into a plain object.
     *
     * NOTE:
     * - `.at(-2)` requires modern JS. If you need older compatibility,
     *   replace with `segments[segments.length - 2]`.
     *
     * @returns {object}
     */

      let data = {};

      let url = new URL(location.href);

      let params = url.searchParams;

      // Base URL without query params
      data.url = `${url.origin}${url.pathname}`;

      // Gadget name inferred from pathname: /some/path/<name>/<file-or-end>
      data.name = url.pathname.split('/').at(-2);

      // Copy all query parameters into the data object
      for (let [key, value] of params.entries()) data[key] = value;

      return data;

    },

    // Reload the iframe.
    reload : () => gadgetWindow.location.reload(),

    /**
     * Host request helpers.
     * These all return Deferreds resolved with host payloads (or rejected on timeout/error).
     */

    getEnvironment : () => sendMessageToTop('get-environment')

      .then(data => data !== 'Unrecognized message.' ? data : null),

    getFileInfo : () => sendMessageToTop('get-current-file-info'),

    getLocation : () => sendMessageToTop('get-location'),

    getSourceContent : () => sendMessageToTop('get-source-content'),

    getWysiwygContent : () => sendMessageToTop('get-wysiwyg-content'),

    getSelection : () => sendMessageToTop('get-wysiwyg-selection'),   

    insertAtCursor : (content) => sendMessageToTop('insert-at-cursor', content),

    refreshLocation : () => sendMessageToTop('refresh-location'),

    setLocation : (route) => sendMessageToTop('set-location', route),

  };

  // Bind methods so `this` is stable even when passing references around.
  for (let method in gadget) gadget[method] = gadget[method].bind(gadget);

  /**
   * Initialize gadget:
   * - Collect URL data immediately
   * - Ask host for environment
   * - Mark isReady and emit "ready" either way so consumer code can proceed
   */
  gadget.collectData()

    .then(data => {

      console.log(`[${gadget.name}][${gadget.gid}] is ready : `, data)

      gadget.isReady = true;

      $(gadget).trigger('ready');

    })

    .fail(error => {

      console.warn(`[${gadget.name}][${gadget.gid}] host env unavailable; continuing without env.`, error);

      gadget.isReady = true;

      $(gadget).trigger('ready');

    });

  /**
   * Global listener for host "event" messages (non-callback).
   * Note: per-request listeners are created inside sendMessageToTop().
   */
  gadgetWindow.addEventListener('message', messageHandler, false);

  // Expose globally for consumers.
  gadgetWindow.gadget = gadget;

})(window);
