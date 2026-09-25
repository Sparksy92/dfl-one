import { ProductRegistry, ProductRecord, DFLProductManifest, ResolvedRoute } from '@dfl-one/product-registry';
import { ShellUserSession, ShellNavigationState, NavSection } from './types.js';
import { renderWorkspaceShellLayout, renderGlobalSearchHeader, renderEntitlementMatrix } from './harvested-components.js';

export class DflNativeShell {
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

  public generateNavigationState(session: ShellUserSession): ShellNavigationState {
    const visibleNavs = this.registry.getVisibleNavigation(
      session.active_entitlements,
      Array.from(this.manifests.values())
    );

    const sections: NavSection[] = visibleNavs.map((nav) => {
      const manifest = this.manifests.get(nav.product_id);
      return {
        product_id: nav.product_id,
        product_name: manifest?.product_name || nav.product_id,
        items: nav.items
      };
    });

    const total_items = sections.reduce((sum, s) => sum + s.items.length, 0);

    return {
      sections,
      total_items
    };
  }

  public resolveRoute(productId: string, routeKey: string): ResolvedRoute {
    const manifest = this.manifests.get(productId);
    if (!manifest) {
      throw new Error(`Manifest for product '${productId}' has not been loaded into shell`);
    }
    return this.registry.resolveRoute(productId, routeKey, manifest);
  }

  public renderShell(session: ShellUserSession) {
    const navState = this.generateNavigationState(session);
    return renderWorkspaceShellLayout(session, navState);
  }

  public renderSearch(query: string, activeDomain?: string) {
    return renderGlobalSearchHeader(query, activeDomain);
  }

  public renderEntitlements(session: ShellUserSession) {
    const availableProducts = Array.from(this.manifests.values()).map((m) => ({
      product_id: m.product_id,
      product_name: m.product_name,
      required_entitlement: m.entitlement_requirements[0] || `${m.product_id}.base`
    }));

    return renderEntitlementMatrix(session.active_tenant_id, availableProducts, session.active_entitlements);
  }
}
