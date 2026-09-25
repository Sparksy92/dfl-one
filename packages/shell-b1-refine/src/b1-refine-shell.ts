import { ProductRegistry, DFLProductManifest, ResolvedRoute } from '@dfl-one/product-registry';

export interface RefineResource {
  name: string;
  list?: string;
  meta?: {
    product_id: string;
    entitlement: string;
    target_route: string;
  };
}

export class RefineAdapter {
  public static toRefineResources(manifests: DFLProductManifest[]): RefineResource[] {
    const resources: RefineResource[] = [];
    for (const m of manifests) {
      for (const item of m.navigation_items) {
        resources.push({
          name: `${m.product_id}.${item.target_route}`,
          list: item.target_route,
          meta: {
            product_id: m.product_id,
            entitlement: m.entitlement_requirements[0] || `${m.product_id}.base`,
            target_route: item.target_route
          }
        });
      }
    }
    return resources;
  }
}

export class DflB1RefineShell {
  private registry: ProductRegistry;
  private manifests: Map<string, DFLProductManifest> = new Map();

  constructor(registry: ProductRegistry) {
    this.registry = registry;
  }

  public registerManifest(manifest: DFLProductManifest): DFLProductManifest {
    const validated = this.registry.validateManifest(manifest);
    this.manifests.set(validated.product_id, validated);
    return validated;
  }

  public getNavigationState(session: { active_entitlements: string[] }) {
    const visibleNavs = this.registry.getVisibleNavigation(
      session.active_entitlements,
      Array.from(this.manifests.values())
    );

    const allManifests = Array.from(this.manifests.values());
    const refineResources = RefineAdapter.toRefineResources(allManifests);

    const allowedProductIds = visibleNavs.map((n) => n.product_id);
    const filteredResources = refineResources.filter((r) =>
      r.meta?.product_id && allowedProductIds.includes(r.meta.product_id)
    );

    return {
      visibleNavs,
      refineResources: filteredResources
    };
  }

  public resolveRoute(productId: string, routeKey: string): ResolvedRoute {
    const manifest = this.manifests.get(productId);
    if (!manifest) {
      throw new Error(`Manifest for product '${productId}' has not been loaded into shell`);
    }
    return this.registry.resolveRoute(productId, routeKey, manifest);
  }
}
