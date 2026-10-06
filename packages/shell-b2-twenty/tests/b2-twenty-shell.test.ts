import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ProductRegistry, ProductRecord } from '@dfl-one/product-registry';
import { DflB2TwentyShell, renderTwentyUISidebarPrimitive } from '../src/b2-twenty-shell.js';

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
  const shell = new DflB2TwentyShell(registry);
  shell.registerManifest(crmManifest);
  shell.registerManifest(commerceManifest);
  return shell;
}

describe('B2 Twenty shell contract', () => {
  it('filters navigation by entitlement without owning domain authorization', () => {
    const state = makeShell().getNavigationState({ active_entitlements: ['commerce.base'] });
    assert.equal(state.visibleNavs.length, 1);
    assert.equal(state.visibleNavs[0].product_id, 'dfl-commerce');
    assert.match(state.twentyWidget, /DFL-One Twenty UI/);
  });

  it('renders the harvested presentation primitive without executable authority', () => {
    const html = renderTwentyUISidebarPrimitive('DFL-One', 'B2');
    assert.match(html, /twenty-ui-primitive/);
    assert.match(html, />DFL-One</);
    assert.match(html, />B2</);
  });
});
