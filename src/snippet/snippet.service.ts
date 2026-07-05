import { Injectable, NotFoundException } from '@nestjs/common';
import { EncryptionService } from '../crypto/encryption.service';
import { PrismaService } from '../prisma/prisma.service';

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
    return buildSnippet({ apiUrl, projectId, apiKey });
  }
}

function buildSnippet(opts: {
  apiUrl: string;
  projectId: string;
  apiKey: string;
}): string {
  return `(function () {
  var API_URL = ${JSON.stringify(opts.apiUrl)};
  var PROJECT_ID = ${JSON.stringify(opts.projectId)};
  var API_KEY = ${JSON.stringify(opts.apiKey)};
  var VID_KEY = '_lt_vid';
  var UTM_KEY = '_lt_utm';

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function getVisitorId() {
    var stored = null;
    try {
      stored = window.localStorage.getItem(VID_KEY);
    } catch (e) {}
    if (!stored) stored = getCookie(VID_KEY);
    if (!stored) {
      stored = uuid();
    }
    try {
      window.localStorage.setItem(VID_KEY, stored);
    } catch (e) {}
    setCookie(VID_KEY, stored, 365);
    return stored;
  }

  function readQueryParams() {
    var params = new URLSearchParams(window.location.search);
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    var found = {};
    var hasAny = false;
    for (var i = 0; i < keys.length; i++) {
      var value = params.get(keys[i]);
      if (value) {
        found[keys[i]] = value;
        hasAny = true;
      }
    }
    return hasAny ? found : null;
  }

  function getUtms() {
    var fromQuery = readQueryParams();
    if (fromQuery) {
      try {
        window.localStorage.setItem(UTM_KEY, JSON.stringify(fromQuery));
      } catch (e) {}
      return fromQuery;
    }
    try {
      var stored = window.localStorage.getItem(UTM_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  }

  var visitorId = getVisitorId();
  var utms = getUtms();

  function send(body) {
    var payload = JSON.stringify(body);
    try {
      fetch(API_URL + '/events', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: payload,
      });
    } catch (e) {}
  }

  function track(eventName, eventType, data) {
    var body = {
      visitorId: visitorId,
      eventName: eventName,
      eventType: eventType,
      sourceUrl: window.location.href,
      referrerUrl: document.referrer || undefined,
      utmSource: utms.utm_source,
      utmMedium: utms.utm_medium,
      utmCampaign: utms.utm_campaign,
      utmTerm: utms.utm_term,
      utmContent: utms.utm_content,
      fbclid: utms.fbclid,
      gclid: utms.gclid,
    };
    for (var key in data || {}) {
      if (Object.prototype.hasOwnProperty.call(data, key)) body[key] = data[key];
    }
    send(body);
  }

  function buildWaLink(campaignSlug) {
    var params = new URLSearchParams();
    params.set('vid', visitorId);
    var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    for (var i = 0; i < utmKeys.length; i++) {
      if (utms[utmKeys[i]]) params.set(utmKeys[i], utms[utmKeys[i]]);
    }
    return API_URL + '/r/wa/' + PROJECT_ID + '/' + encodeURIComponent(campaignSlug) + '?' + params.toString();
  }

  window.libertyTracker = { track: track, buildWaLink: buildWaLink, visitorId: visitorId };

  track('PageView', 'PAGE_VIEW');
})();
`;
}
