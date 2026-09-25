import { ShellUserSession, ShellNavigationState, ShellSearchResult } from './types.js';

/**
 * Harvested Component 1: GlobalSearchHeader (from dfl-agency-portal/frontend/app/components/GlobalSearchHeader.tsx)
 * UI pattern for multi-domain search across DFL Enterprise.
 */
export function renderGlobalSearchHeader(query: string, activeDomain: string = 'all'): ShellSearchResult {
  return {
    query,
    target_domain: activeDomain,
    placeholder_text: 'Search DFL Enterprise Hub across CRM, Commerce, Orders, and Projects...',
    available_domains: ['all', 'crm', 'commerce', 'desk', 'projects']
  };
}

/**
 * Harvested Component 2: EntitlementMatrix (from dfl-agency-portal/frontend/app/admin/entitlements/page.tsx)
 * Presentation component rendering tenant product entitlement matrix.
 */
export function renderEntitlementMatrix(
  tenantId: string,
  availableProducts: { product_id: string; product_name: string; required_entitlement: string }[],
  activeEntitlements: string[]
): { tenant_id: string; matrix: { product_id: string; product_name: string; enabled: boolean }[] } {
  return {
    tenant_id: tenantId,
    matrix: availableProducts.map((p) => ({
      product_id: p.product_id,
      product_name: p.product_name,
      enabled: activeEntitlements.includes(p.required_entitlement)
    }))
  };
}

/**
 * Harvested Component 3: WorkspaceShell Layout Container (from dfl-agency-portal/frontend/app/admin/layout.tsx)
 * Primary DFL Operations layout container with brand logo, sidebar navigation, user session status, and mobile nav support.
 */
export function renderWorkspaceShellLayout(
  session: ShellUserSession,
  navState: ShellNavigationState
): { brand: string; audience: string; user: string; sections: number; items: number } {
  return {
    brand: 'DFL-One Enterprise Hub',
    audience: session.audience,
    user: session.username,
    sections: navState.sections.length,
    items: navState.total_items
  };
}
