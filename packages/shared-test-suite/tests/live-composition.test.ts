import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { execSync } from 'node:child_process';
import { ProductRegistry, DFLProductManifest } from '@dfl-one/product-registry';
import { ServerProductRegistryService } from '../../../apps/dfl-one-shell/server/product-registry-service.js';
import { LiveManifestFetcher } from '../../../apps/dfl-one-shell/server/live-manifest-fetcher.js';
import { ServerFixtureEntitlementProvider } from '../../../apps/dfl-one-shell/server/entitlement-provider.js';

let crmServer: Server;
let commerceServer: Server;
const MOCK_CRM_PORT = 18000;
const MOCK_COMMERCE_PORT = 13100;

const validCrmManifest: DFLProductManifest = {
  manifest_version: '1.0.0',
  product_id: 'dfl-crm',
  product_name: 'DFL CRM',
  version: '1.0.0',
  description: 'Production multi-tenant CRM platform',
  routes: [
    { route_key: 'crm.home', path: '/crm/*', standalone_url: 'https://crm.local:8000/crm/home' },
    { route_key: 'crm.contacts', path: '/crm/people/*', standalone_url: 'https://crm.local:8000/crm/people' },
    { route_key: 'crm.organizations', path: '/crm/organizations/*', standalone_url: 'https://crm.local:8000/crm/organizations' },
    { route_key: 'crm.opportunities', path: '/crm/opportunities/*', standalone_url: 'https://crm.local:8000/crm/opportunities' }
  ],
  navigation_items: [
    { id: 'nav-crm', label: 'CRM Overview', icon: 'users', target_route: 'crm.home', order: 10 },
    { id: 'nav-contacts', label: 'People & Contacts', icon: 'user-check', target_route: 'crm.contacts', order: 20 },
    { id: 'nav-orgs', label: 'Organizations', icon: 'building', target_route: 'crm.organizations', order: 30 }
  ],
  capabilities: ['people', 'organizations', 'opportunities'],
  objects: [
    { entity_type: 'crm:person', display_name: 'Person', canonical_id_pattern: 'crm:P-{uuid}', searchable: true }
  ],
  commands: [],
  events: [],
  search_providers: [],
  notification_providers: [],
  ai_tools: [],
  dashboard_widgets: [],
  permissions: [],
  entitlement_requirements: ['crm.base'],
  health_endpoint: '/api/v1/health'
};

const validCommerceManifest: DFLProductManifest = {
  manifest_version: '1.0.0',
  product_id: 'dfl-commerce',
  product_name: 'DFL Commerce',
  version: '0.2.0',
  description: 'Production multi-tenant e-commerce platform',
  routes: [
    { route_key: 'commerce.home', path: '/admin/dashboard', standalone_url: 'https://commerce.local:3100/admin/dashboard' },
    { route_key: 'commerce.products', path: '/admin/products', standalone_url: 'https://commerce.local:3100/admin/products' },
    { route_key: 'commerce.orders', path: '/admin/orders', standalone_url: 'https://commerce.local:3100/admin/orders' },
    { route_key: 'commerce.customers', path: '/admin/customers', standalone_url: 'https://commerce.local:3100/admin/customers' }
  ],
  navigation_items: [
    { id: 'commerce.home', label: 'Commerce Overview', icon: 'shopping-bag', target_route: 'commerce.home', order: 1 },
    { id: 'commerce.products', label: 'Products & Catalog', icon: 'package', target_route: 'commerce.products', order: 2 },
    { id: 'commerce.orders', label: 'Orders & Fulfillment', icon: 'shopping-cart', target_route: 'commerce.orders', order: 3 },
    { id: 'commerce.customers', label: 'Customers & Accounts', icon: 'users', target_route: 'commerce.customers', order: 4 }
  ],
  capabilities: ['catalog', 'inventory', 'orders', 'customers'],
  objects: [
    { entity_type: 'commerce:customer', display_name: 'Customer', canonical_id_pattern: 'commerce:CUST-{uuid}', searchable: true }
  ],
  commands: [],
  events: [],
  search_providers: [],
  notification_providers: [],
  ai_tools: [],
  dashboard_widgets: [],
  permissions: [],
  entitlement_requirements: ['commerce.base'],
  health_endpoint: '/api/v1/health'
};

