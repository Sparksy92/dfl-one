import { ProductRegistry, DFLProductManifest, ResolvedRoute } from '@dfl-one/product-registry';
import { ShellUserSession, NavSection } from './types.js';
import {
  RefineProductRegistryAdapter,
  renderAugmentedWorkspaceShell,
  renderTwentyUISidebarWidget
} from './harvested-augmented-components.js';

export class DflAugmentedShell {
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

  public generateNavigationState(session: ShellUserSession): {
    sections: NavSection[];
    total_items: number;
    refine_resource_count: number;
  } {
    // 1. Get ProductRegistry visible navigation authority
    const visibleNavs = this.registry.getVisibleNavigation(
      session.active_entitlements,
      Array.from(this.manifests.values())
    );

    // 2. Refine Adapter Layer: Convert manifests to Refine Resources
    const allManifests = Array.from(this.manifests.values());
    const refineResources = RefineProductRegistryAdapter.manifestsToRefineResources(allManifests);

    // 3. Map Refine Resources back to NavSection format for twenty-ui rendering
    const allowedProductIds = visibleNavs.map((n) => n.product_id);
    const sections = RefineProductRegistryAdapter.refineResourcesToNavSections(refineResources, allowedProductIds);

    const total_items = sections.reduce((sum, s) => sum + s.items.length, 0);

    return {
      sections,
      total_items,
      refine_resource_count: refineResources.length
    };
  }

  public resolveRoute(productId: string, routeKey: string): ResolvedRoute {
    const manifest = this.manifests.get(productId);
    if (!manifest) {
      throw new Error(`Manifest for product '${productId}' has not been loaded into shell`);
    }
    return this.registry.resolveRoute(productId, routeKey, manifest);
  }

  public renderShell(session: ShellUserSession): string {
    const navState = this.generateNavigationState(session);
    return renderAugmentedWorkspaceShell(session, navState.sections, navState.refine_resource_count);
  }

  public renderHeaderWidget(title: string): string {
    return renderTwentyUISidebarWidget({ title, badgeText: 'twenty-ui' });
  }
}
