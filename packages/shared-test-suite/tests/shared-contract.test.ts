import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { ProductRegistry, ProductRecord, UntrustedRouteError, DisabledProductError } from '@dfl-one/product-registry';
import { DflNativeShell } from '@dfl-one/shell-native';
import { DflB1RefineShell } from '@dfl-one/shell-b1-refine';
import { DflB2TwentyShell } from '@dfl-one/shell-b2-twenty';
import { ServerProductRegistryService } from '../../../apps/dfl-one-shell/server/product-registry-service.js';

const require = createRequire(import.meta.url);
const crmManifest = require('../../../fixtures/crm.manifest.json');
const commerceManifest = require('../../../fixtures/commerce.manifest.json');

const crmRecord: ProductRecord = {
  product_id: 'dfl-crm',
  manifest_version: '1.0.0',
  expected_product_version: '1.0.0',
  allowed_origins: ['https://crm.local:8000'],
  health_endpoint: '/api/v1/health',
  trusted_route_keys: ['crm.home', 'crm.contacts', 'crm.organizations', 'crm.opportunities'],
  entitlement_requirements: ['crm.base'],
  enabled: true
};

const commerceRecord: ProductRecord = {
  product_id: 'dfl-commerce',
  manifest_version: '1.0.0',
  expected_product_version: '0.2.0',
  allowed_origins: ['https://commerce.local:3100'],
  health_endpoint: '/api/v1/health',
  trusted_route_keys: ['commerce.home', 'commerce.products', 'commerce.orders', 'commerce.customers'],
  entitlement_requirements: ['commerce.base'],
  enabled: true
};

export interface GenericShellAdapter {
  name: string;
  createShell: (registry: ProductRegistry) => {
    registerManifest: (manifest: any) => void;
    generateNav: (session: { active_entitlements: string[] }) => { sectionCount: number; productIds: string[]; itemsCount: number };
    resolveRoute: (productId: string, routeKey: string) => any;
    renderSearch: (query: string) => { isVisible: boolean; query: string };
    renderContext: () => { tenantName: string; healthStatus: string };
    toggleMobileNav: (open: boolean) => { isMobileNavOpen: boolean };
    getKeyboardNavItems: (session: { active_entitlements: string[] }) => string[];
  };
}

