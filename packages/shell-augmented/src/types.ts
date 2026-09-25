export interface ShellUserSession {
  user_id: string;
  active_tenant_id: string;
  active_entitlements: string[];
}

export interface NavItem {
  key: string;
  label: string;
  path: string;
}

export interface NavSection {
  product_id: string;
  product_name: string;
  items: NavItem[];
}

export interface RefineResourceConfig {
  name: string;
  list?: string;
  meta?: {
    product_id: string;
    entitlement: string;
  };
}

export interface TwentyUIWidgetProps {
  title: string;
  badgeText?: string;
  className?: string;
}
