export interface EntitlementContext {
  userId?: string;
  tenantId?: string;
  scenario?: 'all' | 'crm_only' | 'commerce_only' | 'none';
  cookieHeader?: string;
}

export interface EntitlementProvider {
  getEntitlements(context: EntitlementContext): Promise<string[]>;
}

export class EntitlementResolutionError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'EntitlementResolutionError';
    this.statusCode = statusCode;
  }
}

export class PortalContextEntitlementProvider implements EntitlementProvider {
  private readonly contextUrl: string;

  constructor(contextUrl?: string) {
    const apiBase = (contextUrl || process.env.DFL_PORTAL_API_URL || 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '');
    this.contextUrl = `${apiBase}/me/context`;
  }

  public async getEntitlements(context: EntitlementContext): Promise<string[]> {
    const cookieHeader = context.cookieHeader?.trim();
    if (!cookieHeader) {
      throw new EntitlementResolutionError('Authenticated Portal session is required', 401);
    }

    let response: Response;
    try {
      response = await fetch(this.contextUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Cookie: cookieHeader
        },
        cache: 'no-store',
        redirect: 'error'
      });
    } catch (err: any) {
      throw new EntitlementResolutionError(
        `Portal entitlement service unavailable: ${err?.message || 'network error'}`,
        503
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new EntitlementResolutionError('Portal session is not authorized', response.status);
    }
    if (!response.ok) {
      throw new EntitlementResolutionError(
        `Portal entitlement service returned HTTP ${response.status}`,
        503
      );
    }

    const body = await response.json() as {
      apps?: Record<string, { enabled?: boolean }>;
      organization?: { id?: string };
      user?: { id?: string };
    };

    const apps = body.apps || {};
    const entitlements: string[] = [];

    if (apps.crm?.enabled === true) entitlements.push('crm.base');
    if (apps.commerce?.enabled === true) entitlements.push('commerce.base');

    return entitlements;
  }
}

/**
 * Deterministic fixture provider for unit/integration harnesses only.
 * Production routes must use PortalContextEntitlementProvider.
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
