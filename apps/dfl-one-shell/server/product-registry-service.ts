import { ProductRegistry, ProductRecord, DFLProductManifest, ResolvedRoute } from '@dfl-one/product-registry';
import crmManifestJson from '../../../fixtures/crm.manifest.json' with { type: 'json' };
import commerceManifestJson from '../../../fixtures/commerce.manifest.json' with { type: 'json' };

export interface ShellProductProjection {
  product_id: string;
  product_name: string;
  version: string;
  visible: boolean;
  navigation_items: Array<{
    id: string;
    label: string;
    icon: string;
    target_route: string;
    order: number;
  }>;
}

export interface ShellRouteProjection {
  product_id: string;
  route_key: string;
  path: string;
  trusted: true;
  standalone_url?: string;
  expected_product_version: string;
}

export interface RouteResolutionResponse {
  ok: boolean;
  code?: 'UNTRUSTED_ROUTE' | 'DISABLED_PRODUCT' | 'UNKNOWN_PRODUCT' | 'UNSUPPORTED_VERSION';
  message?: string;
  route?: ShellRouteProjection;
}

export class ServerProductRegistryService {
  private static instance: ServerProductRegistryService;
  private registry: ProductRegistry;
  private manifests: Map<string, DFLProductManifest> = new Map();

  private crmRecord: ProductRecord = {
    product_id: 'dfl-crm',
    manifest_version: '1.0.0',
    expected_product_version: '1.0.0',
    allowed_origins: ['https://crm.local:8000'],
    health_endpoint: '/api/v1/health',
    trusted_route_keys: ['crm.home', 'crm.contacts', 'crm.organizations', 'crm.opportunities'],
    entitlement_requirements: ['crm.base'],
    enabled: true
  };

  private commerceRecord: ProductRecord = {
    product_id: 'dfl-commerce',
    manifest_version: '1.0.0',
    expected_product_version: '0.2.0',
    allowed_origins: ['https://commerce.local:3100'],
    health_endpoint: '/api/v1/health',
    trusted_route_keys: ['commerce.home', 'commerce.products', 'commerce.orders', 'commerce.customers'],
    entitlement_requirements: ['commerce.base'],
    enabled: true
  };

  private constructor() {
    this.registry = new ProductRegistry();
    this.init();
  }

  public static getInstance(): ServerProductRegistryService {
    if (!ServerProductRegistryService.instance) {
      ServerProductRegistryService.instance = new ServerProductRegistryService();
    }
    return ServerProductRegistryService.instance;
  }

  private init() {
    this.registry.registerProductRecord(this.crmRecord);
    this.registry.registerProductRecord(this.commerceRecord);

    const crmManifest = this.registry.validateManifest(crmManifestJson as unknown as DFLProductManifest);
    const commerceManifest = this.registry.validateManifest(commerceManifestJson as unknown as DFLProductManifest);

    this.manifests.set(crmManifest.product_id, crmManifest);
    this.manifests.set(commerceManifest.product_id, commerceManifest);
  }

  public setProductEnabled(productId: string, enabled: boolean) {
    if (productId === 'dfl-crm') {
      this.crmRecord = { ...this.crmRecord, enabled };
      this.registry.registerProductRecord(this.crmRecord);
    } else if (productId === 'dfl-commerce') {
      this.commerceRecord = { ...this.commerceRecord, enabled };
      this.registry.registerProductRecord(this.commerceRecord);
    }
  }

  public getCompositionProjections(activeEntitlements: string[]): ShellProductProjection[] {
    const visibleNavs = this.registry.getVisibleNavigation(
      activeEntitlements,
      Array.from(this.manifests.values())
    );

    return visibleNavs.map((nav) => {
      const manifest = this.manifests.get(nav.product_id);
      return {
        product_id: nav.product_id,
        product_name: manifest?.product_name || nav.product_id,
        version: manifest?.version || '1.0.0',
        visible: true,
        navigation_items: nav.items
      };
    });
  }

  public resolveTrustedRoute(productId: string, routeKey: string): RouteResolutionResponse {
    const manifest = this.manifests.get(productId);
    if (!manifest) {
      return {
        ok: false,
        code: 'UNKNOWN_PRODUCT',
        message: `Product '${productId}' has not been registered in ProductRegistry`
      };
    }

    try {
      const resolved = this.registry.resolveRoute(productId, routeKey, manifest);
      return {
        ok: true,
        route: {
          product_id: resolved.product_id,
          route_key: resolved.route_key,
          path: resolved.path,
          trusted: true,
          standalone_url: resolved.standalone_url,
          expected_product_version: manifest.version
        }
      };
    } catch (err: any) {
      const errName = err?.name || '';
      if (errName === 'UntrustedRouteError') {
        return {
          ok: false,
          code: 'UNTRUSTED_ROUTE',
          message: `Route key '${routeKey}' is untrusted or unapproved for product '${productId}'`
        };
      } else if (errName === 'DisabledProductError') {
        return {
          ok: false,
          code: 'DISABLED_PRODUCT',
          message: `Product '${productId}' is currently disabled in ProductRegistry`
        };
      }
      return {
        ok: false,
        code: 'UNTRUSTED_ROUTE',
        message: err.message || 'Route resolution rejected by server trust authority'
      };
    }
  }
}
