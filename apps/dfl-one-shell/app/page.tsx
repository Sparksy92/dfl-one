'use client';

import React, { useState, useMemo } from 'react';
import { ProductRegistry, ProductRecord, DFLProductManifest } from '@dfl-one/product-registry';
import crmManifestJson from '../../../fixtures/crm.manifest.json';
import commerceManifestJson from '../../../fixtures/commerce.manifest.json';

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

export default function DflOnePage() {
  const [entitlements, setEntitlements] = useState<string[]>(['crm.base', 'commerce.base']);
  const [crmEnabled, setCrmEnabled] = useState<boolean>(true);
  const [commerceEnabled, setCommerceEnabled] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRoute, setSelectedRoute] = useState<{ productId: string; routeKey: string } | null>({
    productId: 'dfl-crm',
    routeKey: 'crm.home'
  });

  const { navSections, routeResolutionError, activeResolvedRoute } = useMemo(() => {
    const registry = new ProductRegistry();
    registry.registerProductRecord({ ...crmRecord, enabled: crmEnabled });
    registry.registerProductRecord({ ...commerceRecord, enabled: commerceEnabled });

    const crmManifest = registry.validateManifest(crmManifestJson as unknown as DFLProductManifest);
    const commerceManifest = registry.validateManifest(commerceManifestJson as unknown as DFLProductManifest);

    const visibleNavs = registry.getVisibleNavigation(entitlements, [crmManifest, commerceManifest]);

    let resErr: string | null = null;
    let resolved = null;

    if (selectedRoute) {
      try {
        const manifest = selectedRoute.productId === 'dfl-crm' ? crmManifest : commerceManifest;
        resolved = registry.resolveRoute(selectedRoute.productId, selectedRoute.routeKey, manifest);
      } catch (err: any) {
        resErr = err.message || String(err);
      }
    }

    return {
      navSections: visibleNavs,
      routeResolutionError: resErr,
      activeResolvedRoute: resolved
    };
  }, [entitlements, crmEnabled, commerceEnabled, selectedRoute]);

  const toggleEntitlement = (ent: string) => {
    setEntitlements((prev) =>
      prev.includes(ent) ? prev.filter((e) => e !== ent) : [...prev, ent]
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Top Navigation Bar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        backgroundColor: '#1e293b',
        borderBottom: '1px solid #334155'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#38bdf8' }}>DFL-One</span>
          <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#0284c7', color: '#fff' }}>
            Candidate A — Native Shell
          </span>
        </div>

        {/* Search Header Pattern */}
        <div style={{ width: '400px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search across DFL Enterprise Hub (CRM, Commerce)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid #475569',
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              fontSize: '14px'
            }}
          />
        </div>

        {/* Tenant Entitlement Control Panel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }}>
          <span>Tenant Entitlements:</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={entitlements.includes('crm.base')}
              onChange={() => toggleEntitlement('crm.base')}
            />
            CRM
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={entitlements.includes('commerce.base')}
              onChange={() => toggleEntitlement('commerce.base')}
            />
            Commerce
          </label>
          <span style={{ borderLeft: '1px solid #475569', height: '16px', margin: '0 4px' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={crmEnabled}
              onChange={(e) => setCrmEnabled(e.target.checked)}
            />
            Enable CRM
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={commerceEnabled}
              onChange={(e) => setCommerceEnabled(e.target.checked)}
            />
            Enable Commerce
          </label>
        </div>
      </header>

      {/* Main Layout Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar Navigation */}
        <aside style={{
          width: '260px',
          backgroundColor: '#0f172a',
          borderRight: '1px solid #334155',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          {navSections.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>
              No products entitlement assigned.
            </div>
          ) : (
            navSections.map((sec) => (
              <div key={sec.product_id}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 'bold',
                  letterSpacing: '0.05em',
                  color: '#64748b',
                  marginBottom: '8px',
                  textTransform: 'uppercase'
                }}>
                  {sec.product_id === 'dfl-crm' ? 'CRM' : sec.product_id === 'dfl-commerce' ? 'Commerce' : sec.product_id}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {sec.items.map((item) => {
                    const isSelected = selectedRoute?.productId === sec.product_id && selectedRoute?.routeKey === item.target_route;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedRoute({ productId: sec.product_id, routeKey: item.target_route })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontSize: '13px',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#0284c7' : 'transparent',
                          color: isSelected ? '#ffffff' : '#cbd5e1'
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {/* Test Unknown Route Trigger */}
          <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #1e293b' }}>
            <button
              onClick={() => setSelectedRoute({ productId: 'dfl-crm', routeKey: 'untrusted.secret_hack' })}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '11px',
                backgroundColor: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Simulate Unknown Route Failure
            </button>
          </div>
        </aside>

        {/* Viewport Main Panel */}
        <main style={{ flex: 1, padding: '24px', backgroundColor: '#020617', overflowY: 'auto' }}>
          <h2 style={{ marginTop: 0, color: '#f8fafc' }}>DFL-One Composition Viewport</h2>

          {routeResolutionError ? (
            <div style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: '#450a0a',
              border: '1px solid #991b1b',
              color: '#fca5a5'
            }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Security Fail-Closed Notice</h4>
              <p style={{ margin: 0, fontSize: '14px' }}>{routeResolutionError}</p>
            </div>
          ) : activeResolvedRoute ? (
            <div style={{
              padding: '20px',
              borderRadius: '8px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155'
            }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#38bdf8' }}>
                Mounted Route: {activeResolvedRoute.route_key}
              </h3>
              <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#94a3b8' }}>
                <p><strong>Product ID:</strong> {activeResolvedRoute.product_id}</p>
                <p><strong>Resolved Path:</strong> {activeResolvedRoute.path}</p>
                <p><strong>Standalone Target URL:</strong> {activeResolvedRoute.standalone_url || 'N/A'}</p>
                <p><strong>Trust Origin:</strong> Validated by <code>@dfl-one/product-registry</code></p>
              </div>
            </div>
          ) : (
            <div style={{ color: '#64748b' }}>Select a route from the navigation sidebar.</div>
          )}
        </main>
      </div>
    </div>
  );
}
