export interface ProductRecord {
  product_id: string;
  manifest_version: string;
  expected_product_version: string;
  allowed_origins: string[];
  health_endpoint: string;
  trusted_route_keys: string[];
  entitlement_requirements: string[];
  enabled: boolean;
}

export interface DFLRouteSpec {
  route_key: string;
  path: string;
  standalone_url?: string;
}

export interface DFLNavItem {
  id: string;
  label: string;
  icon: string;
  target_route: string;
  order: number;
}

export interface DFLObjectSpec {
  entity_type: string;
  display_name: string;
  canonical_id_pattern: string;
  searchable: boolean;
}

export interface DFLCommandSpec {
  command_name: string;
  endpoint: string;
  schema_url: string;
  requires_tribe_lease: boolean;
}

export interface DFLEventSpec {
  event_type: string;
  description: string;
  schema_version: string;
}

export interface DFLSearchProviderSpec {
  entity_type: string;
  projection_index: string;
  fields: string[];
}

export interface DFLNotificationSpec {
  notification_type: string;
  description: string;
}

export interface DFLJarvisToolSpec {
  tool_name: string;
  description: string;
  parameters_schema: Record<string, any>;
  read_only: boolean;
}

export interface DFLWidgetSpec {
  widget_id: string;
  title: string;
  description: string;
}

export interface DFLPermissionSpec {
  key: string;
  description: string;
}

export interface DFLProductManifest {
  manifest_version: string;
  product_id: string;
  product_name: string;
  version: string;
  description: string;
  routes: DFLRouteSpec[];
  navigation_items: DFLNavItem[];
  capabilities: string[];
  objects: DFLObjectSpec[];
  commands: DFLCommandSpec[];
  events: DFLEventSpec[];
  search_providers: DFLSearchProviderSpec[];
  notification_providers: DFLNotificationSpec[];
  ai_tools: DFLJarvisToolSpec[];
  dashboard_widgets: DFLWidgetSpec[];
  permissions: DFLPermissionSpec[];
  entitlement_requirements: string[];
  health_endpoint: string;
  [key: string]: any;
}

export interface ResolvedRoute {
  product_id: string;
  route_key: string;
  path: string;
  standalone_url?: string;
  expected_product_version: string;
  allowed_origin: string;
}
