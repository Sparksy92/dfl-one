export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryError';
  }
}

export class ManifestValidationError extends RegistryError {
  public errors: any[];
  constructor(message: string, errors: any[] = []) {
    super(message);
    this.name = 'ManifestValidationError';
    this.errors = errors;
  }
}

export class UnknownProductError extends RegistryError {
  constructor(productId: string) {
    super(`Unknown or unregistered product_id: '${productId}'`);
    this.name = 'UnknownProductError';
  }
}

export class UnsupportedManifestVersionError extends RegistryError {
  constructor(version: string) {
    super(`Unsupported manifest_version: '${version}'. Expected '1.0.0'.`);
    this.name = 'UnsupportedManifestVersionError';
  }
}

export class ProductVersionMismatchError extends RegistryError {
  constructor(productId: string, actual: string, expected: string) {
    super(`Product version mismatch for '${productId}': manifest version '${actual}' does not match expected '${expected}'`);
    this.name = 'ProductVersionMismatchError';
  }
}

export class UnapprovedOriginError extends RegistryError {
  constructor(productId: string, origin: string) {
    super(`Unapproved or insecure standalone_url origin '${origin}' for product '${productId}'`);
    this.name = 'UnapprovedOriginError';
  }
}

export class UntrustedRouteError extends RegistryError {
  constructor(productId: string, routeKey: string) {
    super(`Route key '${routeKey}' is untrusted or unapproved for product '${productId}'`);
    this.name = 'UntrustedRouteError';
  }
}

export class DisabledProductError extends RegistryError {
  constructor(productId: string) {
    super(`Product '${productId}' is currently disabled in the Product Registry`);
    this.name = 'DisabledProductError';
  }
}
