import test from 'node:test';
import assert from 'node:assert/strict';

import { PortalContextEntitlementProvider } from '../../../apps/dfl-one-shell/server/entitlement-provider.ts';

test('Portal context provider fails closed when no caller credentials are present', async () => {
  const provider = new PortalContextEntitlementProvider('http://portal.invalid/api/v1/me/context');
  const entitlements = await provider.getEntitlements({});
  assert.deepEqual(entitlements, []);
});

test('Portal context provider maps only enabled authoritative apps', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal((init?.headers as Record<string, string>)?.Authorization, 'Bearer test-token');
    return new Response(JSON.stringify({
      organization: { id: 'tenant-a' },
      user: { id: 'user-a' },
      apps: {
        crm: { enabled: true },
        commerce: { enabled: false },
        desk: { enabled: true }
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  try {
    const provider = new PortalContextEntitlementProvider('http://portal.internal/api/v1/me/context');
    const entitlements = await provider.getEntitlements({ authorization: 'Bearer test-token' });
    assert.deepEqual(entitlements, ['crm.base']);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('Portal context provider fails closed on upstream failure', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('portal unavailable');
  }) as typeof fetch;

  try {
    const provider = new PortalContextEntitlementProvider('http://portal.internal/api/v1/me/context');
    const entitlements = await provider.getEntitlements({ cookie: '_auth_token=test' });
    assert.deepEqual(entitlements, []);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
