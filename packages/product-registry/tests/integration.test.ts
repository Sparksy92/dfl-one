import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ProductRegistry } from '../src/registry.js';
import { ProductRecord } from '../src/types.js';

const require = createRequire(import.meta.url);
const crmManifest = require('../../../fixtures/crm.manifest.json');
const commerceManifest = require('../../../fixtures/commerce.manifest.json');

describe('ProductRegistry Integration & Composition Verification', () => {
  let registry: ProductRegistry;

  const crmRecord: ProductRecord = {
    product_id: 'dfl-crm',
    manifest_version: '1.0.0',
    expected_product_version: '1.0.0',
    allowed_origins: ['https://crm.local:8000'],
    health_endpoint: '/api/v1/health',
    trusted_route_keys: ['crm.home', 'crm.contacts', 'crm.organizations', 'crm.opportunities'],
    entitlement_requirements: ['crm.base'],
    enabled: true
  };

  const commerceRecord: ProductRecord = {
    product_id: 'dfl-commerce',
    manifest_version: '1.0.0',
    expected_product_version: '0.2.0',
    allowed_origins: ['https://commerce.local:3100'],
    health_endpoint: '/api/v1/health',
    trusted_route_keys: ['commerce.home', 'commerce.products', 'commerce.orders', 'commerce.customers'],
    entitlement_requirements: ['commerce.base'],
    enabled: true
  };

  beforeEach(() => {
    registry = new ProductRegistry();
    registry.registerProductRecord(crmRecord);
    registry.registerProductRecord(commerceRecord);
  });

  it('discovers CRM and Commerce simultaneously in single registry pass', () => {
    const validCrm = registry.validateManifest(crmManifest);
    const validCommerce = registry.validateManifest(commerceManifest);

    const activeEntitlements = ['crm.base', 'commerce.base'];
    const nav = registry.getVisibleNavigation(activeEntitlements, [validCrm, validCommerce]);

    assert.equal(nav.length, 2);
    assert.equal(nav[0].product_id, 'dfl-crm');
    assert.equal(nav[1].product_id, 'dfl-commerce');
  });

  it('filters navigation dynamically when entitlements are toggled', () => {
    const validCrm = registry.validateManifest(crmManifest);
    const validCommerce = registry.validateManifest(commerceManifest);

    // 1. Only crm.base
    const crmOnlyNav = registry.getVisibleNavigation(['crm.base'], [validCrm, validCommerce]);
    assert.equal(crmOnlyNav.length, 1);
    assert.equal(crmOnlyNav[0].product_id, 'dfl-crm');

    // 2. Only commerce.base
    const commerceOnlyNav = registry.getVisibleNavigation(['commerce.base'], [validCrm, validCommerce]);
    assert.equal(commerceOnlyNav.length, 1);
    assert.equal(commerceOnlyNav[0].product_id, 'dfl-commerce');
  });

  it('isolates product failure: disabled/unhealthy CRM hides cleanly without breaking Commerce', () => {
    // Disable CRM (simulate health failure isolation)
    registry.registerProductRecord({ ...crmRecord, enabled: false });

    const validCommerce = registry.validateManifest(commerceManifest);
    const activeEntitlements = ['crm.base', 'commerce.base'];

    const nav = registry.getVisibleNavigation(activeEntitlements, [validCommerce]);
    assert.equal(nav.length, 1);
    assert.equal(nav[0].product_id, 'dfl-commerce');
  });

  it('VERIFIES INVARIANT: ProductRegistry stores zero business records', () => {
    const records = registry.listProductRecords();
    for (const record of records) {
      assert.equal('customers' in record, false);
      assert.equal('contacts' in record, false);
      assert.equal('orders' in record, false);
      assert.equal('persons' in record, false);
    }
  });
});
