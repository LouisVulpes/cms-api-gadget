/**
 * gadget.js
 *
 * @author Louis Vulpes
 * @copyright Missouri State University 2024-2026
 */

(function (gadgetWindow) {
  "use strict";

  /**
   * Gadget bridge for iframe <-> host communication using window.postMessage.
   *
   * Exposes a global `window.gadget` with:
   *   - request/response helpers (jQuery Deferred)
   *   - environment collection (URL params + host env)
   *   - a small event-bus via $(gadget).trigger(...)
   *
   * Dependencies:
   *   - jQuery (for $.Deferred and the event bus)
   *
   * Message protocol (high-level):
   *   - Requests include a `callback` id.
   *   - Host replies with the same `callback` id.
   *   - Host broadcast events omit `callback` and include `{ name, payload }`.
   */

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Best-effort parse for postMessage payloads.
   * Host may send either:
   *   - a plain object (structured clone)
   *   - a JSON string
   *
   * @param {any} raw
   * @returns {object|null}
   */
  function parseMessageData(raw) {
    if (typeof raw !== "string") return raw;

    try {
      return JSON.parse(raw);
    } catch (e) {
      // Avoid throwing inside message handlers. Keep logging minimal to prevent
      // leaking potentially-sensitive payloads into the console.
      console.warn("Cannot parse postMessage payload (expected JSON string).");
      return null;
    }
  }

  /**
   * Normalize a host config value to a strict origin string.
   *
   * Accepts common inputs:
   *   - "https://example.com"
   *   - "https://example.com/" (trailing slash)
   *   - "https://example.com/some/path" (path is stripped)
   *   - "//example.com" (protocol-relative)
   *   - "example.com:8443" (host[:port], protocol inferred from current page)
   *
   * Returns:
   *   - "https://example.com" on success
   *   - null on failure
   *
   * Note: only http/https origins are allowed.
   */
  function normalizeOrigin(value) {
    if (typeof value !== "string") return null;

    const v = value.trim();
    if (!v) return null;

    // We intentionally do NOT accept "*" as a safe targetOrigin.
    if (v === "*") return null;

    const pageProtocol =
      (gadgetWindow.location && gadgetWindow.location.protocol) || "https:";

    try {
      // Absolute http(s) URL
      if (/^https?:\/\//i.test(v)) {
        return new URL(v).origin;
      }

      // Protocol-relative URL
      if (/^\/\//.test(v)) {
        return new URL(pageProtocol + v).origin;
      }

      // hostname[:port]
      if (/^[a-z0-9.-]+(?::\d+)?$/i.test(v)) {
        return new URL(pageProtocol + "//" + v).origin;
      }

      // Anything else is rejected to avoid accidentally treating relative
      // strings as a same-origin URL.
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Security boundary:
   * Only accept messages from the expected host origin AND from the top window.
   *
   * If your gadget might be embedded inside nested iframes, consider relaxing
   * the `event.source` check to `gadgetWindow.parent`.
   */
  const isTrustedEvent = (event) =>
    !!(
      event &&
      event.source === gadgetWindow.top &&
      typeof event.origin === "string" &&
      event.origin === gadget.msghostOrigin
    );

  // ---------------------------------------------------------------------------
  // Request/response plumbing
  // ---------------------------------------------------------------------------

  /**
   * Pending host requests keyed by callback id.
   *
   * Optimization:
   * Instead of attaching a new window "message" listener per request, keep a
   * single global listener and route responses using this map. This reduces
   * listener churn and avoids O(N) work per message when multiple requests are
   * in flight.
   */
  const pendingRequests = new Map();

  function makeCallbackId() {
    // crypto.randomUUID is the best option if available.
    if (gadgetWindow.crypto && typeof gadgetWindow.crypto.randomUUID === "function") {
      return gadgetWindow.crypto.randomUUID();
    }

    // Fallback: timestamp + random.
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clearPending(callbackId) {
    const entry = pendingRequests.get(callbackId);
    if (!entry) return;

    if (entry.timerId) clearTimeout(entry.timerId);
    pendingRequests.delete(callbackId);
  }

  /**
   * Send a request to the host window and resolve when the matching response arrives.
   *
   * @param {string} name - Host message name (command)
   * @param {any} [payload] - Payload passed to host
   * @param {object} [options]
   * @param {number} [options.timeoutMs] - Per-call timeout override
   * @returns {JQueryDeferred<any>}
   */
  function sendMessageToTop(name, payload, options) {
    options = options || {};

    // Timeout precedence: per-call option -> gadget.requestTimeoutMs -> default
    var timeoutMs =
      typeof options.timeoutMs === "number"
        ? options.timeoutMs
        : typeof gadget.requestTimeoutMs === "number"
          ? gadget.requestTimeoutMs
          : 15000;

    // Ensure we have a safe, normalized host origin.
    // (We refuse to postMessage with targetOrigin="*".)
    if (!gadget.msghostOrigin) {
      const d = new $.Deferred();
      d.reject({
        code: "missing_msghost",
        message:
          "gadget.msghost is not set (or not a valid origin); cannot postMessage() safely.",
        name: name,
      });
      return d;
    }

    var msgid = makeCallbackId();

    // Envelope sent to host. Host can use these fields to identify the gadget + context.
    // Note: `origin` here means "gadget URL" (not window.location.origin).
    var message = {
      name: name,
      gid: gadget.gid,
      origin: gadget.url,
      token: gadget.token,
      place: gadget.place,
      payload: payload,
      callback: msgid,
    };

    var deferred = new $.Deferred();

    // Register callback before sending so we never miss a fast response.
    pendingRequests.set(msgid, { deferred: deferred, timerId: null, name: name });

    // Timeout protection in case host never replies.
    if (isFinite(timeoutMs) && timeoutMs > 0) {
      const timerId = setTimeout(() => {
        clearPending(msgid);

        deferred.reject({
          code: "timeout",
          message: "Timed out waiting for host response.",
          name: name,
          callback: msgid,
          timeoutMs: timeoutMs,
        });
      }, timeoutMs);

      pendingRequests.get(msgid).timerId = timerId;
    }

    try {
      // We stringify for compatibility with hosts that treat `event.data` as text.
      gadgetWindow.top.postMessage(JSON.stringify(message), gadget.msghostOrigin);
    } catch (e) {
      clearPending(msgid);
      deferred.reject(e);
    }

    return deferred;
  }

  /**
   * Global message listener.
   *
   * Handles BOTH:
   *   1) Callback responses to previously-sent requests
   *   2) Unsolicited host broadcast events (no callback id)
   */
  function messageHandler(event) {
    if (!isTrustedEvent(event)) return;

    var message = parseMessageData(event.data);
    if (!message) return;

    // 1) Request/response: resolve the Deferred for the matching callback id.
    if (message.callback) {
      const entry = pendingRequests.get(message.callback);
      if (!entry) return; // unknown / timed-out callback

      clearPending(message.callback);
      entry.deferred.resolve(message.payload);
      return;
    }

    // 2) Broadcast: forward as a jQuery event on the gadget object.
    // Consumers can subscribe with: $(gadget).on("file-changed", (e, payload) => ...)
    if (typeof message.name === "string" && message.name) {
      $(gadget).trigger(message.name, message.payload);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  let gadget = {
    /**
     * Resolve when gadget finished collecting initial data from URL + host env.
     * - If already ready, resolves immediately.
     * - Otherwise resolves when "ready" event is triggered.
     *
     * @param {Function} [callback]
     * @returns {JQueryDeferred<void>}
     */
    ready: function (callback) {
      var deferred = new $.Deferred();

      if (this.isReady) {
        if (typeof callback === "function") callback();
        deferred.resolve();
        return deferred;
      }

      $(this).one("ready", function () {
        if (typeof callback === "function") callback();
        deferred.resolve();
      });

      return deferred;
    },

    /**
     * Get a gadget property.
     *
     * Objects are deep-cloned to prevent outside code from mutating gadget state.
     * NOTE: JSON cloning drops functions, Dates, undefined, and circular refs.
     */
    get: function (propName) {
      if (typeof this[propName] === "object" && this[propName] !== null) {
        return JSON.parse(JSON.stringify(this[propName]));
      }

      return this[propName];
    },

    /**
     * Set one or many properties.
     * Supports:
     *   gadget.set("favoriteColor", "blue")
     *   gadget.set({ favoriteColor: "blue", favoriteFlavor: "vanilla" })
     */
    set: function (arg0, arg1) {
      if (typeof arg0 === "string") {
        this[arg0] = arg1;
        return;
      }

      if (arg0 && typeof arg0 === "object") {
        for (var key in arg0) {
          if (Object.prototype.hasOwnProperty.call(arg0, key)) {
            this[key] = arg0[key];
          }
        }
      }
    },

    /**
     * Only meaningful in sidebar placement; asks host to resize container.
     * No-op if not in sidebar.
     */
    resize: function (height) {
      if (this.place !== "sidebar") return;

      let config = {
        gid: this.gid,
        place: this.place,
        height: height,
      };

      return sendMessageToTop("set-gadget-height", config);
    },

    /**
     * Collect URL params + host-provided environment and store them on gadget.
     *
     * Order matters:
     *   1) URL params must be applied first (they include msghost)
     *   2) msghost is normalized to msghostOrigin before any postMessage calls
     */
    collectData: function () {
      let urlData = this.getUrlData();
      this.set(urlData);

      // Normalize msghost once; used for both outgoing targetOrigin and incoming origin checks.
      this.msghostOrigin = normalizeOrigin(this.msghost);

      return this.getEnvironment().then((data) => {
        if (data) this.set(data);
        return { ...urlData, ...data };
      });
    },

    /**
     * Parse URL into a plain object.
     *
     * @returns {object}
     */
    getUrlData: function () {
      let data = {};

      let url = new URL(location.href);
      let params = url.searchParams;

      // Base URL without query params
      data.url = `${url.origin}${url.pathname}`;

      // Gadget name inferred from pathname: /some/path/<name>/<file-or-end>
      // NOTE: `.at(-2)` requires modern JS. For older compatibility:
      //   const segments = url.pathname.split('/');
      //   data.name = segments[segments.length - 2];
      data.name = url.pathname.split("/").at(-2);

      // Copy all query parameters into the data object
      for (let [key, value] of params.entries()) data[key] = value;

      return data;
    },

    // Reload the iframe.
    reload: () => gadgetWindow.location.reload(),

    // -----------------------------------------------------------------------
    // Host request helpers
    // -----------------------------------------------------------------------

    /**
     * Ask host for environment data.
     * Some hosts respond with a sentinel string for unknown messages; treat that as "no env".
     */
    getEnvironment: () =>
      sendMessageToTop("get-environment").then((data) =>
        data !== "Unrecognized message." ? data : null
      ),

    getFileInfo: () => sendMessageToTop("get-current-file-info"),

    getLocation: () => sendMessageToTop("get-location"),

    getSourceContent: () => sendMessageToTop("get-source-content"),

    getWysiwygContent: () => sendMessageToTop("get-wysiwyg-content"),

    getSelection: () => sendMessageToTop("get-wysiwyg-selection"),

    insertAtCursor: (content) => sendMessageToTop("insert-at-cursor", content),

    refreshLocation: () => sendMessageToTop("refresh-location"),

    setLocation: (route) => sendMessageToTop("set-location", route),
  };

  // Bind methods so `this` stays stable even when passing references around.
  // (Skip non-function properties to keep this loop safe for future additions.)
  for (let key in gadget) {
    if (typeof gadget[key] === "function") gadget[key] = gadget[key].bind(gadget);
  }

  // Attach the global message listener once.
  gadgetWindow.addEventListener("message", messageHandler, false);

  /**
   * Initialize gadget:
   * - Collect URL data immediately
   * - Ask host for environment
   * - Mark isReady and emit "ready" either way so consumer code can proceed
   */
  gadget
    .collectData()
    .then((data) => {
      console.log(`[${gadget.name}][${gadget.gid}] is ready : `, data);

      gadget.isReady = true;
      $(gadget).trigger("ready");
    })
    .fail((error) => {
      console.warn(
        `[${gadget.name}][${gadget.gid}] host env unavailable; continuing without env.`,
        error
      );

      gadget.isReady = true;
      $(gadget).trigger("ready");
    });

  // Expose globally for consumers.
  gadgetWindow.gadget = gadget;
})(window);