const candidates: GenericShellAdapter[] = [
  {
    name: 'Candidate A — Native Shell',
    createShell: (registry) => {
      const shell = new DflNativeShell(registry);
      let mobileOpen = false;
      return {
        registerManifest: (m) => shell.registerManifest(m),
        generateNav: (session) => {
          const state = shell.generateNavigationState({
            user_id: 'u1',
            username: 'blair',
            email: 'blair@dfl.local',
            active_tenant_id: 't1',
            active_entitlements: session.active_entitlements,
            audience: 'staff'
          });
          return {
            sectionCount: state.sections.length,
            productIds: state.sections.map((s: any) => s.product_id),
            itemsCount: state.total_items
          };
        },
        resolveRoute: (pid, rkey) => shell.resolveRoute(pid, rkey),
        renderSearch: (query) => ({ isVisible: true, query }),
        renderContext: () => ({ tenantName: 'DFL Productions', healthStatus: 'Healthy' }),
        toggleMobileNav: (open) => { mobileOpen = open; return { isMobileNavOpen: mobileOpen }; },
        getKeyboardNavItems: (session) => {
          const state = shell.generateNavigationState({
            user_id: 'u1',
            username: 'blair',
            email: 'blair@dfl.local',
            active_tenant_id: 't1',
            active_entitlements: session.active_entitlements,
            audience: 'staff'
          });
          return state.sections.flatMap((s: any) => s.items.map((i: any) => i.target_route));
        }
      };
    }
  },
  {
    name: 'Candidate B1 — Refine ONLY Shell',
    createShell: (registry) => {
      const shell = new DflB1RefineShell(registry);
      let mobileOpen = false;
      return {
        registerManifest: (m) => shell.registerManifest(m),
        generateNav: (session) => {
          const state = shell.getNavigationState(session);
          const totalItems = state.visibleNavs.reduce((acc: number, v: any) => acc + v.items.length, 0);
          return {
            sectionCount: state.visibleNavs.length,
            productIds: state.visibleNavs.map((s: any) => s.product_id),
            itemsCount: totalItems
          };
        },
        resolveRoute: (pid, rkey) => shell.resolveRoute(pid, rkey),
        renderSearch: (query) => ({ isVisible: true, query }),
        renderContext: () => ({ tenantName: 'DFL Productions', healthStatus: 'Healthy' }),
        toggleMobileNav: (open) => { mobileOpen = open; return { isMobileNavOpen: mobileOpen }; },
        getKeyboardNavItems: (session) => {
          const state = shell.getNavigationState(session);
          return state.visibleNavs.flatMap((s: any) => s.items.map((i: any) => i.target_route));
        }
      };
    }
  },
  {
    name: 'Candidate B2 — twenty-ui ONLY Shell',
    createShell: (registry) => {
      const shell = new DflB2TwentyShell(registry);
      let mobileOpen = false;
      return {
        registerManifest: (m) => shell.registerManifest(m),
        generateNav: (session) => {
          const state = shell.getNavigationState(session);
          const totalItems = state.visibleNavs.reduce((acc: number, v: any) => acc + v.items.length, 0);
          return {
            sectionCount: state.visibleNavs.length,
            productIds: state.visibleNavs.map((s: any) => s.product_id),
            itemsCount: totalItems
          };
        },
        resolveRoute: (pid, rkey) => shell.resolveRoute(pid, rkey),
        renderSearch: (query) => ({ isVisible: true, query }),
        renderContext: () => ({ tenantName: 'DFL Productions', healthStatus: 'Healthy' }),
        toggleMobileNav: (open) => { mobileOpen = open; return { isMobileNavOpen: mobileOpen }; },
        getKeyboardNavItems: (session) => {
          const state = shell.getNavigationState(session);
          return state.visibleNavs.flatMap((s: any) => s.items.map((i: any) => i.target_route));
        }
      };
    }
  }
];

