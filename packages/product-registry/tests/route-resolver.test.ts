import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ProductRegistry } from '../src/registry.js';
import { ProductRecord } from '../src/types.js';
import { UntrustedRouteError, UnapprovedOriginError, DisabledProductError } from '../src/errors.js';

const require = createRequire(import.meta.url);
const crmManifest = require('../../../fixtures/crm.manifest.json');

describe('RouteResolver', () => {
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

  beforeEach(() => {
    registry = new ProductRegistry();
    registry.registerProductRecord(crmRecord);
  });

  it('resolves trusted route successfully', () => {
    const resolved = registry.resolveRoute('dfl-crm', 'crm.home', crmManifest);
    assert.equal(resolved.product_id, 'dfl-crm');
    assert.equal(resolved.route_key, 'crm.home');
    assert.equal(resolved.path, '/crm/*');
    assert.equal(resolved.standalone_url, 'https://crm.local:8000');
    assert.equal(resolved.allowed_origin, 'https://crm.local:8000');
  });

  it('fails closed when resolving untrusted route_key', () => {
    assert.throws(
      () => registry.resolveRoute('dfl-crm', 'crm.unapproved', crmManifest),
      UntrustedRouteError
    );
  });

  it('fails closed when resolving route for disabled product', () => {
    registry.registerProductRecord({ ...crmRecord, enabled: false });
    assert.throws(
      () => registry.resolveRoute('dfl-crm', 'crm.home', crmManifest),
      DisabledProductError
    );
  });
});