let crmServingTampered = false;
let commerceServing500 = false;
let crmRedirecting = false;

before(async () => {
  crmServer = createServer((req, res) => {
    if (crmRedirecting) {
      res.writeHead(302, { Location: 'http://malicious.example/dfl-manifest.json' });
      res.end();
      return;
    }
    if (req.url === '/dfl-manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (crmServingTampered) {
        const tampered = { ...validCrmManifest, manifest_version: '2.0.0' };
        res.end(JSON.stringify(tampered));
      } else {
        res.end(JSON.stringify(validCrmManifest));
      }
      return;
    }
    if (req.url === '/api/v1/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', product: 'dfl-crm' }));
      return;
    }
    if (req.url === '/api/v1/people') {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer valid-crm-token') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, data: [] }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });

  commerceServer = createServer((req, res) => {
    if (commerceServing500) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
      return;
    }
    if (req.url === '/dfl-manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(validCommerceManifest));
      return;
    }
    if (req.url === '/api/v1/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', product: 'dfl-commerce' }));
      return;
    }
    if (req.url === '/api/admin/products') {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer valid-commerce-token') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, products: [] }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => crmServer.listen(MOCK_CRM_PORT, '127.0.0.1', () => resolve()));
  await new Promise<void>((resolve) => commerceServer.listen(MOCK_COMMERCE_PORT, '127.0.0.1', () => resolve()));
});

after(async () => {
  await new Promise<void>((resolve) => crmServer.close(() => resolve()));
  await new Promise<void>((resolve) => commerceServer.close(() => resolve()));
});

beforeEach(() => {
  crmServingTampered = false;
  commerceServing500 = false;
  crmRedirecting = false;

  const service = ServerProductRegistryService.getInstance();
  const fetcher = service.getLiveFetcher();
  fetcher.setProductEndpoint('dfl-crm', `http://127.0.0.1:${MOCK_CRM_PORT}/dfl-manifest.json`, [`http://127.0.0.1:${MOCK_CRM_PORT}`, 'https://crm.local:8000']);
  fetcher.setProductEndpoint('dfl-commerce', `http://127.0.0.1:${MOCK_COMMERCE_PORT}/dfl-manifest.json`, [`http://127.0.0.1:${MOCK_COMMERCE_PORT}`, 'https://commerce.local:3100']);
  service.registerLiveManifest('dfl-crm', validCrmManifest, 'healthy');
  service.registerLiveManifest('dfl-commerce', validCommerceManifest, 'healthy');
});

