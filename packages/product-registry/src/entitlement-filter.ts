import { ProductRecord, DFLProductManifest, DFLNavItem } from './types.js';

export class EntitlementFilter {
  /**
   * Evaluates presentation visibility based on user active entitlements.
   * Returns true if user possesses all entitlement_requirements for the product.
   * 
   * CRITICAL INVARIANT: Composition visibility != Domain authorization.
   * Possessing an entitlement requirement (e.g. 'commerce.base') allows DFL-One to display
   * navigation items, but DOES NOT grant product-domain RBAC/RLS permissions.
   */
  public isProductVisible(record: ProductRecord, activeEntitlements: string[]): boolean {
    if (!record.enabled) {
      return false;
    }

    if (!record.entitlement_requirements || record.entitlement_requirements.length === 0) {
      return true;
    }

    return record.entitlement_requirements.every((req) => activeEntitlements.includes(req));
  }

  /**
   * Filters navigation items for shell presentation.
   */
  public filterNavigationItems(
    record: ProductRecord,
    manifest: DFLProductManifest,
    activeEntitlements: string[]
  ): DFLNavItem[] {
    if (!this.isProductVisible(record, activeEntitlements)) {
      return [];
    }

    // Filter items whose target_route is in trusted_route_keys
    return manifest.navigation_items.filter((item) =>
      record.trusted_route_keys.includes(item.target_route)
    );
  }
}
