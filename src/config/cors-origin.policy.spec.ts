import { resolveCorsOrigin } from './cors-origin.policy';

describe('resolveCorsOrigin', () => {
  it('reflects any origin when the whitelist is empty (default behavior)', (done) => {
    const policy = resolveCorsOrigin([]);
    policy('https://random-customer-site.com', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('allows requests with no Origin header (server-to-server) when the whitelist is empty', (done) => {
    const policy = resolveCorsOrigin([]);
    policy(undefined, (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('allows a hostname present in the whitelist', (done) => {
    const policy = resolveCorsOrigin(['dashboard.libertytracker.com']);
    policy('https://dashboard.libertytracker.com', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
      done();
    });
  });

  it('rejects a hostname not present in a configured whitelist', (done) => {
    const policy = resolveCorsOrigin(['dashboard.libertytracker.com']);
    policy('https://evil.com', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(false);
      done();
    });
  });

  it('rejects a malformed origin when a whitelist is configured', (done) => {
    const policy = resolveCorsOrigin(['dashboard.libertytracker.com']);
    policy('not-a-url', (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(false);
      done();
    });
  });
});