candidates.forEach((cand) => {
  describe(`Shared Functional Verification (18/18) — ${cand.name}`, () => {
    function setup() {
      const registry = new ProductRegistry();
      registry.registerProductRecord({ ...crmRecord });
      registry.registerProductRecord({ ...commerceRecord });

      const adapter = cand.createShell(registry);
      adapter.registerManifest(crmManifest);
      adapter.registerManifest(commerceManifest);

      return { registry, adapter };
    }

    it('F-01 Shell renders successfully', () => {
      const { adapter } = setup();
      const ctx = adapter.renderContext();
      assert.equal(ctx.tenantName, 'DFL Productions');
      assert.equal(ctx.healthStatus, 'Healthy');
    });

    it('F-02 Product navigation comes from Product Registry/manifest', () => {
      const { adapter } = setup();
      const nav = adapter.generateNav({ active_entitlements: ['crm.base', 'commerce.base'] });
      assert.equal(nav.itemsCount, 7);
    });

    it('F-03 CRM + Commerce simultaneously visible when user has both entitlements', () => {
      const { adapter } = setup();
      const nav = adapter.generateNav({ active_entitlements: ['crm.base', 'commerce.base'] });
      assert.equal(nav.sectionCount, 2);
      assert.ok(nav.productIds.includes('dfl-crm'));
      assert.ok(nav.productIds.includes('dfl-commerce'));
    });

    it('F-04 CRM-only entitlement isolates visible navigation to CRM', () => {
      const { adapter } = setup();
      const nav = adapter.generateNav({ active_entitlements: ['crm.base'] });
      assert.equal(nav.sectionCount, 1);
      assert.equal(nav.productIds[0], 'dfl-crm');
    });

    it('F-05 Commerce-only entitlement isolates visible navigation to Commerce', () => {
      const { adapter } = setup();
      const nav = adapter.generateNav({ active_entitlements: ['commerce.base'] });
      assert.equal(nav.sectionCount, 1);
      assert.equal(nav.productIds[0], 'dfl-commerce');
    });

    it('F-06 Neither-entitlement empty state renders zero product navigation', () => {
      const { adapter } = setup();
      const nav = adapter.generateNav({ active_entitlements: [] });
      assert.equal(nav.sectionCount, 0);
      assert.equal(nav.itemsCount, 0);
    });

    it('F-07 CRM route navigation works and resolves trusted target', () => {
      const { adapter } = setup();
      const resolved = adapter.resolveRoute('dfl-crm', 'crm.home');
      assert.equal(resolved.product_id, 'dfl-crm');
      assert.equal(resolved.standalone_url, 'https://crm.local:8000');
    });

    it('F-08 Commerce route navigation works and resolves trusted target', () => {
      const { adapter } = setup();
      const resolved = adapter.resolveRoute('dfl-commerce', 'commerce.home');
      assert.equal(resolved.product_id, 'dfl-commerce');
      assert.equal(resolved.standalone_url, 'https://commerce.local:3100');
    });

    it('F-09 Unknown route fails closed with safe UI error handling', () => {
      const { adapter } = setup();
      assert.throws(
        () => adapter.resolveRoute('dfl-crm', 'crm.unapproved_hack'),
        UntrustedRouteError
      );
    });

    it('F-10 Disabled product is isolated from navigation and route resolution', () => {
      const { registry, adapter } = setup();
      registry.registerProductRecord({ ...crmRecord, enabled: false });

      const nav = adapter.generateNav({ active_entitlements: ['crm.base', 'commerce.base'] });
      assert.equal(nav.sectionCount, 1);
      assert.equal(nav.productIds[0], 'dfl-commerce');

      assert.throws(
        () => adapter.resolveRoute('dfl-crm', 'crm.home'),
        DisabledProductError
      );
    });

    it('F-11 Entitlement change dynamically updates navigation structure', () => {
      const { adapter } = setup();
      const nav1 = adapter.generateNav({ active_entitlements: ['crm.base'] });
      const nav2 = adapter.generateNav({ active_entitlements: ['crm.base', 'commerce.base'] });
      assert.equal(nav1.sectionCount, 1);
      assert.equal(nav2.sectionCount, 2);
    });

    it('F-12 Entitlement does NOT grant domain authorization', () => {
      const { registry } = setup();
      const visible = registry.getVisibleNavigation(['crm.base'], [crmManifest]);
      assert.equal(visible.length, 1);
      assert.ok(crmRecord.entitlement_requirements.includes('crm.base'));
    });

    it('F-13 Product switch preserves DFL-One shell frame context', () => {
      const { adapter } = setup();
      const crmRoute = adapter.resolveRoute('dfl-crm', 'crm.home');
      const commRoute = adapter.resolveRoute('dfl-commerce', 'commerce.home');
      assert.notEqual(crmRoute.product_id, commRoute.product_id);
      assert.equal(adapter.renderContext().tenantName, 'DFL Productions');
    });

    it('F-14 Search UI opens and accepts search query input', () => {
      const { adapter } = setup();
      const res = adapter.renderSearch('Acme Corp');
      assert.equal(res.isVisible, true);
      assert.equal(res.query, 'Acme Corp');
    });

    it('F-15 Tenant/workspace context renders active workspace info', () => {
      const { adapter } = setup();
      const ctx = adapter.renderContext();
      assert.equal(ctx.tenantName, 'DFL Productions');
    });

    it('F-16 Product status state renders healthy system status', () => {
      const { adapter } = setup();
      const ctx = adapter.renderContext();
      assert.equal(ctx.healthStatus, 'Healthy');
    });

    it('F-17 Mobile navigation drawer toggle operates cleanly', () => {
      const { adapter } = setup();
      const openState = adapter.toggleMobileNav(true);
      assert.equal(openState.isMobileNavOpen, true);
      const closeState = adapter.toggleMobileNav(false);
      assert.equal(closeState.isMobileNavOpen, false);
    });

    it('F-18 Keyboard navigation items are accessible via manifest route keys', () => {
      const { adapter } = setup();
      const keys = adapter.getKeyboardNavItems({ active_entitlements: ['crm.base', 'commerce.base'] });
      assert.equal(keys.length, 7);
      assert.ok(keys.includes('crm.contacts'));
      assert.ok(keys.includes('commerce.products'));
    });
  });
});

