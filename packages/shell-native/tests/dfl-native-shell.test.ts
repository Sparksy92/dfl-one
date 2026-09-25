import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ProductRegistry, ProductRecord, UntrustedRouteError, DisabledProductError } from '@dfl-one/product-registry';
import { DflNativeShell } from '../src/dfl-native-shell.js';
import { ShellUserSession } from '../src/types.js';

const require = createRequire(import.meta.url);
const crmManifest = require('../../../fixtures/crm.manifest.json');
const commerceManifest = require('../../../fixtures/commerce.manifest.json');

describe('Candidate A — DFL-Native Shell (Harvested Next.js Shell)', () => {
  let registry: ProductRegistry;
  let shell: DflNativeShell;

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

    shell = new DflNativeShell(registry);
    shell.registerManifest(crmManifest);
    shell.registerManifest(commerceManifest);
  });

  it('State 1: Both products visible when user possesses crm.base and commerce.base', () => {
    const session: ShellUserSession = {
      user_id: 'u-1',
      username: 'blair',
      email: 'blair@dfl.local',
      active_tenant_id: 't-1',
      active_entitlements: ['crm.base', 'commerce.base'],
      audience: 'staff'
    };

    const nav = shell.generateNavigationState(session);
    assert.equal(nav.sections.length, 2);
    assert.equal(nav.sections[0].product_id, 'dfl-crm');
    assert.equal(nav.sections[1].product_id, 'dfl-commerce');
    assert.equal(nav.total_items, 7); // 3 CRM items + 4 Commerce items
  });

  it('State 2: CRM only visible when user possesses crm.base only', () => {
    const session: ShellUserSession = {
      user_id: 'u-1',
      username: 'blair',
      email: 'blair@dfl.local',
      active_tenant_id: 't-1',
      active_entitlements: ['crm.base'],
      audience: 'staff'
    };

    const nav = shell.generateNavigationState(session);
    assert.equal(nav.sections.length, 1);
    assert.equal(nav.sections[0].product_id, 'dfl-crm');
    assert.equal(nav.total_items, 3);
  });

  it('State 3: Commerce only visible when user possesses commerce.base only', () => {
    const session: ShellUserSession = {
      user_id: 'u-1',
      username: 'blair',
      email: 'blair@dfl.local',
      active_tenant_id: 't-1',
      active_entitlements: ['commerce.base'],
      audience: 'staff'
    };

    const nav = shell.generateNavigationState(session);
    assert.equal(nav.sections.length, 1);
    assert.equal(nav.sections[0].product_id, 'dfl-commerce');
    assert.equal(nav.total_items, 4);
  });

  it('State 4: Neither product visible when active_entitlements is empty', () => {
    const session: ShellUserSession = {
      user_id: 'u-1',
      username: 'blair',
      email: 'blair@dfl.local',
      active_tenant_id: 't-1',
      active_entitlements: [],
      audience: 'staff'
    };

    const nav = shell.generateNavigationState(session);
    assert.equal(nav.sections.length, 0);
    assert.equal(nav.total_items, 0);
  });

  it('State 5: Disabled product isolated: disabling CRM hides CRM navigation without affecting Commerce', () => {
    registry.registerProductRecord({ ...crmRecord, enabled: false });

    const session: ShellUserSession = {
      user_id: 'u-1',
      username: 'blair',
      email: 'blair@dfl.local',
      active_tenant_id: 't-1',
      active_entitlements: ['crm.base', 'commerce.base'],
      audience: 'staff'
    };

    const nav = shell.generateNavigationState(session);
    assert.equal(nav.sections.length, 1);
    assert.equal(nav.sections[0].product_id, 'dfl-commerce');
  });

  it('State 6: Unknown route fails closed with UntrustedRouteError', () => {
    assert.throws(
      () => shell.resolveRoute('dfl-crm', 'crm.unapproved_secret'),
      UntrustedRouteError
    );
  });

  it('Resolves trusted CRM and Commerce routes cleanly', () => {
    const crmRoute = shell.resolveRoute('dfl-crm', 'crm.home');
    assert.equal(crmRoute.product_id, 'dfl-crm');
    assert.equal(crmRoute.route_key, 'crm.home');
    assert.equal(crmRoute.standalone_url, 'https://crm.local:8000');

    const commerceRoute = shell.resolveRoute('dfl-commerce', 'commerce.products');
    assert.equal(commerceRoute.product_id, 'dfl-commerce');
    assert.equal(commerceRoute.route_key, 'commerce.products');
  });

  it('Harvested Component 1: Renders GlobalSearchHeader UI pattern', () => {
    const search = shell.renderSearch('acme corp', 'crm');
    assert.equal(search.query, 'acme corp');
    assert.equal(search.target_domain, 'crm');
    assert.ok(search.placeholder_text.includes('DFL Enterprise Hub'));
  });

  it('Harvested Component 2: Renders EntitlementMatrix presentation UI', () => {
    const session: ShellUserSession = {
      user_id: 'u-1',
      username: 'blair',
      email: 'blair@dfl.local',
      active_tenant_id: 't-1',
      active_entitlements: ['crm.base'],
      audience: 'staff'
    };

    const matrix = shell.renderEntitlements(session);
    assert.equal(matrix.tenant_id, 't-1');
    assert.equal(matrix.matrix.length, 2);
    assert.equal(matrix.matrix.find((m) => m.product_id === 'dfl-crm')?.enabled, true);
    assert.equal(matrix.matrix.find((m) => m.product_id === 'dfl-commerce')?.enabled, false);
  });
});
