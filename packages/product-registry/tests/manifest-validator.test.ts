import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ManifestValidator } from '../src/manifest-validator.js';
import { ManifestValidationError, UnsupportedManifestVersionError } from '../src/errors.js';

const require = createRequire(import.meta.url);
const crmManifest = require('../../../fixtures/crm.manifest.json');
const commerceManifest = require('../../../fixtures/commerce.manifest.json');

describe('ManifestValidator', () => {
  const validator = new ManifestValidator();

  it('validates a correct CRM manifest fixture', () => {
    const result = validator.validate(crmManifest);
    assert.equal(result.product_id, 'dfl-crm');
    assert.equal(result.manifest_version, '1.0.0');
  });

  it('validates a correct Commerce manifest fixture', () => {
    const result = validator.validate(commerceManifest);
    assert.equal(result.product_id, 'dfl-commerce');
    assert.equal(result.version, '0.2.0');
  });

  it('rejects malformed manifest objects', () => {
    assert.throws(
      () => validator.validate(null),
      ManifestValidationError
    );
    assert.throws(
      () => validator.validate({ product_id: 'dfl-test' }),
      UnsupportedManifestVersionError
    );
  });

  it('rejects unsupported manifest_version', () => {
    const invalid = { ...crmManifest, manifest_version: '2.0.0' };
    assert.throws(
      () => validator.validate(invalid),
      UnsupportedManifestVersionError
    );
  });

  it('rejects forbidden remote executable fields (component_entry)', () => {
    const invalid = {
      ...crmManifest,
      component_entry: 'https://evil.com/remoteEntry.js'
    };
    assert.throws(
      () => validator.validate(invalid),
      (err: any) => err instanceof ManifestValidationError && err.message.includes('component_entry')
    );
  });

  it('rejects non-HTTPS standalone_url in manifest schema', () => {
    const invalid = {
      ...crmManifest,
      routes: [
        { route_key: 'crm.home', path: '/crm/*', standalone_url: 'http://insecure.local:8000' }
      ]
    };
    assert.throws(
      () => validator.validate(invalid),
      ManifestValidationError
    );
  });
});
