import { NextResponse } from 'next/server';
import { ServerProductRegistryService } from '../../../server/product-registry-service';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Security Rule S-01: Prohibit browser endpoint overrides
    if (body.endpointOverride || body.manifestUrl) {
      return NextResponse.json(
        {
          ok: false,
          code: 'SSRF_BLOCKED',
          message: 'Security Boundary Violation: Client-supplied manifest URL overrides are strictly prohibited.'
        },
        { status: 400 }
      );
    }

    // Security Rule S-09: Prohibit client enabling/disabling products
    if (body.crm_enabled !== undefined || body.commerce_enabled !== undefined) {
      return NextResponse.json(
        {
          ok: false,
          code: 'AUTHORITY_VIOLATION',
          message: 'Security Boundary Violation: Client-supplied product enable/disable toggles are strictly prohibited.'
        },
        { status: 400 }
      );
    }

    const productId = body.productId;
    const routeKey = body.routeKey;

    if (!productId || !routeKey) {
      return NextResponse.json(
        { ok: false, code: 'UNTRUSTED_ROUTE', message: 'Missing productId or routeKey parameter' },
        { status: 400 }
      );
    }

    const serverRegistry = ServerProductRegistryService.getInstance();

    // Resolve only against current live product state.
    await serverRegistry.discoverLiveProducts();

    // Re-check server-owned tenant entitlement for every route resolution.
    const entitlementProvider = serverRegistry.getProductionEntitlementProvider();
    const entitlements = await entitlementProvider.getEntitlements({
      cookieHeader: request.headers.get('cookie') || undefined
    });
    const entitled = serverRegistry
      .getCompositionProjections(entitlements)
      .some((projection) => projection.product_id === productId);

    if (!entitled) {
      return NextResponse.json(
        {
          ok: false,
          code: 'ENTITLEMENT_DENIED',
          message: `Product '${productId}' is not entitled for the authenticated workspace`
        },
        { status: 403 }
      );
    }

    const result = serverRegistry.resolveTrustedRoute(productId, routeKey);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, code: 'UNTRUSTED_ROUTE', message: err.message || 'Server route resolution error' },
      { status: 400 }
    );
  }
}
