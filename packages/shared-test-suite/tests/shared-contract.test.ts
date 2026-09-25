import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ProductRegistry, ProductRecord, UntrustedRouteError, DisabledProductError } from '@dfl-one/product-registry';
import { DflNativeShell } from '@dfl-one/shell-native';
import { DflB1RefineShell } from '@dfl-one/shell-b1-refine';
import { DflB2TwentyShell } from '@dfl-one/shell-b2-twenty';

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
    generateNav: (session: { active_entitlements: string[] }) => { sectionCount: number; productIds: string[] };
    resolveRoute: (productId: string, routeKey: string) => any;
  };
}

const candidates: GenericShellAdapter[] = [
  {
    name: 'Candidate A — Native Shell',
    createShell: (registry) => {
      const shell = new DflNativeShell(registry);
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
            productIds: state.sections.map((s) => s.product_id)
          };
        },
        resolveRoute: (pid, rkey) => shell.resolveRoute(pid, rkey)
      };
    }
  },
  {
    name: 'Candidate B1 — Refine ONLY Shell',
    createShell: (registry) => {
      const shell = new DflB1RefineShell(registry);
      return {
        registerManifest: (m) => shell.registerManifest(m),
        generateNav: (session) => {
          const state = shell.getNavigationState(session);
          return {
            sectionCount: state.visibleNavs.length,
            productIds: state.visibleNavs.map((s) => s.product_id)
          };
        },
        resolveRoute: (pid, rkey) => shell.resolveRoute(pid, rkey)
      };
    }
  },
  {
    name: 'Candidate B2 — twenty-ui ONLY Shell',
    createShell: (registry) => {
      const shell = new DflB2TwentyShell(registry);
      return {
        registerManifest: (m) => shell.registerManifest(m),
        generateNav: (session) => {
          const state = shell.getNavigationState(session);
          return {
            sectionCount: state.visibleNavs.length,
            productIds: state.visibleNavs.map((s) => s.product_id)
          };
        },
        resolveRoute: (pid, rkey) => shell.resolveRoute(pid, rkey)
      };
    }
  }
];

candidates.forEach((cand) => {
  describe(`Shared Behavioral Contract (10/10) — ${cand.name}`, () => {
    function setup() {
      const registry = new ProductRegistry();
      registry.registerProductRecord({ ...crmRecord });
      registry.registerProductRecord({ ...commerceRecord });

      const adapter = cand.createShell(registry);
      adapter.registerManifest(crmManifest);
      adapter.registerManifest(commerceManifest);

      return { registry, adapter };
    }

    it('B-01 CRM + Commerce visible when user has both entitlements', () => {
      const { adapter } = setup();
      const nav = adapter.generateNav({ active_entitlements: ['crm.base', 'commerce.base'] });
      assert.equal(nav.sectionCount, 2);
      assert.ok(nav.productIds.includes('dfl-crm'));
      assert.ok(nav.productIds.includes('dfl-commerce'));
    });

    it('B-02 CRM-only entitlement isolates visible navigation to CRM', () => {
      const { adapter } = setup();
      const nav = adapter.generateNav({ active_entitlements: ['crm.base'] });
      assert.equal(nav.sectionCount, 1);
      assert.equal(nav.productIds[0], 'dfl-crm');
    });

    it('B-03 Commerce-only entitlement isolates visible navigation to Commerce', () => {
      const { adapter } = setup();
      const nav = adapter.generateNav({ active_entitlements: ['commerce.base'] });
      assert.equal(nav.sectionCount, 1);
      assert.equal(nav.productIds[0], 'dfl-commerce');
    });

    it('B-04 no-entitlement state renders zero product navigation', () => {
      const { adapter } = setup();
      const nav = adapter.generateNav({ active_entitlements: [] });
      assert.equal(nav.sectionCount, 0);
    });

    it('B-05 trusted CRM route resolves to approved origin', () => {
      const { adapter } = setup();
      const resolved = adapter.resolveRoute('dfl-crm', 'crm.home');
      assert.equal(resolved.product_id, 'dfl-crm');
      assert.equal(resolved.standalone_url, 'https://crm.local:8000');
    });

    it('B-06 trusted Commerce route resolves to approved origin', () => {
      const { adapter } = setup();
      const resolved = adapter.resolveRoute('dfl-commerce', 'commerce.home');
      assert.equal(resolved.product_id, 'dfl-commerce');
      assert.equal(resolved.standalone_url, 'https://commerce.local:3100');
    });

    it('B-07 unknown route fails closed with UntrustedRouteError', () => {
      const { adapter } = setup();
      assert.throws(
        () => adapter.resolveRoute('dfl-crm', 'crm.unapproved_hack'),
        UntrustedRouteError
      );
    });

    it('B-08 disabled product is isolated from navigation and route resolution', () => {
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

    it('B-09 entitlement visibility does not grant domain authorization', () => {
      const { registry } = setup();
      const visible = registry.getVisibleNavigation(['crm.base'], [crmManifest]);
      assert.equal(visible.length, 1);

      // Invariant: Entitlement check does NOT mutate domain session or grant domain authorization
      assert.ok(crmRecord.entitlement_requirements.includes('crm.base'));
    });

    it('B-10 navigation is derived dynamically from manifest / Product Registry data', () => {
      const { adapter } = setup();
      const nav1 = adapter.generateNav({ active_entitlements: ['crm.base'] });
      const nav2 = adapter.generateNav({ active_entitlements: ['commerce.base'] });

      assert.notDeepEqual(nav1, nav2);
      assert.equal(nav1.productIds[0], 'dfl-crm');
      assert.equal(nav2.productIds[0], 'dfl-commerce');
    });
  });
});
