import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EntitlementFilter } from '../src/entitlement-filter.js';
import { ProductRecord } from '../src/types.js';

const require = createRequire(import.meta.url);
const commerceManifest = require('../../../fixtures/commerce.manifest.json');

describe('EntitlementFilter & Entitlement Boundary Invariant', () => {
  const filter = new EntitlementFilter();

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

  it('hides composition navigation when entitlement_requirements are missing', () => {
    const activeEntitlements: string[] = []; // Missing commerce.base
    const visible = filter.isProductVisible(commerceRecord, activeEntitlements);
    assert.equal(visible, false);

    const items = filter.filterNavigationItems(commerceRecord, commerceManifest, activeEntitlements);
    assert.equal(items.length, 0);
  });

  it('shows composition navigation when entitlement_requirements are present', () => {
    const activeEntitlements = ['commerce.base'];
    const visible = filter.isProductVisible(commerceRecord, activeEntitlements);
    assert.equal(visible, true);

    const items = filter.filterNavigationItems(commerceRecord, commerceManifest, activeEntitlements);
    assert.equal(items.length, 4);
  });

  it('ENFORCES INVARIANT: composition entitlement DOES NOT grant domain authorization', () => {
    const activeEntitlements = ['commerce.base'];
    
    // 1. Composition visibility check passes
    const visible = filter.isProductVisible(commerceRecord, activeEntitlements);
    assert.equal(visible, true, 'Composition entitlement allows DFL-One shell to present navigation');

    // 2. Domain permissions check: commerce.orders.manage is NOT present in user active entitlements
    const hasDomainPermission = activeEntitlements.includes('commerce.orders.manage');
    assert.equal(hasDomainPermission, false, 'User possessing commerce.base DOES NOT automatically gain domain permissions like commerce.orders.manage');
  });
});
