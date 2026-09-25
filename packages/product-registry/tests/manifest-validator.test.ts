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

  it('validates populated notification_providers and dashboard_widgets schema contract', () => {
    const manifestWithProvidersAndWidgets = {
      ...crmManifest,
      notification_providers: [
        { provider_name: 'email', event_types: ['crm.person.created', 'crm.person.updated'] }
      ],
      dashboard_widgets: [
        { widget_id: 'widget-pipeline', title: 'Deal Pipeline Summary', widget_type: 'kanban_summary' }
      ]
    };

    const validated = validator.validate(manifestWithProvidersAndWidgets);
    assert.equal(validated.notification_providers.length, 1);
    assert.equal(validated.notification_providers[0].provider_name, 'email');
    assert.equal(validated.notification_providers[0].event_types[0], 'crm.person.created');
    assert.equal(validated.dashboard_widgets.length, 1);
    assert.equal(validated.dashboard_widgets[0].widget_id, 'widget-pipeline');
    assert.equal(validated.dashboard_widgets[0].widget_type, 'kanban_summary');
  });

  it('rejects malformed notification_providers (missing event_types)', () => {
    const invalid = {
      ...crmManifest,
      notification_providers: [
        { provider_name: 'email' } // missing event_types
      ]
    };
    assert.throws(
      () => validator.validate(invalid),
      ManifestValidationError
    );
  });

  it('rejects malformed dashboard_widgets (missing widget_type)', () => {
    const invalid = {
      ...crmManifest,
      dashboard_widgets: [
        { widget_id: 'w-1', title: 'Title' } // missing widget_type
      ]
    };
    assert.throws(
      () => validator.validate(invalid),
      ManifestValidationError
    );
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
