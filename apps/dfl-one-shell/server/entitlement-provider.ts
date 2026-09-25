export interface EntitlementContext {
  userId?: string;
  tenantId?: string;
  scenario?: 'all' | 'crm_only' | 'commerce_only' | 'none';
}

export interface EntitlementProvider {
  getEntitlements(context: EntitlementContext): Promise<string[]>;
}

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
        return ['crm.base', 'commerce.base'];
    }
  }
}
