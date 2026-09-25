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

    const productId = body.productId;
    const routeKey = body.routeKey;
    const crmEnabled = body.crm_enabled !== undefined ? body.crm_enabled : true;
    const commerceEnabled = body.commerce_enabled !== undefined ? body.commerce_enabled : true;

    if (!productId || !routeKey) {
      return NextResponse.json(
        { ok: false, code: 'UNTRUSTED_ROUTE', message: 'Missing productId or routeKey parameter' },
        { status: 400 }
      );
    }

    const serverRegistry = ServerProductRegistryService.getInstance();
    serverRegistry.setProductEnabled('dfl-crm', crmEnabled);
    serverRegistry.setProductEnabled('dfl-commerce', commerceEnabled);

    const result = serverRegistry.resolveTrustedRoute(productId, routeKey);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, code: 'UNTRUSTED_ROUTE', message: err.message || 'Server route resolution error' },
      { status: 400 }
    );
  }
}