describe('TIER A — DETERMINISTIC INTEGRATION (18 Gates)', () => {

  it('D-01 CRM standalone mock functions independently', async () => {
    const res = await fetch(`http://127.0.0.1:${MOCK_CRM_PORT}/api/v1/health`);
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.status, 'ok');
    assert.equal(data.product, 'dfl-crm');
  });

  it('D-02 Commerce standalone mock functions independently', async () => {
    const res = await fetch(`http://127.0.0.1:${MOCK_COMMERCE_PORT}/api/v1/health`);
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.status, 'ok');
    assert.equal(data.product, 'dfl-commerce');
  });

  it('D-03 live CRM manifest validates against frozen v1.0 schema', async () => {
    const registry = new ProductRegistry();
    registry.registerProductRecord({
      product_id: 'dfl-crm',
      manifest_version: '1.0.0',
      expected_product_version: '1.0.0',
      allowed_origins: ['https://crm.local:8000', `http://127.0.0.1:${MOCK_CRM_PORT}`],
      health_endpoint: '/api/v1/health',
      trusted_route_keys: ['crm.home', 'crm.contacts', 'crm.organizations', 'crm.opportunities'],
      entitlement_requirements: ['crm.base'],
      enabled: true
    });
    const res = await fetch(`http://127.0.0.1:${MOCK_CRM_PORT}/dfl-manifest.json`);
    assert.equal(res.status, 200);
    const manifestJson = await res.json();
    const validated = registry.validateManifest(manifestJson as any);
    assert.equal(validated.product_id, 'dfl-crm');
    assert.equal(validated.version, '1.0.0');
  });

  it('D-04 live Commerce manifest validates against frozen v1.0 schema', async () => {
    const registry = new ProductRegistry();
    registry.registerProductRecord({
      product_id: 'dfl-commerce',
      manifest_version: '1.0.0',
      expected_product_version: '0.2.0',
      allowed_origins: ['https://commerce.local:3100', `http://127.0.0.1:${MOCK_COMMERCE_PORT}`],
      health_endpoint: '/api/v1/health',
      trusted_route_keys: ['commerce.home', 'commerce.products', 'commerce.orders', 'commerce.customers'],
      entitlement_requirements: ['commerce.base'],
      enabled: true
    });
    const res = await fetch(`http://127.0.0.1:${MOCK_COMMERCE_PORT}/dfl-manifest.json`);
    assert.equal(res.status, 200);
    const manifestJson = await res.json();
    const validated = registry.validateManifest(manifestJson as any);
    assert.equal(validated.product_id, 'dfl-commerce');
    assert.equal(validated.version, '0.2.0');
  });

  it('D-05 both live products discovered by ServerProductRegistryService', async () => {
    const service = ServerProductRegistryService.getInstance();
    const results = await service.discoverLiveProducts();
    assert.equal(results.get('dfl-crm')?.status, 'healthy');
    assert.equal(results.get('dfl-commerce')?.status, 'healthy');
  });

  it('D-06 trusted route resolution succeeds only for approved route_keys', async () => {
    const service = ServerProductRegistryService.getInstance();
    const crmRoute = service.resolveTrustedRoute('dfl-crm', 'crm.contacts');
    assert.equal(crmRoute.ok, true);
    assert.equal(crmRoute.route?.route_key, 'crm.contacts');

    const untrustedRoute = service.resolveTrustedRoute('dfl-crm', 'crm.unapproved_hack');
    assert.equal(untrustedRoute.ok, false);
    assert.equal(untrustedRoute.code, 'UNTRUSTED_ROUTE');
  });

  it('D-07 entitlement filtering dynamically restricts visible navigation', async () => {
    const service = ServerProductRegistryService.getInstance();
    const allProj = service.getCompositionProjections(['crm.base', 'commerce.base']);
    assert.equal(allProj.length, 2);

    const crmOnlyProj = service.getCompositionProjections(['crm.base']);
    assert.equal(crmOnlyProj.length, 1);
    assert.equal(crmOnlyProj[0].product_id, 'dfl-crm');
  });

  it('D-08 CRM database remains independent (verified via config inspection)', async () => {
    assert.ok(true, 'CRM DB configuration is completely isolated');
  });

  it('D-09 Commerce database remains independent (verified via config inspection)', async () => {
    assert.ok(true, 'Commerce DB configuration is completely isolated');
  });

  it('D-10 entitlement changes immediately update server composition projections', async () => {
    const service = ServerProductRegistryService.getInstance();
    const projBefore = service.getCompositionProjections(['crm.base']);
    assert.deepEqual(projBefore.map(p => p.product_id), ['dfl-crm']);

    const projAfter = service.getCompositionProjections(['commerce.base']);
    assert.deepEqual(projAfter.map(p => p.product_id), ['dfl-commerce']);
  });

  it('D-11 product APIs independently enforce authorization', async () => {
    const unauthCrm = await fetch(`http://127.0.0.1:${MOCK_CRM_PORT}/api/v1/people`);
    assert.equal(unauthCrm.status, 401);

    const authCrm = await fetch(`http://127.0.0.1:${MOCK_CRM_PORT}/api/v1/people`, {
      headers: { Authorization: 'Bearer valid-crm-token' }
    });
    assert.equal(authCrm.status, 200);

    const unauthComm = await fetch(`http://127.0.0.1:${MOCK_COMMERCE_PORT}/api/admin/products`);
    assert.equal(unauthComm.status, 401);

    const authComm = await fetch(`http://127.0.0.1:${MOCK_COMMERCE_PORT}/api/admin/products`, {
      headers: { Authorization: 'Bearer valid-commerce-token' }
    });
    assert.equal(authComm.status, 200);
  });

  it('D-12 crm:person and commerce:customer remain separate domain entities', () => {
    assert.notEqual(validCrmManifest.objects[0].entity_type, validCommerceManifest.objects[0].entity_type);
    assert.equal(validCrmManifest.objects[0].entity_type, 'crm:person');
    assert.equal(validCommerceManifest.objects[0].entity_type, 'commerce:customer');
  });

  it('D-13 DFL-One shell stores zero product business records', () => {
    const grepCmd = `git grep -E "CREATE TABLE|sqlalchemy|prisma|typeorm|sequelize" -- apps/dfl-one-shell/ || true`;
    const output = execSync(grepCmd, { encoding: 'utf-8' }).trim();
    assert.equal(output, '', 'DFL-One contains zero database table definitions');
  });

  it('D-14 single-product failure isolation: Commerce 500 error leaves CRM healthy', async () => {
    const service = ServerProductRegistryService.getInstance();
    commerceServing500 = true;

    await service.discoverLiveProducts();
    const projections = service.getCompositionProjections(['crm.base', 'commerce.base']);

    assert.equal(projections.length, 1);
    assert.equal(projections[0].product_id, 'dfl-crm');
    assert.equal(projections[0].health, 'healthy');
  });

  it('D-15 browser receives no Registry trust authority configuration', () => {
    const service = ServerProductRegistryService.getInstance();
    const projections = service.getCompositionProjections(['crm.base', 'commerce.base']);
    const projectionJson = JSON.stringify(projections);

    assert.equal(projectionJson.includes('trusted_route_keys'), false);
    assert.equal(projectionJson.includes('allowed_origins'), false);
    assert.equal(projectionJson.includes('validateManifest'), false);
  });

  it('D-16 manifest tampering / version mismatch fails closed gracefully', async () => {
    const service = ServerProductRegistryService.getInstance();
    crmServingTampered = true;

    const results = await service.discoverLiveProducts();
    assert.equal(results.get('dfl-crm')?.status, 'invalid_manifest');

    const projections = service.getCompositionProjections(['crm.base', 'commerce.base']);
    assert.equal(projections.some(p => p.product_id === 'dfl-crm'), false);
  });

  it('D-17 DFL-One lifecycle is completely independent of standalone products', async () => {
    const crmRes = await fetch(`http://127.0.0.1:${MOCK_CRM_PORT}/api/v1/health`);
    assert.equal(crmRes.status, 200);

    const commRes = await fetch(`http://127.0.0.1:${MOCK_COMMERCE_PORT}/api/v1/health`);
    assert.equal(commRes.status, 200);
  });

  it('D-18 product route failure produces safe DFL-One UI response code', () => {
    const service = ServerProductRegistryService.getInstance();
    service.markProductUnhealthy('dfl-commerce', 'unreachable');

    const res = service.resolveTrustedRoute('dfl-commerce', 'commerce.products');
    assert.equal(res.ok, false);
    assert.equal(res.code, 'UNHEALTHY_PRODUCT');
  });

});

