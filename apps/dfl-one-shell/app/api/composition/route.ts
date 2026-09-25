import { NextResponse } from 'next/server';
import { ServerProductRegistryService } from '../../../server/product-registry-service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const activeEntitlements = body.active_entitlements || [];
    const crmEnabled = body.crm_enabled !== undefined ? body.crm_enabled : true;
    const commerceEnabled = body.commerce_enabled !== undefined ? body.commerce_enabled : true;

    const serverRegistry = ServerProductRegistryService.getInstance();
    serverRegistry.setProductEnabled('dfl-crm', crmEnabled);
    serverRegistry.setProductEnabled('dfl-commerce', commerceEnabled);

    const projections = serverRegistry.getCompositionProjections(activeEntitlements);

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
