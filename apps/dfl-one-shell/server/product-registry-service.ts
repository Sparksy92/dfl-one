import { ProductRegistry, ProductRecord, DFLProductManifest } from '@dfl-one/product-registry';
import { LiveManifestFetcher, LiveManifestResult, ManifestFetchStatus } from './live-manifest-fetcher';
import { ServerFixtureEntitlementProvider, EntitlementContext } from './entitlement-provider';
import crmManifestJson from '../../../fixtures/crm.manifest.json' with { type: 'json' };
import commerceManifestJson from '../../../fixtures/commerce.manifest.json' with { type: 'json' };

export interface ShellProductProjection {
  product_id: string;
  product_name: string;
  version: string;
  visible: boolean;
  health: ManifestFetchStatus;
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
  code?: 'UNTRUSTED_ROUTE' | 'DISABLED_PRODUCT' | 'UNKNOWN_PRODUCT' | 'UNSUPPORTED_VERSION' | 'UNHEALTHY_PRODUCT';
  message?: string;
  route?: ShellRouteProjection;
}

export class ServerProductRegistryService {
  private static instance: ServerProductRegistryService;
  private registry: ProductRegistry;
  private manifests: Map<string, DFLProductManifest> = new Map();
  private healthStatuses: Map<string, ManifestFetchStatus> = new Map();
  private liveFetcher: LiveManifestFetcher;
  private entitlementProvider: ServerFixtureEntitlementProvider;

  private crmRecord: ProductRecord = {
    product_id: 'dfl-crm',
    manifest_version: '1.0.0',
    expected_product_version: '1.0.0',
    allowed_origins: ['http://127.0.0.1:8000', 'http://localhost:8000', 'https://crm.local:8000'],
    health_endpoint: '/api/v1/health',
    trusted_route_keys: ['crm.home', 'crm.contacts', 'crm.organizations', 'crm.opportunities', 'crm.people', 'crm.activities'],
    entitlement_requirements: ['crm.base'],
    enabled: true
  };

  private commerceRecord: ProductRecord = {
    product_id: 'dfl-commerce',
    manifest_version: '1.0.0',
    expected_product_version: '0.2.0',
    allowed_origins: ['http://127.0.0.1:3100', 'http://localhost:3100', 'https://commerce.local:3100'],
    health_endpoint: '/api/v1/health',
    trusted_route_keys: ['commerce.home', 'commerce.products', 'commerce.orders', 'commerce.customers'],
    entitlement_requirements: ['commerce.base'],
    enabled: true
  };

  private constructor() {
    this.registry = new ProductRegistry();
    this.liveFetcher = new LiveManifestFetcher();
    this.entitlementProvider = new ServerFixtureEntitlementProvider();
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
    this.healthStatuses.set('dfl-crm', 'healthy');
    this.healthStatuses.set('dfl-commerce', 'healthy');
  }

  public getLiveFetcher(): LiveManifestFetcher {
    return this.liveFetcher;
  }

  public getEntitlementProvider(): ServerFixtureEntitlementProvider {
    return this.entitlementProvider;
  }

  public registerProductRecord(record: ProductRecord) {
    if (record.product_id === 'dfl-crm') {
      this.crmRecord = record;
    } else if (record.product_id === 'dfl-commerce') {
      this.commerceRecord = record;
    }
    this.registry.registerProductRecord(record);
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

  public registerLiveManifest(productId: string, manifest: DFLProductManifest, status: ManifestFetchStatus = 'healthy') {
    const validated = this.registry.validateManifest(manifest);
    this.manifests.set(productId, validated);
    this.healthStatuses.set(productId, status);
  }

  public markProductUnhealthy(productId: string, status: ManifestFetchStatus = 'unhealthy') {
    this.healthStatuses.set(productId, status);
    this.manifests.delete(productId);
  }

  public async discoverLiveProducts(options?: { allowFixtureFallback?: boolean; timeoutMs?: number }): Promise<Map<string, LiveManifestResult>> {
    const results = new Map<string, LiveManifestResult>();
    const productIds = ['dfl-crm', 'dfl-commerce'];

    for (const pid of productIds) {
      const result = await this.liveFetcher.fetchLiveManifest(pid, this.registry, { timeoutMs: options?.timeoutMs });
      results.set(pid, result);

      if (result.status === 'healthy' && result.manifest) {
        this.manifests.set(pid, result.manifest);
        this.healthStatuses.set(pid, 'healthy');
      } else {
        // ZERO FIXTURE FALLBACK RULE (S-08):
        // If live discovery fails, do NOT load fixture. Product becomes unavailable.
        if (options?.allowFixtureFallback) {
          // Explicitly allowed only for unit test harness
          const fallbackManifest = pid === 'dfl-crm' ? crmManifestJson : commerceManifestJson;
          const validated = this.registry.validateManifest(fallbackManifest as unknown as DFLProductManifest);
          this.manifests.set(pid, validated);
          this.healthStatuses.set(pid, result.status);
        } else {
          this.manifests.delete(pid);
          this.healthStatuses.set(pid, result.status);
        }
      }
    }

    return results;
  }

  public getCompositionProjections(activeEntitlements: string[]): ShellProductProjection[] {
    const activeManifests = Array.from(this.manifests.values());
    const visibleNavs = this.registry.getVisibleNavigation(
      activeEntitlements,
      activeManifests
    );

    return visibleNavs.map((nav) => {
      const manifest = this.manifests.get(nav.product_id);
      const health = this.healthStatuses.get(nav.product_id) || 'healthy';
      return {
        product_id: nav.product_id,
        product_name: manifest?.product_name || nav.product_id,
        version: manifest?.version || '1.0.0',
        visible: true,
        health,
        navigation_items: nav.items
      };
    });
  }

  public resolveTrustedRoute(productId: string, routeKey: string): RouteResolutionResponse {
    const health = this.healthStatuses.get(productId);
    if (health && health !== 'healthy') {
      return {
        ok: false,
        code: 'UNHEALTHY_PRODUCT',
        message: `Product '${productId}' is currently ${health} and cannot resolve routes`
      };
    }

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
