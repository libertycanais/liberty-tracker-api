import { Injectable, NotFoundException } from '@nestjs/common';
import { EncryptionService } from '../crypto/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveTrackerConfig } from '../tracker/entities/tracker-config.entity';
import type { TrackerConfig } from '../tracker/tracker.types';
import {
  classifyChannel,
  computeBackoff,
  computeFingerprint,
  detectBrowser,
  detectDeviceType,
  detectOs,
  parseClickIds,
  parseUtms,
  shouldFlushBatch,
} from './sdk/sdk.helpers';
import {
  BATCH_MAX_SIZE,
  BATCH_MAX_WAIT_MS,
  EVENT_VERSION,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_ATTEMPTS,
  RETRY_MAX_DELAY_MS,
  SCHEMA_VERSION,
  SDK_CAPABILITIES,
  SDK_VERSION,
} from './sdk/sdk.constants';

/**
 * Runtime feature flags embedded in the generated tracker.js. Read from
 * `trackerConfig` so each project can toggle SDK behavior without a code
 * change. Prepared (default-false) flags are declared but not yet acted on.
 */
interface SdkFlags {
  offlineQueue: boolean;
  retry: boolean;
  batch: boolean;
  heartbeat: boolean;
  fingerprint: boolean;
  geo: boolean;
  debug: boolean;
  // prepared (default false):
  plugins: boolean;
  identityResolution: boolean;
  attribution: boolean;
  diagnostics: boolean;
  eventBus: boolean;
}

function resolveSdkFlags(raw: TrackerConfig | null): SdkFlags {
  const f = raw?.sdkFlags ?? {};
  return {
    offlineQueue: f.offlineQueue ?? true,
    retry: f.retry ?? true,
    batch: f.batch ?? true,
    heartbeat: f.heartbeat ?? true,
    fingerprint: f.fingerprint ?? true,
    geo: f.geo ?? true,
    debug: f.debug ?? false,
    plugins: f.plugins ?? false,
    identityResolution: f.identityResolution ?? false,
    attribution: f.attribution ?? false,
    diagnostics: f.diagnostics ?? false,
    eventBus: f.eventBus ?? false,
  };
}

/** Serialize the pure helpers into the browser bundle (they are self-contained). */
function embeddedHelpers(): string {
  return [
    parseClickIds,
    parseUtms,
    classifyChannel,
    detectBrowser,
    detectOs,
    detectDeviceType,
    computeBackoff,
    computeFingerprint,
    shouldFlushBatch,
  ]
    .map((fn) => fn.toString())
    .join('\n');
}

@Injectable()
export class SnippetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async generate(projectId: string, apiUrl: string): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Unknown project');
    }
    const apiKey = this.encryptionService.decrypt(project.apiKeyEncrypted);
    const rawConfig = project.trackerConfig as TrackerConfig | null;
    const config = resolveTrackerConfig(rawConfig);
    return buildSnippet({
      apiUrl,
      projectId,
      apiKey,
      heartbeatIntervalSeconds: config.heartbeatIntervalSeconds,
      flags: resolveSdkFlags(rawConfig),
    });
  }
}

