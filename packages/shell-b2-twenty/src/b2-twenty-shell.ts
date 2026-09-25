import { ProductRegistry, DFLProductManifest, ResolvedRoute } from '@dfl-one/product-registry';

export function renderTwentyUISidebarPrimitive(title: string, badge?: string) {
  return `<div class="twenty-ui-primitive" data-widget="sidebar-header">
  <span class="twenty-title">${title}</span>
  ${badge ? `<span class="twenty-badge">${badge}</span>` : ''}
</div>`;
}

export class DflB2TwentyShell {
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

    const widgetHtml = renderTwentyUISidebarPrimitive('DFL-One Twenty UI', 'B2-Twenty');

    return {
      visibleNavs,
      twentyWidget: widgetHtml
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
