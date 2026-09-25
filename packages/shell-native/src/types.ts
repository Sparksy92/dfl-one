import { DFLNavItem, ResolvedRoute } from '@dfl-one/product-registry';

export type WorkspaceAudience = 'staff' | 'customer' | 'standalone';

export interface ShellUserSession {
  user_id: string;
  username: string;
  email: string;
  active_tenant_id: string;
  active_entitlements: string[];
  audience: WorkspaceAudience;
}

export interface NavSection {
  product_id: string;
  product_name: string;
  items: DFLNavItem[];
}

export interface ShellNavigationState {
  sections: NavSection[];
  total_items: number;
}

export interface ShellSearchResult {
  query: string;
  target_domain?: string;
  placeholder_text: string;
  available_domains: string[];
}
