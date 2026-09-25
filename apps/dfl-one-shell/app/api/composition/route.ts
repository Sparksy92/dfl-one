import { NextResponse } from 'next/server';
import { ServerProductRegistryService } from '../../../server/product-registry-service';

export async function POST(request: Request) {
  try {
    const body = await request.json();

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

    const serverRegistry = ServerProductRegistryService.getInstance();
    const entitlementProvider = serverRegistry.getEntitlementProvider();

    // Security Rule S-06: Resolve entitlements via server entitlement provider
    const scenario = body.scenario || (body.active_entitlements ? (
      body.active_entitlements.includes('crm.base') && body.active_entitlements.includes('commerce.base') ? 'all' :
      body.active_entitlements.includes('crm.base') ? 'crm_only' :
      body.active_entitlements.includes('commerce.base') ? 'commerce_only' : 'none'
    ) : 'all');

    const entitlements = await entitlementProvider.getEntitlements({ scenario });

    const crmEnabled = body.crm_enabled !== undefined ? body.crm_enabled : true;
    const commerceEnabled = body.commerce_enabled !== undefined ? body.commerce_enabled : true;

    serverRegistry.setProductEnabled('dfl-crm', crmEnabled);
    serverRegistry.setProductEnabled('dfl-commerce', commerceEnabled);

    if (body.discover_live) {
      await serverRegistry.discoverLiveProducts({ timeoutMs: body.timeoutMs || 2000 });
    }

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