function buildSnippet(opts: {
  apiUrl: string;
  projectId: string;
  apiKey: string;
  heartbeatIntervalSeconds: number;
  flags: SdkFlags;
}): string {
  const cfg = {
    apiUrl: opts.apiUrl,
    projectId: opts.projectId,
    apiKey: opts.apiKey,
    heartbeatMs: opts.heartbeatIntervalSeconds * 1000,
    flags: opts.flags,
    capabilities: SDK_CAPABILITIES,
    sdkVersion: SDK_VERSION,
    schemaVersion: SCHEMA_VERSION,
    eventVersion: EVENT_VERSION,
    buildDate: new Date().toISOString(),
    retry: {
      base: RETRY_BASE_DELAY_MS,
      max: RETRY_MAX_DELAY_MS,
      maxAttempts: RETRY_MAX_ATTEMPTS,
    },
    batch: { maxSize: BATCH_MAX_SIZE, maxWaitMs: BATCH_MAX_WAIT_MS },
  };

  return `(function () {
  var CFG = ${JSON.stringify(cfg)};
  var API_EVENTS = CFG.apiUrl + '/events';
  var VID_KEY = '_lt_vid', SID_KEY = '_lt_sid', CID_KEY = '_lt_click', DEDUP_KEY = '_lt_sent';

  // ---- embedded pure helpers (unit-tested in Node) ----
  ${embeddedHelpers()}

  function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
    });
  }
  function now() { return Date.now(); }

  // ================= storage/ =================
  var Storage = {
    local: function (k, v) {
      if (arguments.length > 1) { safe(function () { window.localStorage.setItem(k, v); }); return v; }
      return safe(function () { return window.localStorage.getItem(k); }, null);
    },
    session: function (k, v) {
      if (arguments.length > 1) { safe(function () { window.sessionStorage.setItem(k, v); }); return v; }
      return safe(function () { return window.sessionStorage.getItem(k); }, null);
    },
    cookie: function (name, value, days) {
      if (arguments.length > 1) {
        var exp = days ? '; expires=' + new Date(now() + days * 864e5).toUTCString() : '';
        safe(function () { document.cookie = name + '=' + encodeURIComponent(value) + exp + '; path=/; SameSite=Lax'; });
        return value;
      }
      var m = safe(function () { return document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)')); }, null);
      return m ? decodeURIComponent(m[1]) : null;
    },
    idbAvailable: function () { return safe(function () { return !!window.indexedDB; }, false); }
  };

  // ================= consent/ =================
  var Consent = (function () {
    var state = { necessary: true, functional: true, analytics: true, marketing: true };
    var stored = safe(function () { return JSON.parse(Storage.local('_lt_consent') || 'null'); }, null);
    if (stored) for (var k in stored) if (state.hasOwnProperty(k)) state[k] = !!stored[k];
    return {
      set: function (obj) { for (var k in obj) if (state.hasOwnProperty(k)) state[k] = !!obj[k]; Storage.local('_lt_consent', JSON.stringify(state)); },
      get: function () { var c = {}; for (var k in state) c[k] = state[k]; return c; },
      allows: function (cat) { return !!state[cat]; }
    };
  })();

  // ================= identity/ =================
  function stickyId(storageGet, storageSet, cookieName, days) {
    var v = storageGet() || Storage.cookie(cookieName);
    if (!v) v = uuid();
    storageSet(v); Storage.cookie(cookieName, v, days);
    return v;
  }
  var Identity = (function () {
    var visitorId = stickyId(function () { return Storage.local(VID_KEY); }, function (v) { Storage.local(VID_KEY, v); }, VID_KEY, 365);
    var sessionId = stickyId(function () { return Storage.session(SID_KEY); }, function (v) { Storage.session(SID_KEY, v); }, SID_KEY, 0);
    var clickIds = safe(function () { return JSON.parse(Storage.local(CID_KEY) || '{}'); }, {});
    // sticky click IDs: merge any present in the current URL
    if (Consent.allows('marketing')) {
      var incoming = parseClickIds(window.location.search);
      var changed = false;
      for (var k in incoming) { if (clickIds[k] !== incoming[k]) { clickIds[k] = incoming[k]; changed = true; } }
      if (changed) Storage.local(CID_KEY, JSON.stringify(clickIds));
    }
    var fingerprint = null; // lazy
    function computeFp() {
      if (fingerprint || !CFG.flags.fingerprint || !Consent.allows('marketing')) return fingerprint;
      var canvas = safe(function () {
        var c = document.createElement('canvas'); var ctx = c.getContext('2d');
        ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.fillText('lt-fp', 2, 2);
        return c.toDataURL().slice(-64);
      }, '');
      fingerprint = {
        hash: computeFingerprint({
          canvas: canvas,
          timezone: safe(function () { return Intl.DateTimeFormat().resolvedOptions().timeZone; }, ''),
          screen: safe(function () { return screen.width + 'x' + screen.height; }, ''),
          platform: safe(function () { return navigator.platform; }, ''),
          language: safe(function () { return navigator.language; }, '')
        }),
        version: 1
      };
      return fingerprint;
    }
    return {
      visitorId: visitorId, sessionId: sessionId, clickIds: clickIds,
      setVisitor: function (v) { visitorId = v; Storage.local(VID_KEY, v); Storage.cookie(VID_KEY, v, 365); },
      setSession: function (v) { sessionId = v; Storage.session(SID_KEY, v); Storage.cookie(SID_KEY, v, 0); },
      fingerprint: computeFp
    };
  })();

  // ================= context/ =================
  var Context = (function () {
    var cached = null;
    function build() {
      if (cached) return cached;
      var ua = safe(function () { return navigator.userAgent; }, '');
      var b = detectBrowser(ua), o = detectOs(ua);
      var conn = safe(function () { return navigator.connection || navigator.mozConnection || navigator.webkitConnection; }, null);
      cached = {
        page: {
          landingPage: safe(function () { return Storage.session('_lt_landing') || (Storage.session('_lt_landing', window.location.href)); }, undefined),
          currentPage: window.location.href,
          title: safe(function () { return document.title; }, undefined),
          referrer: safe(function () { return document.referrer || undefined; }, undefined)
        },
        browser: {
          browser: b.browser, browserVersion: b.browserVersion,
          operatingSystem: o.operatingSystem, operatingSystemVersion: o.operatingSystemVersion,
          platform: safe(function () { return navigator.platform; }, undefined),
          userAgent: ua, deviceType: detectDeviceType(ua)
        },
        locale: {
          language: safe(function () { return navigator.language; }, undefined),
          timezone: safe(function () { return Intl.DateTimeFormat().resolvedOptions().timeZone; }, undefined)
        },
        screen: {
          width: safe(function () { return screen.width; }, undefined),
          height: safe(function () { return screen.height; }, undefined),
          colorDepth: safe(function () { return screen.colorDepth; }, undefined),
          devicePixelRatio: safe(function () { return window.devicePixelRatio; }, undefined),
          viewportWidth: safe(function () { return window.innerWidth; }, undefined),
          viewportHeight: safe(function () { return window.innerHeight; }, undefined)
        },
        device: {
          hardwareConcurrency: safe(function () { return navigator.hardwareConcurrency; }, undefined),
          deviceMemory: safe(function () { return navigator.deviceMemory; }, undefined),
          maxTouchPoints: safe(function () { return navigator.maxTouchPoints; }, undefined)
        },
        network: conn ? {
          effectiveType: conn.effectiveType, downlink: conn.downlink, rtt: conn.rtt, saveData: conn.saveData
        } : undefined
      };
      return cached;
    }
    return { build: build };
  })();

  // ================= debug/ =================
  var Metrics = { sent: 0, offline: 0, retries: 0, batches: 0, failed: 0, lastLatencyMs: 0 };
  var Hooks = (function () {
    var reg = {};
    function run(name, ctx) { var hs = reg[name]; if (!hs) return; for (var i = 0; i < hs.length; i++) safe(function () { hs[i](ctx); }); }
    return {
      on: function (name, fn) { (reg[name] = reg[name] || []).push(fn); },
      run: run
    };
  })();
  function log() { if (CFG.flags.debug && window.console) safe(function () { console.log.apply(console, ['[liberty]'].concat([].slice.call(arguments))); }); }

  // ================= transport/ =================
  var Transport = {
    sendBatch: function (events, useBeacon) {
      var body = JSON.stringify(events.length === 1 ? events[0] : { events: events });
      var url = API_EVENTS, headers = { 'Content-Type': 'application/json', 'x-api-key': CFG.apiKey };
      if (useBeacon && navigator.sendBeacon) {
        return Promise.resolve(safe(function () { return navigator.sendBeacon(url, new Blob([body], { type: 'application/json' })); }, false));
      }
      var started = now();
      return fetch(url, { method: 'POST', keepalive: true, headers: headers, body: body })
        .then(function (res) { Metrics.lastLatencyMs = now() - started; return res.json().catch(function () { return null; }); })
        .then(function (data) { syncFromResponse(data); return true; });
    }
  };

  function syncFromResponse(data) {
    if (!data) return;
    if (data.sessionId && data.sessionId !== Identity.sessionId) { Identity.setSession(data.sessionId); Identity.sessionId = data.sessionId; if (window.libertyTracker) window.libertyTracker.sessionId = data.sessionId; }
    if (data.visitorId && data.visitorId !== Identity.visitorId) { Identity.setVisitor(data.visitorId); Identity.visitorId = data.visitorId; if (window.libertyTracker) window.libertyTracker.visitorId = data.visitorId; }
  }

  // ================= queue/ (owns batch + retry + offline) =================
  var Queue = (function () {
    var buffer = [];        // pending events {event, eventId, ts}
    var oldestTs = 0;
    var flushTimer = null;
    var sentIds = safe(function () { return JSON.parse(Storage.local(DEDUP_KEY) || '{}'); }, {});
    var IDB_NAME = '_lt_offline';

    function markSent(id) { sentIds[id] = now(); Storage.local(DEDUP_KEY, JSON.stringify(sentIds)); }
    function alreadySent(id) { return !!sentIds[id]; }

    function idbPut(record) {
      if (!CFG.flags.offlineQueue || !Storage.idbAvailable()) { Metrics.offline++; return; }
      safe(function () {
        var open = window.indexedDB.open(IDB_NAME, 1);
        open.onupgradeneeded = function () { open.result.createObjectStore('q', { keyPath: 'id' }); };
        open.onsuccess = function () { safe(function () { open.result.transaction('q', 'readwrite').objectStore('q').put(record); }); };
      });
      Metrics.offline++;
    }
    function idbDrain() {
      if (!Storage.idbAvailable()) return;
      safe(function () {
        var open = window.indexedDB.open(IDB_NAME, 1);
        open.onupgradeneeded = function () { open.result.createObjectStore('q', { keyPath: 'id' }); };
        open.onsuccess = function () {
          var db = open.result, store = db.transaction('q', 'readwrite').objectStore('q'), all = store.getAll();
          all.onsuccess = function () {
            var recs = all.result || [];
            for (var i = 0; i < recs.length; i++) if (!alreadySent(recs[i].id)) enqueue(recs[i].event, recs[i].id);
            safe(function () { db.transaction('q', 'readwrite').objectStore('q').clear(); });
          };
        };
      });
    }

    function scheduleFlush() {
      if (flushTimer || !CFG.flags.batch) return;
      flushTimer = setTimeout(function () { flushTimer = null; maybeFlush(false); }, CFG.batch.maxWaitMs);
    }
    function maybeFlush(forced) {
      var doFlush = CFG.flags.batch
        ? shouldFlushBatch({ size: buffer.length, oldestAgeMs: buffer.length ? now() - oldestTs : 0, maxSize: CFG.batch.maxSize, maxWaitMs: CFG.batch.maxWaitMs, forced: forced })
        : buffer.length > 0;
      if (!doFlush) { scheduleFlush(); return; }
      flush(forced);
    }
    function flush(useBeacon) {
      if (!buffer.length) return;
      var items = buffer.splice(0, buffer.length); oldestTs = 0;
      var events = [];
      for (var i = 0; i < items.length; i++) { events.push(items[i].event); markSent(items[i].id); }
      Metrics.batches++;
      Hooks.run('beforeFlush', { batch: events });
      Transport.sendBatch(events, useBeacon).then(function () {
        Metrics.sent += events.length; Hooks.run('afterFlush', { batch: events });
      }).catch(function () {
        Hooks.run('afterFlush', { batch: events, error: true });
        for (var j = 0; j < items.length; j++) retry(items[j]);
      });
    }
    function retry(item) {
      if (!CFG.flags.retry) return;
      item.attempt = (item.attempt || 0) + 1;
      if (item.attempt > CFG.retry.maxAttempts) { Metrics.failed++; idbPut(item); return; }
      Metrics.retries++;
      Hooks.run('beforeRetry', { event: item.event, attempt: item.attempt });
      var delay = computeBackoff(item.attempt, { base: CFG.retry.base, max: CFG.retry.max });
      setTimeout(function () { delete sentIds[item.id]; enqueue(item.event, item.id, item.attempt); Hooks.run('afterRetry', { event: item.event, attempt: item.attempt }); }, delay);
    }

    function enqueue(event, id, attempt) {
      id = id || event.eventId || uuid();
      if (alreadySent(id)) { log('dedup skip', id); return; }
      if (CFG.flags.offlineQueue && navigator.onLine === false) { idbPut({ id: id, event: event }); return; }
      if (!buffer.length) oldestTs = now();
      buffer.push({ event: event, id: id, attempt: attempt || 0 });
      Hooks.run('beforeSend', { event: event });
      maybeFlush(false);
    }

    // wiring: drain offline queue when connectivity returns; flush on unload
    if (CFG.flags.offlineQueue) safe(function () { window.addEventListener('online', idbDrain); });
    safe(function () {
      window.addEventListener('pagehide', function () { flush(true); });
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
    });
    // recover anything left offline from a previous load
    idbDrain();

    return { enqueue: enqueue, flush: flush, depth: function () { return buffer.length; } };
  })();

  // ================= session/ (intelligence) =================
  safe(function () {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') log('session resume');
    });
    window.addEventListener('pageshow', function (e) { if (e.persisted) log('bfcache restore'); });
  });

  // ================= core/ =================
  function baseEvent(eventName, eventType) {
    var ev = {
      visitorId: Identity.visitorId,
      sessionId: Identity.sessionId,
      eventName: eventName,
      eventType: eventType,
      eventId: uuid(),
      sourceUrl: window.location.href,
      referrerUrl: safe(function () { return document.referrer || undefined; }, undefined),
      schemaVersion: CFG.schemaVersion,
      sdkVersion: CFG.sdkVersion,
      eventVersion: CFG.eventVersion
    };
    // attribution: utms + click IDs (respecting consent)
    if (Consent.allows('analytics')) {
      var utms = parseUtms(window.location.search);
      ev.utmSource = utms.utm_source; ev.utmMedium = utms.utm_medium; ev.utmCampaign = utms.utm_campaign;
      ev.utmTerm = utms.utm_term; ev.utmContent = utms.utm_content;
      ev.context = Context.build();
    }
    if (Consent.allows('marketing')) {
      for (var k in Identity.clickIds) ev[k] = Identity.clickIds[k];
      var fp = Identity.fingerprint();
      if (fp) { ev.fingerprintHash = fp.hash; ev.fingerprintVersion = fp.version; }
    }
    return ev;
  }

  function track(eventName, eventType, data) {
    if (!Consent.allows('analytics')) return;
    var ev = baseEvent(eventName, eventType);
    for (var key in (data || {})) if (Object.prototype.hasOwnProperty.call(data, key)) ev[key] = data[key];
    Queue.enqueue(ev);
  }
  function heartbeat() { if (CFG.flags.heartbeat) Queue.enqueue(baseEvent('Heartbeat', 'HEARTBEAT')); }
  function buildWaLink(campaignSlug) {
    var params = new URLSearchParams(); params.set('vid', Identity.visitorId);
    var utms = parseUtms(window.location.search);
    for (var k in utms) params.set(k, utms[k]);
    for (var c in Identity.clickIds) params.set(c, Identity.clickIds[c]);
    return CFG.apiUrl + '/r/wa/' + CFG.projectId + '/' + encodeURIComponent(campaignSlug) + '?' + params.toString();
  }

  window.libertyTracker = {
    track: track,
    buildWaLink: buildWaLink,
    visitorId: Identity.visitorId,
    sessionId: Identity.sessionId,
    capabilities: CFG.capabilities,
    consent: Consent,
    hooks: { on: Hooks.on },
    features: { isEnabled: function (name) { return !!CFG.flags[name]; } },
    getMetrics: function () { var m = {}; for (var k in Metrics) m[k] = Metrics[k]; return m; },
    getHealth: function () {
      return {
        queueDepth: Queue.depth(), online: safe(function () { return navigator.onLine; }, true),
        retryCount: Metrics.retries, idbAvailable: Storage.idbAvailable(),
        beaconAvailable: safe(function () { return !!navigator.sendBeacon; }, false),
        visitor: Identity.visitorId, session: Identity.sessionId
      };
    },
    getState: function () { return { sdkVersion: CFG.sdkVersion, flags: CFG.flags, consent: Consent.get() }; }
  };

  track('PageView', 'PAGE_VIEW');
  if (CFG.flags.heartbeat && CFG.heartbeatMs > 0) setInterval(heartbeat, CFG.heartbeatMs);
})();
`;
}
