import { DFLProductManifest, ProductRegistry } from '@dfl-one/product-registry';

export interface ProductDeploymentConfig {
  product_id: string;
  manifest_url: string;
  allowed_origins: string[];
}

export type ManifestFetchStatus = 
  | 'healthy'
  | 'unhealthy'
  | 'unreachable'
  | 'invalid_manifest'
  | 'version_mismatch'
  | 'ssrf_blocked';

export interface LiveManifestResult {
  product_id: string;
  status: ManifestFetchStatus;
  manifest: DFLProductManifest | null;
  error?: string;
}

export class LiveManifestFetcher {
  private deploymentConfigs: Map<string, ProductDeploymentConfig> = new Map();
  private allowedOrigins: Set<string> = new Set([
    'http://127.0.0.1:8000',
    'http://localhost:8000',
    'https://crm.local:8000',
    'http://127.0.0.1:3100',
    'http://localhost:3100',
    'https://commerce.local:3100'
  ]);

  constructor(customConfigs?: ProductDeploymentConfig[]) {
    const defaults: ProductDeploymentConfig[] = [
      {
        product_id: 'dfl-crm',
        manifest_url: 'http://127.0.0.1:8000/dfl-manifest.json',
        allowed_origins: ['http://127.0.0.1:8000', 'http://localhost:8000', 'https://crm.local:8000']
      },
      {
        product_id: 'dfl-commerce',
        manifest_url: 'http://127.0.0.1:3100/dfl-manifest.json',
        allowed_origins: ['http://127.0.0.1:3100', 'http://localhost:3100', 'https://commerce.local:3100']
      }
    ];

    const configsToLoad = customConfigs || defaults;
    for (const config of configsToLoad) {
      this.deploymentConfigs.set(config.product_id, config);
      for (const origin of config.allowed_origins) {
        this.allowedOrigins.add(origin);
      }
    }
  }

  public registerAllowedOrigin(origin: string) {
    this.allowedOrigins.add(origin);
  }

  public setProductEndpoint(productId: string, manifestUrl: string, origins: string[]) {
    this.deploymentConfigs.set(productId, {
      product_id: productId,
      manifest_url: manifestUrl,
      allowed_origins: origins
    });
    for (const o of origins) {
      this.allowedOrigins.add(o);
    }
  }

  public validateUrlSecurity(targetUrl: string, expectedProductId?: string): { safe: boolean; reason?: string } {
    try {
      const parsed = new URL(targetUrl);

      // Rule S-02: Require http: or https:
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { safe: false, reason: `Invalid protocol '${parsed.protocol}'. Must be http: or https:` };
      }

      // Rule S-02: Reject embedded credentials
      if (parsed.username || parsed.password) {
        return { safe: false, reason: 'Embedded URL credentials are strictly prohibited' };
      }

      // Canonical path check: Must end with /dfl-manifest.json
      if (!parsed.pathname.endsWith('/dfl-manifest.json')) {
        return { safe: false, reason: `Manifest URL path must end with '/dfl-manifest.json', got '${parsed.pathname}'` };
      }

      const origin = parsed.origin;
      let isAllowed = this.allowedOrigins.has(origin);

      if (expectedProductId) {
        const config = this.deploymentConfigs.get(expectedProductId);
        if (config && config.allowed_origins.length > 0) {
          isAllowed = config.allowed_origins.includes(origin) || this.allowedOrigins.has(origin);
        }
      }

      if (!isAllowed) {
        return { safe: false, reason: `Origin '${origin}' is not in server allowed origins list` };
      }

      return { safe: true };
    } catch (err: any) {
      return { safe: false, reason: `URL parsing failure: ${err.message}` };
    }
  }

  public async fetchLiveManifest(
    productId: string,
    registry: ProductRegistry,
    options?: { timeoutMs?: number; maxSizeBytes?: number }
  ): Promise<LiveManifestResult> {
    const config = this.deploymentConfigs.get(productId);
    if (!config) {
      return {
        product_id: productId,
        status: 'unreachable',
        manifest: null,
        error: `No deployment configuration found for product '${productId}'`
      };
    }

    const targetUrl = config.manifest_url;
    const securityCheck = this.validateUrlSecurity(targetUrl, productId);
    if (!securityCheck.safe) {
      return {
        product_id: productId,
        status: 'ssrf_blocked',
        manifest: null,
        error: `SSRF Security Boundary Violation: ${securityCheck.reason}`
      };
    }

    const timeoutMs = options?.timeoutMs || 3000;
    const maxSizeBytes = options?.maxSizeBytes || 524288; // 512 KB

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      // Rule S-03: redirect: 'error' ensures redirects fail closed
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error'
      });
      clearTimeout(timer);

      if (!response.ok) {
        return {
          product_id: productId,
          status: response.status >= 500 ? 'unhealthy' : 'unreachable',
          manifest: null,
          error: `HTTP ${response.status} ${response.statusText}`
        };
      }

      const text = await response.text();

      // Rule S-05: Bounded response size
      if (text.length > maxSizeBytes) {
        return {
          product_id: productId,
          status: 'invalid_manifest',
          manifest: null,
          error: `Manifest payload size (${text.length} bytes) exceeds maximum limit (${maxSizeBytes} bytes)`
        };
      }

      let parsedJson: any;
      try {
        parsedJson = JSON.parse(text);
      } catch (e: any) {
        return {
          product_id: productId,
          status: 'invalid_manifest',
          manifest: null,
          error: `Malformed JSON response: ${e.message}`
        };
      }

      // Validate against certified ProductRegistry schema
      let validatedManifest: DFLProductManifest;
      try {
        validatedManifest = registry.validateManifest(parsedJson);
      } catch (err: any) {
        return {
          product_id: productId,
          status: 'invalid_manifest',
          manifest: null,
          error: `Manifest schema validation failure: ${err.message}`
        };
      }

      // Check product_id consistency
      if (validatedManifest.product_id !== productId) {
        return {
          product_id: productId,
          status: 'invalid_manifest',
          manifest: null,
          error: `Manifest product_id mismatch: expected '${productId}', got '${validatedManifest.product_id}'`
        };
      }

      return {
        product_id: productId,
        status: 'healthy',
        manifest: validatedManifest
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return {
          product_id: productId,
          status: 'unreachable',
          manifest: null,
          error: `Manifest fetch timed out after ${timeoutMs}ms`
        };
      }
      return {
        product_id: productId,
        status: 'unreachable',
        manifest: null,
        error: err.message || 'Network fetch error'
      };
    }
  }
}
