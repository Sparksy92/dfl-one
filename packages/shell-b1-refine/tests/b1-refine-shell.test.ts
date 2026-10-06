import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ProductRegistry, ProductRecord } from '@dfl-one/product-registry';
import { DflB1RefineShell } from '../src/b1-refine-shell.js';

const require = createRequire(import.meta.url);
const crmManifest = require('../../../fixtures/crm.manifest.json');
const commerceManifest = require('../../../fixtures/commerce.manifest.json');

const records: ProductRecord[] = [
  {
    product_id: 'dfl-crm',
    manifest_version: '1.0.0',
    expected_product_version: '1.0.0',
    allowed_origins: ['https://crm.local:8000'],
    health_endpoint: '/api/v1/readiness',
    trusted_route_keys: ['crm.home', 'crm.contacts', 'crm.organizations', 'crm.opportunities'],
    entitlement_requirements: ['crm.base'],
    enabled: true
  },
  {
    product_id: 'dfl-commerce',
    manifest_version: '1.0.0',
    expected_product_version: '0.1.0',
    allowed_origins: ['https://commerce.local:3000'],
    health_endpoint: '/api/health',
    trusted_route_keys: ['commerce.home', 'commerce.products', 'commerce.orders', 'commerce.customers'],
    entitlement_requirements: ['commerce.base'],
    enabled: true
  }
];

function makeShell() {
  const registry = new ProductRegistry();
  records.forEach((record) => registry.registerProductRecord(record));
  const shell = new DflB1RefineShell(registry);
  shell.registerManifest(crmManifest);
  shell.registerManifest(commerceManifest);
  return shell;
}

describe('B1 Refine shell contract', () => {
  it('filters resources by server-provided entitlement state', () => {
    const state = makeShell().getNavigationState({ active_entitlements: ['crm.base'] });
    assert.equal(state.visibleNavs.length, 1);
    assert.equal(state.visibleNavs[0].product_id, 'dfl-crm');
    assert.ok(state.refineResources.length > 0);
    assert.ok(state.refineResources.every((resource) => resource.meta?.product_id === 'dfl-crm'));
  });

  it('resolves only registered trusted routes', () => {
    const route = makeShell().resolveRoute('dfl-commerce', 'commerce.products');
    assert.equal(route.product_id, 'dfl-commerce');
    assert.equal(route.route_key, 'commerce.products');
  });
});
