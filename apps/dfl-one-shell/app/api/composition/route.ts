import { NextResponse } from 'next/server';
import { ServerProductRegistryService } from '../../../server/product-registry-service';

export async function GET() {
  try {
    const serverRegistry = ServerProductRegistryService.getInstance();
    const entitlementProvider = serverRegistry.getEntitlementProvider();

    // Mandatory Live Discovery in production composition
    await serverRegistry.discoverLiveProducts();

    // Server-owned entitlement resolution
    const entitlements = await entitlementProvider.getEntitlements({});

    const projections = serverRegistry.getCompositionProjections(entitlements);

    return NextResponse.json({
      ok: true,
      projections
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: err.message || 'Server composition error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    // Security Rule S-01: Prohibit browser endpoint overrides
    if (body.crmUrl || body.commerceUrl || body.endpointOverride || body.manifestUrl) {
      return NextResponse.json(
        {
          ok: false,
          code: 'SSRF_BLOCKED',
          message: 'Security Boundary Violation: Client-supplied manifest URL overrides are strictly prohibited.'
        },
        { status: 400 }
      );
    }

    // Security Rules S-06, S-09, S-10: Reject client authority overrides
    if (
      body.scenario !== undefined ||
      body.active_entitlements !== undefined ||
      body.crm_enabled !== undefined ||
      body.commerce_enabled !== undefined ||
      body.discover_live !== undefined ||
      body.timeoutMs !== undefined
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: 'AUTHORITY_VIOLATION',
          message: 'Security Boundary Violation: Client-supplied composition authority parameters are strictly prohibited.'
        },
        { status: 400 }
      );
    }

    const serverRegistry = ServerProductRegistryService.getInstance();
    const entitlementProvider = serverRegistry.getEntitlementProvider();

    // Mandatory Live Discovery in production composition
    await serverRegistry.discoverLiveProducts();

    // Server-owned entitlement resolution
    const entitlements = await entitlementProvider.getEntitlements({});

    const projections = serverRegistry.getCompositionProjections(entitlements);

    return NextResponse.json({
      ok: true,
      projections
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: err.message || 'Server composition error' },
      { status: 500 }
    );
  }
}