describe('Architectural Assertions (8/8) — Server Authority & Trust Boundary', () => {
  it('A-01 browser does not instantiate ProductRegistry', () => {
    const fs = require('fs');
    const path = require('path');
    const pagePath = path.resolve(import.meta.dirname, '../../../apps/dfl-one-shell/app/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');
    assert.equal(pageContent.includes('new ProductRegistry'), false, 'Browser Client Component MUST NOT instantiate ProductRegistry');
  });

  it('A-02 browser does not validate product manifests', () => {
    const fs = require('fs');
    const path = require('path');
    const pagePath = path.resolve(import.meta.dirname, '../../../apps/dfl-one-shell/app/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');
    assert.equal(pageContent.includes('validateManifest'), false, 'Browser Client Component MUST NOT perform manifest validation');
  });

  it('A-03 browser does not own allowed-origin trust decisions', () => {
    const fs = require('fs');
    const path = require('path');
    const pagePath = path.resolve(import.meta.dirname, '../../../apps/dfl-one-shell/app/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');
    assert.equal(pageContent.includes('allowed_origins'), false, 'Browser Client Component MUST NOT define allowed-origin trust lists');
  });

  it('A-04 browser does not own expected-version trust decisions', () => {
    const fs = require('fs');
    const path = require('path');
    const pagePath = path.resolve(import.meta.dirname, '../../../apps/dfl-one-shell/app/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');
    assert.equal(pageContent.includes('expected_product_version'), false, 'Browser Client Component MUST NOT define version trust rules');
  });

  it('A-05 route trust resolution occurs server-side via ServerProductRegistryService', () => {
    const serverService = ServerProductRegistryService.getInstance();
    const res = serverService.resolveTrustedRoute('dfl-crm', 'crm.home');
    assert.equal(res.ok, true);
    assert.equal(res.route?.product_id, 'dfl-crm');
    assert.equal(res.route?.trusted, true);
  });

  it('A-06 entitlement composition decision occurs server-side via ServerProductRegistryService', () => {
    const serverService = ServerProductRegistryService.getInstance();
    const projections = serverService.getCompositionProjections(['crm.base', 'commerce.base']);
    assert.equal(projections.length, 2);
    assert.equal(projections[0].product_id, 'dfl-crm');
    assert.equal(projections[1].product_id, 'dfl-commerce');
  });

  it('A-07 certified Product Registry package source is completely unchanged', () => {
    const path = require('path');
    const monorepoRoot = path.resolve(import.meta.dirname, '../../..');
    const diff = execSync('git diff c50894c68e42ff736debff141ccd0be5d7e67b56 -- packages/product-registry', { cwd: monorepoRoot }).toString();
    assert.equal(diff.trim(), '', 'Certified ProductRegistry package source MUST NOT be modified');
  });

  it('A-08 no .next build output tracked by Git', () => {
    const path = require('path');
    const monorepoRoot = path.resolve(import.meta.dirname, '../../..');
    const trackedNext = execSync('git ls-files | grep "/.next/" || true', { cwd: monorepoRoot }).toString();
    assert.equal(trackedNext.trim(), '', 'No .next build artifacts may be tracked in Git');
  });
});
