import { DFLProductManifest } from '@dfl-one/product-registry';
import { NavSection, RefineResourceConfig, TwentyUIWidgetProps, ShellUserSession } from './types.js';

/**
 * Refine Framework Adapter:
 * Adapts DFLProductManifest navigation items into Refine Resource definitions
 * and reconciles Refine menu items back into DFL-One shell navigation structure.
 */
export class RefineProductRegistryAdapter {
  public static manifestsToRefineResources(manifests: DFLProductManifest[]): RefineResourceConfig[] {
    const resources: RefineResourceConfig[] = [];
    for (const manifest of manifests) {
      for (const item of manifest.navigation_items) {
        resources.push({
          name: `${manifest.product_id}.${item.target_route}`,
          list: item.target_route,
          meta: {
            product_id: manifest.product_id,
            entitlement: manifest.entitlement_requirements[0] || `${manifest.product_id}.base`
          }
        });
      }
    }
    return resources;
  }

  public static refineResourcesToNavSections(
    resources: RefineResourceConfig[],
    allowedProductIds: string[]
  ): NavSection[] {
    const sectionMap = new Map<string, NavSection>();

    for (const res of resources) {
      const productId = res.meta?.product_id;
      if (!productId || !allowedProductIds.includes(productId)) {
        continue;
      }

      if (!sectionMap.has(productId)) {
        sectionMap.set(productId, {
          product_id: productId,
          product_name: productId.toUpperCase(),
          items: []
        });
      }

      const itemKey = res.name.split('.')[1] || res.name;
      sectionMap.get(productId)!.items.push({
        key: itemKey,
        label: itemKey.charAt(0).toUpperCase() + itemKey.slice(1),
        path: res.list || '/'
      });
    }

    return Array.from(sectionMap.values());
  }
}

/**
 * twenty-ui Presentation Component Adapter:
 * Uses twenty-ui component structure and styling paradigms for DFL-One sidebar & header.
 */
export function renderTwentyUISidebarWidget(props: TwentyUIWidgetProps): string {
  return `<div class="twenty-ui-widget ${props.className || ''}">
  <div class="twenty-ui-header">
    <span class="twenty-ui-title">${props.title}</span>
    ${props.badgeText ? `<span class="twenty-ui-badge">${props.badgeText}</span>` : ''}
  </div>
</div>`;
}

export function renderAugmentedWorkspaceShell(
  session: ShellUserSession,
  sections: NavSection[],
  refineResourceCount: number
): string {
  const sidebarHtml = sections
    .map(
      (sec) => `
    <div class="twenty-ui-nav-group" data-product="${sec.product_id}">
      <div class="twenty-ui-nav-title">${sec.product_name}</div>
      ${sec.items
        .map(
          (item) => `
        <a class="twenty-ui-sidebar-item" href="${item.path}">
          <span class="twenty-ui-item-label">${item.label}</span>
        </a>
      `
        )
        .join('')}
    </div>
  `
    )
    .join('');

  return `<div class="dfl-one-augmented-shell" data-tenant="${session.active_tenant_id}" data-refine-resources="${refineResourceCount}">
  <header class="dfl-one-augmented-topbar">
    ${renderTwentyUISidebarWidget({ title: 'DFL-One Shell (Refine + twenty-ui)', badgeText: 'Augmented' })}
    <div class="user-info">${session.user_id}</div>
  </header>
  <div class="dfl-one-augmented-body">
    <aside class="dfl-one-augmented-sidebar">
      ${sidebarHtml || '<div class="empty-nav">No products available</div>'}
    </aside>
    <main class="dfl-one-augmented-main">
      <div id="product-viewport">Select product route</div>
    </main>
  </div>
</div>`;
}
