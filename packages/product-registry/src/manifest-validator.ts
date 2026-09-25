import Ajv2020Import from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import schema from '../../../contracts/generated/dfl-product-manifest.v1.json' with { type: 'json' };
import { DFLProductManifest } from './types.js';
import { ManifestValidationError, UnsupportedManifestVersionError } from './errors.js';

const Ajv2020 = (Ajv2020Import as any).default || Ajv2020Import;
const addFormats = (addFormatsImport as any).default || addFormatsImport;

export class ManifestValidator {
  private ajv: any;
  private validateFn: any;

  constructor() {
    // Initialize Ajv2020 for Draft 2020-12 JSON Schema compliance
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this.validateFn = this.ajv.compile(schema);
  }

  public validate(manifest: any): DFLProductManifest {
    if (!manifest || typeof manifest !== 'object') {
      throw new ManifestValidationError('Manifest must be a non-null object');
    }

    // Check version
    if (manifest.manifest_version !== '1.0.0') {
      throw new UnsupportedManifestVersionError(String(manifest.manifest_version));
    }

    // Check forbidden remote executable fields (security boundary)
    const forbiddenExecutableFields = [
      'component_entry',
      'script_url',
      'remote_entry',
      'bundle_url',
      'executable_url'
    ];

    for (const field of forbiddenExecutableFields) {
      if (field in manifest) {
        throw new ManifestValidationError(
          `Forbidden remote executable field '${field}' found in manifest. Remote script execution is prohibited.`
        );
      }
    }

    // Perform JSON Schema validation
    const valid = this.validateFn(manifest);
    if (!valid) {
      const errorMsgs = (this.validateFn.errors || []).map((e: any) => `${e.instancePath} ${e.message}`);
      throw new ManifestValidationError(
        `Manifest schema validation failed: ${errorMsgs.join('; ')}`,
        this.validateFn.errors
      );
    }

    return manifest as DFLProductManifest;
  }
}