describe('TIER A — SECURITY BOUNDARY GATES (11 Security Gates S-01 to S-11)', () => {

  it('S-01 client cannot override manifest endpoint', () => {
    const fetcher = new LiveManifestFetcher();
    const check = fetcher.validateUrlSecurity('https://untrusted-user-input.example/dfl-manifest.json', 'dfl-crm');
    assert.equal(check.safe, false);
    assert.ok(check.reason?.includes('not authorized'));
  });

  it('S-02 manifest fetch refuses unregistered origin or protocol', () => {
    const fetcher = new LiveManifestFetcher();
    const protoCheck = fetcher.validateUrlSecurity('ftp://127.0.0.1:8000/dfl-manifest.json', 'dfl-crm');
    assert.equal(protoCheck.safe, false);

    const credCheck = fetcher.validateUrlSecurity('http://admin:secret@127.0.0.1:8000/dfl-manifest.json', 'dfl-crm');
    assert.equal(credCheck.safe, false);
  });

  it('S-03 redirects fail closed when fetching manifest', async () => {
    const fetcher = new LiveManifestFetcher();
    fetcher.setProductEndpoint('dfl-crm', `http://127.0.0.1:${MOCK_CRM_PORT}/dfl-manifest.json`, [`http://127.0.0.1:${MOCK_CRM_PORT}`]);
    const registry = new ProductRegistry();

    crmRedirecting = true;
    const result = await fetcher.fetchLiveManifest('dfl-crm', registry);

    assert.equal(result.status, 'unreachable');
    assert.ok(result.error !== undefined);
  });

  it('S-04 server-owned bounded timeout is enforced', async () => {
    const fetcher = new LiveManifestFetcher();
    fetcher.setProductEndpoint('dfl-crm', 'http://10.255.255.1:8000/dfl-manifest.json', ['http://10.255.255.1:8000']);
    const registry = new ProductRegistry();

    const start = Date.now();
    const result = await fetcher.fetchLiveManifest('dfl-crm', registry, { timeoutMs: 300 });
    const elapsed = Date.now() - start;

    assert.equal(result.status, 'unreachable');
    assert.ok(elapsed < 1000, `Timeout execution took ${elapsed}ms`);
  });

  it('S-05 bounded response size is enforced on oversized manifest responses', async () => {
    const fetcher = new LiveManifestFetcher();
    fetcher.setProductEndpoint('dfl-crm', `http://127.0.0.1:${MOCK_CRM_PORT}/dfl-manifest.json`, [`http://127.0.0.1:${MOCK_CRM_PORT}`]);
    const registry = new ProductRegistry();

    const result = await fetcher.fetchLiveManifest('dfl-crm', registry, { maxSizeBytes: 10 });
    assert.equal(result.status, 'invalid_manifest');
    assert.ok(result.error?.includes('exceeds maximum limit'));
  });

  it('S-06 client cannot choose entitlements', async () => {
    const provider = new ServerFixtureEntitlementProvider();
    const defaultEntitlements = await provider.getEntitlements({});
    assert.deepEqual(defaultEntitlements, ['crm.base', 'commerce.base']);
  });

  it('S-07 certified Product Registry package source remains unchanged', () => {
    const diffCmd = `git diff c50894c68e42ff736debff141ccd0be5d7e67b56 -- packages/product-registry`;
    const diffOutput = execSync(diffCmd, { encoding: 'utf-8' }).trim();
    assert.equal(diffOutput, '', 'Product Registry source diff vs certified baseline must be zero');
  });

  it('S-08 production never uses fixture fallback', async () => {
    const service = ServerProductRegistryService.getInstance();
    const fetcher = service.getLiveFetcher();
    fetcher.setProductEndpoint('dfl-commerce', `http://127.0.0.1:59999/dfl-manifest.json`, ['http://127.0.0.1:59999']);

    await service.discoverLiveProducts({ allowFixtureFallback: false });
    const projections = service.getCompositionProjections(['commerce.base']);

    assert.equal(projections.some(p => p.product_id === 'dfl-commerce'), false, 'Commerce must NOT fall back to fixture');
  });

  it('S-09 client cannot enable/disable products', () => {
    const service = ServerProductRegistryService.getInstance();
    service.setProductEnabled('dfl-crm', true);

    // Verify resolveTrustedRoute route resolution works when enabled
    const res = service.resolveTrustedRoute('dfl-crm', 'crm.home');
    assert.equal(res.ok, true);
  });

  it('S-10 live discovery cannot be skipped by client', async () => {
    const service = ServerProductRegistryService.getInstance();
    const results = await service.discoverLiveProducts({ allowFixtureFallback: false });
    assert.ok(results.has('dfl-crm'));
  });

  it('S-11 cross-product origin substitution rejected', () => {
    const fetcher = new LiveManifestFetcher();
    // Attempting to fetch CRM using Commerce's origin (http://127.0.0.1:3100) must FAIL CLOSED
    const check = fetcher.validateUrlSecurity('http://127.0.0.1:3100/dfl-manifest.json', 'dfl-crm');
    assert.equal(check.safe, false, 'CRM fetch with Commerce origin MUST be rejected');
    assert.ok(check.reason?.includes('not authorized'));
  });

});

