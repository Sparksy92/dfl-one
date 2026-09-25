import { ProductRecord, DFLProductManifest, ResolvedRoute, DFLNavItem } from './types.js';
import { ManifestValidator } from './manifest-validator.js';
import { RouteResolver } from './route-resolver.js';
import { EntitlementFilter } from './entitlement-filter.js';
import {
  UnknownProductError,
  DisabledProductError,
  UnsupportedManifestVersionError,
  ProductVersionMismatchError,
  UnapprovedOriginError,
  UntrustedRouteError
} from './errors.js';

export class ProductRegistry {
  private records: Map<string, ProductRecord> = new Map();
  private validator: ManifestValidator;
  private routeResolver: RouteResolver;
  private entitlementFilter: EntitlementFilter;

  constructor() {
    this.validator = new ManifestValidator();
    this.routeResolver = new RouteResolver();
    this.entitlementFilter = new EntitlementFilter();
  }

  public registerProductRecord(record: ProductRecord): void {
    if (!record.product_id) {
      throw new Error('ProductRecord must have a valid product_id');
    }
    if (record.manifest_version !== '1.0.0') {
      throw new UnsupportedManifestVersionError(record.manifest_version);
    }
    this.records.set(record.product_id, { ...record });
  }

  public unregisterProductRecord(productId: string): boolean {
    return this.records.delete(productId);
  }

  public getProductRecord(productId: string): ProductRecord {
    const record = this.records.get(productId);
    if (!record) {
      throw new UnknownProductError(productId);
    }
    return { ...record };
  }

  public listProductRecords(): ProductRecord[] {
    return Array.from(this.records.values()).map((r) => ({ ...r }));
  }

  public validateManifest(manifest: any): DFLProductManifest {
    // 1. JSON Schema & forbidden fields validation
    const validManifest = this.validator.validate(manifest);

    // 2. Check if product_id is registered
    const record = this.records.get(validManifest.product_id);
    if (!record) {
      throw new UnknownProductError(validManifest.product_id);
    }

    // 3. Check enabled state
    if (!record.enabled) {
      throw new DisabledProductError(validManifest.product_id);
    }

    // 4. Check ProductRecord manifest_version
    if (record.manifest_version !== '1.0.0') {
      throw new UnsupportedManifestVersionError(record.manifest_version);
    }

    // 5. Check product version matching
    if (validManifest.version !== record.expected_product_version) {
      throw new ProductVersionMismatchError(
        validManifest.product_id,
        validManifest.version,
        record.expected_product_version
      );
    }

    // 6. Validate routes and standalone origins against ProductRecord allowed_origins & trusted_route_keys
    for (const route of validManifest.routes) {
      if (!record.trusted_route_keys.includes(route.route_key)) {
        throw new UntrustedRouteError(validManifest.product_id, route.route_key);
      }

      if (route.standalone_url) {
        if (!route.standalone_url.startsWith('https://')) {
          throw new UnapprovedOriginError(validManifest.product_id, route.standalone_url);
        }
        try {
          const origin = new URL(route.standalone_url).origin;
          if (!record.allowed_origins.includes(origin)) {
            throw new UnapprovedOriginError(validManifest.product_id, origin);
          }
        } catch (err) {
          if (err instanceof UnapprovedOriginError) throw err;
          throw new UnapprovedOriginError(validManifest.product_id, route.standalone_url);
        }
      }
    }

    return validManifest;
  }

  public resolveRoute(productId: string, routeKey: string, manifest: DFLProductManifest): ResolvedRoute {
    const record = this.getProductRecord(productId);
    if (!record.enabled) {
      throw new DisabledProductError(productId);
    }
    return this.routeResolver.resolveRoute(record, manifest, routeKey);
  }

  public getVisibleNavigation(
    activeEntitlements: string[],
    validatedManifests: DFLProductManifest[]
  ): { product_id: string; items: DFLNavItem[] }[] {
    const result: { product_id: string; items: DFLNavItem[] }[] = [];

    for (const manifest of validatedManifests) {
      const record = this.records.get(manifest.product_id);
      if (!record || !record.enabled) {
        continue;
      }

      const items = this.entitlementFilter.filterNavigationItems(record, manifest, activeEntitlements);
      if (items.length > 0) {
        result.push({ product_id: manifest.product_id, items });
      }
    }

    return result;
  }
}
