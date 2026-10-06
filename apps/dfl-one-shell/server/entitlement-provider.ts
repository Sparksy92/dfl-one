export interface EntitlementContext {
  userId?: string;
  tenantId?: string;
  scenario?: 'all' | 'crm_only' | 'commerce_only' | 'none';
}

export interface EntitlementProvider {
  getEntitlements(context: EntitlementContext): Promise<string[]>;
}

/**
 * Test-only provider. This MUST NOT be used by production composition routes.
 */
export class ServerFixtureEntitlementProvider implements EntitlementProvider {
  public async getEntitlements(context: EntitlementContext): Promise<string[]> {
    const scenario = context.scenario || 'all';

    switch (scenario) {
      case 'all':
        return ['crm.base', 'commerce.base'];
      case 'crm_only':
        return ['crm.base'];
      case 'commerce_only':
        return ['commerce.base'];
      case 'none':
        return [];
      default:
        return [];
    }
  }
}

/**
 * Server-owned production provider.
 *
 * DFL-One does not accept browser-supplied entitlement claims. Until Keycloak /
 * tenant entitlement integration is completed, production entitlements must be
 * provisioned by the trusted server environment and default to NONE.
 */
export class ServerEnvironmentEntitlementProvider implements EntitlementProvider {
  public async getEntitlements(_context: EntitlementContext): Promise<string[]> {
    const raw = process.env.DFL_ONE_SERVER_ENTITLEMENTS || '';
    return Array.from(
      new Set(
        raw
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      )
    );
  }
}