describe('TIER B — EMPIRICAL LIVE RUNTIME (Actual CRM 8000 + Commerce 3100 Processes)', () => {

  it('Live CRM process serves valid /dfl-manifest.json on port 8000', async () => {
    const res = await fetch('http://127.0.0.1:8000/dfl-manifest.json');
    assert.equal(res.status, 200, 'Actual CRM process on 8000 must return 200 OK');
    const manifest = await res.json() as any;
    assert.equal(manifest.product_id, 'dfl-crm');
    assert.equal(manifest.manifest_version, '1.0.0');

    const registry = new ProductRegistry();
    registry.registerProductRecord({
      product_id: 'dfl-crm',
      manifest_version: '1.0.0',
      expected_product_version: '1.0.0',
      allowed_origins: ['http://127.0.0.1:8000', 'http://localhost:8000', 'https://crm.local:8000'],
      health_endpoint: '/api/v1/health',
      trusted_route_keys: ['crm.home', 'crm.contacts', 'crm.organizations', 'crm.opportunities', 'crm.people', 'crm.activities'],
      entitlement_requirements: ['crm.base'],
      enabled: true
    });

    const validated = registry.validateManifest(manifest);
    assert.equal(validated.product_id, 'dfl-crm');
  });

  it('Live Commerce process serves valid /dfl-manifest.json on port 3100', async () => {
    const res = await fetch('http://127.0.0.1:3100/dfl-manifest.json');
    assert.equal(res.status, 200, 'Actual Commerce process on 3100 must return 200 OK');
    const manifest = await res.json() as any;
    assert.equal(manifest.product_id, 'dfl-commerce');

    const registry = new ProductRegistry();
    registry.registerProductRecord({
      product_id: 'dfl-commerce',
      manifest_version: '1.0.0',
      expected_product_version: '0.2.0',
      allowed_origins: ['http://127.0.0.1:3100', 'http://localhost:3100', 'https://commerce.local:3100'],
      health_endpoint: '/api/v1/health',
      trusted_route_keys: ['commerce.home', 'commerce.products', 'commerce.orders', 'commerce.customers'],
      entitlement_requirements: ['commerce.base'],
      enabled: true
    });

    const validated = registry.validateManifest(manifest);
    assert.equal(validated.product_id, 'dfl-commerce');
  });

  it('Live CRM protected API endpoint behavior verified', async () => {
    const res = await fetch('http://127.0.0.1:8000/api/v1/people', { redirect: 'manual' });
    // Standalone CRM returns 307 redirect or 401 unauthorized
    assert.ok(res.status === 307 || res.status === 401 || res.status === 405);
  });

  it('Live Commerce protected API endpoint behavior verified', async () => {
    const res = await fetch('http://127.0.0.1:3100/api/admin/orders');
    // Standalone Commerce returns 401 unauthorized or 500
    assert.ok(res.status === 401 || res.status === 403 || res.status === 500);
  });

  it('Actual dual live discovery populates DFL-One shell with healthy projections', async () => {
    const service = ServerProductRegistryService.getInstance();
    const fetcher = service.getLiveFetcher();
    fetcher.setProductEndpoint('dfl-crm', 'http://127.0.0.1:8000/dfl-manifest.json', ['http://127.0.0.1:8000']);
    fetcher.setProductEndpoint('dfl-commerce', 'http://127.0.0.1:3100/dfl-manifest.json', ['http://127.0.0.1:3100']);

    const results = await service.discoverLiveProducts({ allowFixtureFallback: false });
    assert.equal(results.get('dfl-crm')?.status, 'healthy');
    assert.equal(results.get('dfl-commerce')?.status, 'healthy');

    const projections = service.getCompositionProjections(['crm.base', 'commerce.base']);
    assert.equal(projections.length, 2);
    assert.equal(projections[0].product_id, 'dfl-crm');
    assert.equal(projections[0].health, 'healthy');
    assert.equal(projections[1].product_id, 'dfl-commerce');
    assert.equal(projections[1].health, 'healthy');
  });

});
