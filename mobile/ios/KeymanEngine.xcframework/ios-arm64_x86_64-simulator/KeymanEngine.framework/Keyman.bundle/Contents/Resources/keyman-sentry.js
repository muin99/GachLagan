(() => {
  var __defProp = Object.defineProperty;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

  // ../../../../common/web/keyman-version/version.inc.ts
  var _KEYMAN_VERSION = class _KEYMAN_VERSION {
  };
  __name(_KEYMAN_VERSION, "KEYMAN_VERSION");
  _KEYMAN_VERSION.VERSION = "18.0.252";
  _KEYMAN_VERSION.VERSION_RELEASE = "18.0";
  _KEYMAN_VERSION.VERSION_MAJOR = "18";
  _KEYMAN_VERSION.VERSION_MINOR = "0";
  _KEYMAN_VERSION.VERSION_PATCH = "252";
  _KEYMAN_VERSION.TIER = "stable";
  _KEYMAN_VERSION.VERSION_TAG = "";
  _KEYMAN_VERSION.VERSION_WITH_TAG = "18.0.252";
  _KEYMAN_VERSION.VERSION_ENVIRONMENT = "stable";
  _KEYMAN_VERSION.VERSION_GIT_TAG = "release@18.0.252";
  var KEYMAN_VERSION = _KEYMAN_VERSION;
  var version_inc_default = KEYMAN_VERSION;

  // build/obj/index.js
  var Sentry = window["Sentry"];
  var DEBUG = false;
  var _KeymanSentryManager = class _KeymanSentryManager {
    constructor(options = _KeymanSentryManager.DEFAULT_OPTIONS) {
      this._enabled = true;
      this.keymanPlatform = options.hostPlatform;
    }
    // If we've recognized one of our source files,
    aliasFilename(filename) {
      if (!this.mayAlias(filename)) {
        return null;
      }
      switch (location.protocol) {
        case "http:":
          return "http://" + location.host + "/" + filename;
        case "file:":
          return "file:///" + filename;
        default:
          return null;
      }
    }
    mayAlias(filename) {
      return !!_KeymanSentryManager.STANDARD_ALIASABLE_FILES[filename];
    }
    // Filters all expected but unnecessary path prefixes, affixes, and suffixes reported by Sentry from our products.
    // This allows us to mask all different sorts of installations with a single uploaded path.
    // Modifies original object.
    pathFilter(event) {
      let exception = event.exception;
      if (!exception) {
        return;
      }
      for (let e of exception.values) {
        if (!e.stacktrace) {
          continue;
        }
        for (let frame of e.stacktrace.frames) {
          let URL = frame.filename;
          let filename = "";
          try {
            filename = URL.substr(URL.lastIndexOf("/") + 1);
            if (this.mayAlias(filename)) {
              frame.filename = this.aliasFilename(filename) || frame.filename;
            }
          } catch (_a) {
          }
        }
      }
    }
    // Attaches some useful debugging information to the specified object, pass-by-reference style.
    attachEventMetadata(event) {
      var _a, _b;
      event.extra = event.extra || {};
      event.extra.keymanState = (_b = (_a = window["keyman"]) === null || _a === void 0 ? void 0 : _a["getDebugInfo"]) === null || _b === void 0 ? void 0 : _b.call(_a);
      event.extra.keymanHostPlatform = this.keymanPlatform;
    }
    // Sanitizes the event object (in-place) to remove sensitive information
    // from the breadcrumbs and url (for embedded KeymanWeb)
    sanitizeEvent(event) {
      if (event && event.breadcrumbs) {
        event.breadcrumbs.forEach((b) => {
          if (b.category == "navigation") {
            let NAVIGATION_PATTERN = /(.*)?(keyboard\.html#[^-]+)-.*/;
            b.data.from = b.data.from.replace(NAVIGATION_PATTERN, "$1$2");
            b.data.to = b.data.to.replace(NAVIGATION_PATTERN, "$1$2");
          }
        });
      }
      if (event && event.request && event.request.url) {
        let URL_PATTERN = /#.*$/;
        event.request.url = event.request.url.replace(URL_PATTERN, "");
      }
    }
    /**
     * Pre-processes a Sentry event object (in-place) to provide more metadata and enhance
     * the Sentry server's ability to match the error against release artifacts.
     * Also will sanitize the Sentry event.
     * @param event A Sentry-generated event
     */
    prepareEvent(event) {
      this.pathFilter(event);
      this.attachEventMetadata(event);
      this.sanitizeEvent(event);
      if (DEBUG) {
        console.log("DEBUG:  event object for Sentry");
        console.log(event);
        return false;
      } else if (!this._enabled) {
        console.error(event);
        return false;
      } else {
        return true;
      }
    }
    /**
     * Allows debugging our custom event preparation code without bombarding Sentry with errors
     * during development.
     *
     * Note that Sentry expects us either to return the event object to be sent or to return `null`
     * if we want to prevent the event from being sent to the server.
     * @param event
     */
    prepareEventDebugWrapper(event) {
      if (DEBUG) {
        try {
          if (this.prepareEvent(event)) {
            return event;
          } else {
            return null;
          }
        } catch (err) {
          console.log(err);
        }
      } else {
        if (this.prepareEvent(event)) {
          return event;
        } else {
          return null;
        }
      }
    }
    /**
     * Capture errors and warnings logged to Console in order to get
     * stack traces. We can't use CaptureConsole integration until we
     * upgrade to a newer version of Sentry, which has a bit of a cascade
     * of changes required, in particular a change of module type.
     *
     * https://stackoverflow.com/a/53214615/1836776
     */
    initConsole() {
      let oldConsoleError = console.error;
      let _this = this;
      console.error = reportingConsoleError;
      function reportingConsoleError() {
        let args = Array.prototype.slice.call(arguments);
        if (_this._enabled) {
          Sentry.captureException(reduceConsoleArgs(args), { level: "error" });
        }
        return oldConsoleError.apply(console, args);
      }
      __name(reportingConsoleError, "reportingConsoleError");
      ;
      let oldConsoleWarn = console.warn;
      console.warn = reportingConsoleWarn;
      function reportingConsoleWarn() {
        let args = Array.prototype.slice.call(arguments);
        if (_this._enabled) {
          Sentry.captureMessage(reduceConsoleArgs(args), { level: "warning" });
        }
        return oldConsoleWarn.apply(console, args);
      }
      __name(reportingConsoleWarn, "reportingConsoleWarn");
      function reduceConsoleArgs(args) {
        let errorMsg = args[0];
        if (!(errorMsg instanceof Error)) {
          errorMsg = new Error(args.reduce(function(accumulator, currentValue) {
            return accumulator.toString() + " " + currentValue.toString();
          }, ""));
        }
        return errorMsg;
      }
      __name(reduceConsoleArgs, "reduceConsoleArgs");
    }
    init() {
      Sentry.init({
        beforeSend: this.prepareEventDebugWrapper.bind(this),
        // Not using beforeBreadcrumb because that caused breadcrumbs to get lost in Sentry
        debug: DEBUG,
        dsn: "https://cf96f32d107c4286ab2fd82af49c4d3b@o1005580.ingest.sentry.io/5983524",
        // keyman-web DSN
        release: version_inc_default.VERSION_GIT_TAG,
        environment: version_inc_default.VERSION_ENVIRONMENT
      });
      this.initConsole();
    }
    get enabled() {
      return this._enabled;
    }
    set enabled(value) {
      this._enabled = value;
    }
  };
  __name(_KeymanSentryManager, "KeymanSentryManager");
  var KeymanSentryManager = _KeymanSentryManager;
  KeymanSentryManager.STANDARD_ALIASABLE_FILES = {
    "keymanweb.js": "keymanweb.js",
    "keymanweb-webview.js": "keymanweb-webview.js",
    "kmwuibutton.js": "kmwuibutton.js",
    "kmwuifloat.js": "kmwuifloat.js",
    "kmwuitoggle.js": "kmwuitoggle.js",
    "kmwuitoolbar.js": "kmwuitoolbar.js"
    // Also add entries for the naming system used by Android and iOS - and map them to the EMBEDDED upload, not the std 'native' one.
  };
  KeymanSentryManager.DEFAULT_OPTIONS = {
    hostPlatform: "native-web"
  };
  window["KeymanSentryManager"] = KeymanSentryManager;
})();
//# sourceMappingURL=index.js.map
