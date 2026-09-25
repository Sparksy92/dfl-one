import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ProductRegistry, ProductRecord, UntrustedRouteError, DisabledProductError } from '@dfl-one/product-registry';
import { DflAugmentedShell } from '../src/augmented-shell.js';

const require = createRequire(import.meta.url);
const crmManifest = require('../../../fixtures/crm.manifest.json');
const commerceManifest = require('../../../fixtures/commerce.manifest.json');

describe('Candidate B — DFL Augmented Shell (Refine + twenty-ui)', () => {
  let registry: ProductRegistry;
  let shell: DflAugmentedShell;

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

    shell = new DflAugmentedShell(registry);
    shell.registerManifest(crmManifest);
    shell.registerManifest(commerceManifest);
  });

  it('State 1: Both products visible when user possesses crm.base and commerce.base', () => {
    const session = {
      user_id: 'usr_staff_01',
      active_tenant_id: 'tenant_dfl_internal',
      active_entitlements: ['crm.base', 'commerce.base']
    };

    const navState = shell.generateNavigationState(session);
    assert.equal(navState.sections.length, 2);
    assert.equal(navState.total_items, 7);
    assert.equal(navState.refine_resource_count, 7);

    const rendered = shell.renderShell(session);
    assert.ok(rendered.includes('data-refine-resources="7"'));
    assert.ok(rendered.includes('twenty-ui-sidebar-item'));
  });

  it('State 2: CRM only visible when user possesses crm.base only', () => {
    const session = {
      user_id: 'usr_crm_only',
      active_tenant_id: 'tenant_acme',
      active_entitlements: ['crm.base']
    };

    const navState = shell.generateNavigationState(session);
    assert.equal(navState.sections.length, 1);
    assert.equal(navState.sections[0].product_id, 'dfl-crm');
    assert.equal(navState.total_items, 3);
  });

  it('State 3: Commerce only visible when user possesses commerce.base only', () => {
    const session = {
      user_id: 'usr_commerce_only',
      active_tenant_id: 'tenant_globex',
      active_entitlements: ['commerce.base']
    };

    const navState = shell.generateNavigationState(session);
    assert.equal(navState.sections.length, 1);
    assert.equal(navState.sections[0].product_id, 'dfl-commerce');
    assert.equal(navState.total_items, 4);
  });

  it('State 4: Neither product visible when active_entitlements is empty', () => {
    const session = {
      user_id: 'usr_unauthorized',
      active_tenant_id: 'tenant_acme',
      active_entitlements: []
    };

    const navState = shell.generateNavigationState(session);
    assert.equal(navState.sections.length, 0);
    assert.equal(navState.total_items, 0);
  });

  it('State 5: Disabled product isolated: disabling CRM hides CRM navigation without affecting Commerce', () => {
    registry.registerProductRecord({ ...crmRecord, enabled: false });

    const session = {
      user_id: 'usr_staff_01',
      active_tenant_id: 'tenant_dfl_internal',
      active_entitlements: ['crm.base', 'commerce.base']
    };

    const navState = shell.generateNavigationState(session);
    assert.equal(navState.sections.length, 1);
    assert.equal(navState.sections[0].product_id, 'dfl-commerce');

    assert.throws(
      () => shell.resolveRoute('dfl-crm', 'crm.home'),
      DisabledProductError
    );
  });

  it('State 6: Unknown route fails closed with UntrustedRouteError', () => {
    assert.throws(
      () => shell.resolveRoute('dfl-crm', 'crm.untrusted_admin_hack'),
      UntrustedRouteError
    );
  });

  it('Resolves trusted CRM and Commerce routes cleanly', () => {
    const crmResolved = shell.resolveRoute('dfl-crm', 'crm.home');
    assert.equal(crmResolved.product_id, 'dfl-crm');
    assert.equal(crmResolved.route_key, 'crm.home');
    assert.equal(crmResolved.standalone_url, 'https://crm.local:8000');

    const commerceResolved = shell.resolveRoute('dfl-commerce', 'commerce.home');
    assert.equal(commerceResolved.product_id, 'dfl-commerce');
    assert.equal(commerceResolved.standalone_url, 'https://commerce.local:3100');
  });

  it('Refine resource mapping and twenty-ui rendering verification', () => {
    const headerHtml = shell.renderHeaderWidget('DFL Topbar');
    assert.ok(headerHtml.includes('twenty-ui-widget'));
    assert.ok(headerHtml.includes('twenty-ui-badge'));
  });
});
