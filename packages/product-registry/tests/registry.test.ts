import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ProductRegistry } from '../src/registry.js';
import { ProductRecord } from '../src/types.js';
import {
  UnknownProductError,
  DisabledProductError,
  ProductVersionMismatchError,
  UnapprovedOriginError,
  UntrustedRouteError
} from '../src/errors.js';

const require = createRequire(import.meta.url);
const crmManifest = require('../../../fixtures/crm.manifest.json');
const commerceManifest = require('../../../fixtures/commerce.manifest.json');

describe('ProductRegistry', () => {
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

  it('validates and registers CRM and Commerce manifests successfully', () => {
    const validCrm = registry.validateManifest(crmManifest);
    assert.equal(validCrm.product_id, 'dfl-crm');

    const validCommerce = registry.validateManifest(commerceManifest);
    assert.equal(validCommerce.product_id, 'dfl-commerce');
  });

  it('rejects unknown product_id', () => {
    const unknownManifest = { ...crmManifest, product_id: 'dfl-unknown' };
    assert.throws(
      () => registry.validateManifest(unknownManifest),
      UnknownProductError
    );
  });

  it('rejects disabled product', () => {
    registry.registerProductRecord({ ...crmRecord, enabled: false });
    assert.throws(
      () => registry.validateManifest(crmManifest),
      DisabledProductError
    );
  });

  it('rejects unexpected product version', () => {
    registry.registerProductRecord({ ...crmRecord, expected_product_version: '2.0.0' });
    assert.throws(
      () => registry.validateManifest(crmManifest),
      ProductVersionMismatchError
    );
  });

  it('rejects unapproved origin in standalone_url', () => {
    const unapprovedOriginManifest = {
      ...crmManifest,
      routes: [
        { route_key: 'crm.home', path: '/crm/*', standalone_url: 'https://unapproved.com:8000' },
        ...crmManifest.routes.slice(1)
      ]
    };
    assert.throws(
      () => registry.validateManifest(unapprovedOriginManifest),
      UnapprovedOriginError
    );
  });

  it('rejects untrusted route_key not in ProductRecord', () => {
    const untrustedRouteManifest = {
      ...crmManifest,
      routes: [
        { route_key: 'crm.admin_secret', path: '/crm/secret' },
        ...crmManifest.routes
      ]
    };
    assert.throws(
      () => registry.validateManifest(untrustedRouteManifest),
      UntrustedRouteError
    );
  });
});
