export interface EntitlementContext {
  userId?: string;
  tenantId?: string;
  authorization?: string;
  cookie?: string;
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
      default:
        return [];
    }
  }
}

interface PortalContextResponse {
  organization?: { id?: string };
  user?: { id?: string };
  apps?: Record<string, { enabled?: boolean }>;
}

/**
 * Production entitlement provider.
 *
 * Agency Portal is the authoritative owner of durable organization app
 * entitlements. DFL-One forwards the caller's server-side auth material to
 * /api/v1/me/context and derives shell visibility from that response.
 *
 * Any missing credentials, network failure, malformed response, or non-2xx
 * response fails closed to zero entitlements.
 */
export class PortalContextEntitlementProvider implements EntitlementProvider {
  private readonly contextUrl: string;

  constructor(contextUrl = process.env.DFL_ONE_CONTEXT_URL || 'http://127.0.0.1:8000/api/v1/me/context') {
    this.contextUrl = contextUrl;
  }

  public async getEntitlements(context: EntitlementContext): Promise<string[]> {
    if (!context.authorization && !context.cookie) {
      return [];
    }

    const headers: Record<string, string> = {
      Accept: 'application/json'
    };
    if (context.authorization) headers.Authorization = context.authorization;
    if (context.cookie) headers.Cookie = context.cookie;

    try {
      const response = await fetch(this.contextUrl, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(3000)
      });

      if (!response.ok) return [];

      const payload = await response.json() as PortalContextResponse;
      const apps = payload.apps || {};
      const entitlements: string[] = [];

      if (apps.crm?.enabled === true) entitlements.push('crm.base');
      if (apps.commerce?.enabled === true) entitlements.push('commerce.base');

      return entitlements;
    } catch {
      return [];
    }
  }
}
