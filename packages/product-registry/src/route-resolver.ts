import { ProductRecord, DFLProductManifest, ResolvedRoute } from './types.js';
import { UntrustedRouteError, UnapprovedOriginError } from './errors.js';

export class RouteResolver {
  public resolveRoute(
    record: ProductRecord,
    manifest: DFLProductManifest,
    routeKey: string
  ): ResolvedRoute {
    // 1. Check if route_key is in ProductRecord trusted_route_keys
    if (!record.trusted_route_keys.includes(routeKey)) {
      throw new UntrustedRouteError(record.product_id, routeKey);
    }

    // 2. Find route spec in manifest
    const routeSpec = manifest.routes.find((r) => r.route_key === routeKey);
    if (!routeSpec) {
      throw new UntrustedRouteError(record.product_id, routeKey);
    }

    let approvedOrigin = '';

    // 3. Validate standalone_url origin if present
    if (routeSpec.standalone_url) {
      if (!routeSpec.standalone_url.startsWith('https://')) {
        throw new UnapprovedOriginError(record.product_id, routeSpec.standalone_url);
      }

      try {
        const urlObj = new URL(routeSpec.standalone_url);
        const origin = urlObj.origin;

        if (!record.allowed_origins.includes(origin)) {
          throw new UnapprovedOriginError(record.product_id, origin);
        }
        approvedOrigin = origin;
      } catch (err) {
        if (err instanceof UnapprovedOriginError) throw err;
        throw new UnapprovedOriginError(record.product_id, routeSpec.standalone_url);
      }
    }

    return {
      product_id: record.product_id,
      route_key: routeSpec.route_key,
      path: routeSpec.path,
      standalone_url: routeSpec.standalone_url,
      expected_product_version: record.expected_product_version,
      allowed_origin: approvedOrigin
    };
  }
}
