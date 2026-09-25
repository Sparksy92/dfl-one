'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShellProductProjection, RouteResolutionResponse } from '../server/product-registry-service.js';
import { RefineAdapter } from '@dfl-one/shell-b1-refine';
import { renderTwentyUISidebarPrimitive } from '@dfl-one/shell-b2-twenty';

export type CandidateMode = 'NATIVE' | 'REFINE' | 'TWENTY_UI';

export default function DflOnePage() {
  const [candidateMode, setCandidateMode] = useState<CandidateMode>('NATIVE');
  const [entitlements, setEntitlements] = useState<string[]>(['crm.base', 'commerce.base']);
  const [crmEnabled, setCrmEnabled] = useState<boolean>(true);
  const [commerceEnabled, setCommerceEnabled] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  const [projections, setProjections] = useState<ShellProductProjection[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<{ productId: string; routeKey: string } | null>({
    productId: 'dfl-crm',
    routeKey: 'crm.home'
  });
  const [routeResolution, setRouteResolution] = useState<RouteResolutionResponse | null>(null);

  // 1. Fetch Server-Side Composition Projections (Browser DOES NOT instantiate ProductRegistry)
  const fetchProjections = useCallback(async () => {
    try {
      const res = await fetch('/api/composition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_entitlements: entitlements,
          crm_enabled: crmEnabled,
          commerce_enabled: commerceEnabled
        })
      });
      const data = await res.json();
      if (data.ok) {
        setProjections(data.projections);
      }
    } catch (err) {
      console.error('Failed to fetch composition projection from server:', err);
    }
  }, [entitlements, crmEnabled, commerceEnabled]);

  // 2. Resolve Route Server-Side (Browser DOES NOT resolve trust)
  const resolveRouteServer = useCallback(async (pid: string, rkey: string) => {
    try {
      const res = await fetch('/api/resolve-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: pid,
          routeKey: rkey,
          crm_enabled: crmEnabled,
          commerce_enabled: commerceEnabled
        })
      });
      const data: RouteResolutionResponse = await res.json();
      setRouteResolution(data);
    } catch (err: any) {
      setRouteResolution({
        ok: false,
        code: 'UNTRUSTED_ROUTE',
        message: err.message || 'Server route resolution rejected'
      });
    }
  }, [crmEnabled, commerceEnabled]);

  useEffect(() => {
    fetchProjections();
  }, [fetchProjections]);

  useEffect(() => {
    if (selectedRoute) {
      resolveRouteServer(selectedRoute.productId, selectedRoute.routeKey);
    }
  }, [selectedRoute, resolveRouteServer]);

  const toggleEntitlement = (ent: string) => {
    setEntitlements((prev) =>
      prev.includes(ent) ? prev.filter((e) => e !== ent) : [...prev, ent]
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#0f172a', color: '#f8fafc' }}>
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
          {/* Mobile Nav Toggle */}
          <button
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            style={{
              display: 'none',
              padding: '6px 10px',
              backgroundColor: '#334155',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            className="mobile-nav-toggle"
          >
            ☰
          </button>
          <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#38bdf8' }}>DFL ONE</span>
          <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#0284c7', color: '#fff' }}>
            Enterprise Operating System
          </span>
        </div>

        {/* Global Search Header (UI Only) */}
        <div style={{ width: '380px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search DFL-One (People, Orders, Products)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
            style={{
              width: '100%',
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid #475569',
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              fontSize: '13px'
            }}
          />
          {isSearchFocused && (
            <div style={{
              position: 'absolute',
              top: '40px',
              left: 0,
              right: 0,
              backgroundColor: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '6px',
              padding: '12px',
              zIndex: 100,
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
            }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', fontWeight: 'bold' }}>SUGGESTED CATEGORIES</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 8px', backgroundColor: '#334155', borderRadius: '4px', fontSize: '12px' }}>People</span>
                <span style={{ padding: '4px 8px', backgroundColor: '#334155', borderRadius: '4px', fontSize: '12px' }}>Organizations</span>
                <span style={{ padding: '4px 8px', backgroundColor: '#334155', borderRadius: '4px', fontSize: '12px' }}>Products</span>
                <span style={{ padding: '4px 8px', backgroundColor: '#334155', borderRadius: '4px', fontSize: '12px' }}>Orders</span>
              </div>
            </div>
          )}
        </div>

        {/* Workspace Context & Candidate Harness Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Candidate Harness Switcher */}
          <div style={{ display: 'flex', backgroundColor: '#0f172a', padding: '3px', borderRadius: '6px', border: '1px solid #334155' }}>
            <button
              onClick={() => setCandidateMode('NATIVE')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: candidateMode === 'NATIVE' ? '#0284c7' : 'transparent',
                color: candidateMode === 'NATIVE' ? '#fff' : '#94a3b8'
              }}
            >
              Native
            </button>
            <button
              onClick={() => setCandidateMode('REFINE')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: candidateMode === 'REFINE' ? '#0284c7' : 'transparent',
                color: candidateMode === 'REFINE' ? '#fff' : '#94a3b8'
              }}
            >
              + Refine
            </button>
            <button
              onClick={() => setCandidateMode('TWENTY_UI')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: candidateMode === 'TWENTY_UI' ? '#0284c7' : 'transparent',
                color: candidateMode === 'TWENTY_UI' ? '#fff' : '#94a3b8'
              }}
            >
              + twenty-ui
            </button>
          </div>

          <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Tenant: <strong>DFL Productions</strong></span>
            <span style={{ color: '#22c55e', fontSize: '10px' }}>● Healthy</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Navigation Sidebar */}
        <aside style={{
          width: '260px',
          backgroundColor: '#0f172a',
          borderRight: '1px solid #334155',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          {candidateMode === 'TWENTY_UI' && (
            <div dangerouslySetInnerHTML={{ __html: renderTwentyUISidebarPrimitive('twenty-ui Primitive', 'MIT') }} />
          )}

          {/* Home Link */}
          <button
            onClick={() => setSelectedRoute(null)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '13px',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              backgroundColor: selectedRoute === null ? '#0284c7' : 'transparent',
              color: selectedRoute === null ? '#ffffff' : '#cbd5e1',
              fontWeight: 'bold'
            }}
          >
            🏠 Suite Home
          </button>

          {/* Dynamic Navigation Groups from Server Projection */}
          {projections.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>
              No DFL products are currently assigned to this workspace.
            </div>
          ) : (
            projections.map((proj) => (
              <div key={proj.product_id}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 'bold',
                  letterSpacing: '0.05em',
                  color: '#64748b',
                  marginBottom: '8px',
                  textTransform: 'uppercase'
                }}>
                  {proj.product_name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {proj.navigation_items.map((item) => {
                    const isSelected = selectedRoute?.productId === proj.product_id && selectedRoute?.routeKey === item.target_route;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedRoute({ productId: proj.product_id, routeKey: item.target_route })}
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

          {/* Reserved Future Operator Slots */}
          <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#64748b' }}>
            <div style={{ fontStyle: 'italic' }}>⚡ Jarvis HUD (Future Slot)</div>
            <div style={{ fontStyle: 'italic' }}>📋 Agent Ops (Future Slot)</div>
          </div>

          {/* Fail-Closed Route Test Trigger */}
          <button
            onClick={() => setSelectedRoute({ productId: 'dfl-crm', routeKey: 'untrusted.secret_hack' })}
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              backgroundColor: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Simulate Unknown Route
          </button>
        </aside>

        {/* Main Viewport Workspace */}
        <main style={{ flex: 1, padding: '24px', backgroundColor: '#020617', overflowY: 'auto' }}>
          {/* Entitlement Management Panel (Fixture Input sent to Server) */}
          <div style={{
            marginBottom: '20px',
            padding: '12px 16px',
            backgroundColor: '#1e293b',
            borderRadius: '8px',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px'
          }}>
            <div>
              <span style={{ fontWeight: 'bold' }}>Workspace Entitlements (Server Projection Test Input):</span>
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <label style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={entitlements.includes('crm.base')}
                  onChange={() => toggleEntitlement('crm.base')}
                />
                {' '}CRM (`crm.base`)
              </label>
              <label style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={entitlements.includes('commerce.base')}
                  onChange={() => toggleEntitlement('commerce.base')}
                />
                {' '}Commerce (`commerce.base`)
              </label>
              <span style={{ borderLeft: '1px solid #475569', height: '16px' }} />
              <label style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={crmEnabled}
                  onChange={(e) => setCrmEnabled(e.target.checked)}
                />
                {' '}Enable CRM Server Status
              </label>
              <label style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={commerceEnabled}
                  onChange={(e) => setCommerceEnabled(e.target.checked)}
                />
                {' '}Enable Commerce Server Status
              </label>
            </div>
          </div>

          {/* Viewport Content */}
          {selectedRoute === null ? (
            /* Home Suite Dashboard */
            <div>
              <h2 style={{ marginTop: 0 }}>Good morning — DFL-One Workspace</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '20px' }}>
                {projections.some((p) => p.product_id === 'dfl-crm') && (
                  <div style={{ padding: '20px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>CRM — Relationships & Deals</h3>
                    <p style={{ fontSize: '13px', color: '#94a3b8' }}>Customer accounts, pipelines, and activity timelines.</p>
                    <button
                      onClick={() => setSelectedRoute({ productId: 'dfl-crm', routeKey: 'crm.home' })}
                      style={{ marginTop: '12px', padding: '8px 14px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      Open CRM →
                    </button>
                  </div>
                )}
                {projections.some((p) => p.product_id === 'dfl-commerce') && (
                  <div style={{ padding: '20px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>Commerce — Products & Orders</h3>
                    <p style={{ fontSize: '13px', color: '#94a3b8' }}>Catalog management, customer orders, and inventory.</p>
                    <button
                      onClick={() => setSelectedRoute({ productId: 'dfl-commerce', routeKey: 'commerce.home' })}
                      style={{ marginTop: '12px', padding: '8px 14px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      Open Commerce →
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : routeResolution?.ok === false ? (
            /* Safe Server Error State */
            <div style={{ padding: '20px', backgroundColor: '#450a0a', border: '1px solid #991b1b', borderRadius: '8px', color: '#fca5a5' }}>
              <h3 style={{ margin: '0 0 8px 0' }}>Security Fail-Closed Notice</h3>
              <p style={{ margin: 0, fontSize: '14px' }}>{routeResolution.message}</p>
              <div style={{ marginTop: '16px' }}>
                <button
                  onClick={() => setSelectedRoute(null)}
                  style={{ padding: '6px 12px', backgroundColor: '#991b1b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Return to Home
                </button>
              </div>
            </div>
          ) : routeResolution?.route ? (
            /* Trusted Route Viewport */
            <div style={{ padding: '24px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#38bdf8' }}>
                Mounted Product Viewport: {routeResolution.route.product_id}
              </h3>
              <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#cbd5e1' }}>
                <p><strong>Route Key:</strong> <code>{routeResolution.route.route_key}</code></p>
                <p><strong>Path:</strong> <code>{routeResolution.route.path}</code></p>
                <p><strong>Standalone Target URL:</strong> {routeResolution.route.standalone_url || 'N/A'}</p>
                <p><strong>Trust Origin:</strong> Validated by Server-Side <code>ProductRegistry</code> Authority</p>
              </div>
            </div>
          ) : (
            <div style={{ color: '#64748b' }}>Loading route resolution from server...</div>
          )}
        </main>
      </div>
    </div>
  );
}
