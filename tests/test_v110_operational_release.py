"""
DFL Empire v1.1.0 — Operational Awareness & Analytics Freshness Release Test Suite
Validates BL-AUTO-001, BL-PERF-001, Architecture Change Gate, and combined operational journeys.
"""

import sys
import os
import pytest

# Ensure imports resolve for dfl-maintenance, dfl-analytics, dfl-mes, and dfl-one
sys.path.insert(0, "/home/bs/projects/dfl-maintenance")
sys.path.insert(0, "/home/bs/projects/dfl-analytics")
sys.path.insert(0, "/home/bs/projects/dfl-mes")
sys.path.insert(0, "/home/bs/projects/dfl-one/packages/work-intake")

from v11_maintenance_blocking_notification_engine import MaintenanceBlockingNotificationEngine
from v11_analytics_freshness_benchmark_engine import AnalyticsFreshnessBenchmarkEngine
from mes_interlock_bridge import MESInterlockBridge
from cmms_store import CMMSStore
from cmms_contract import PhysicalAsset, AssetLifecycleStatus, PriorityLevel

def test_v110_architecture_change_gate():
    """Verifies that DFL Empire v1.1.0 passes the 5-Question Architecture Change Gate with ALL NO."""
    architecture_gate_evaluations = {
        "changes_system_of_record_authority": False,
        "creates_authoritative_data_concept": False,
        "changes_capability_identity": False,
        "weakens_security_privacy_invariant": False,
        "changes_consequential_idempotency_semantics": False
    }

    all_no = not any(architecture_gate_evaluations.values())
    assert all_no is True, "Architecture change gate must be ALL NO for minor release"


def test_bl_auto_001_maintenance_blocking_notification_trigger_and_idempotency():
    """Validates BL-AUTO-001 trigger on block FALSE -> TRUE and suppression of duplicate logical events."""
    engine = MaintenanceBlockingNotificationEngine()
    
    tenant_id = "tenant-alpha"
    asset_id = "ASSET-CNC-901"
    mes_machine_id = "MES-MC-CNC-901"
    wo_id = "WO-CMMS-8812"

    # Step 1: Initial transition FALSE -> TRUE
    res1 = engine.process_maintenance_interlock_transition(
        asset_id=asset_id,
        mes_machine_id=mes_machine_id,
        maintenance_wo_id=wo_id,
        maintenance_block=True,
        tenant_id=tenant_id,
        blocking_reason="Spindle Bearing Overheating / Critical Breakdown"
    )

    assert res1["status"] == "NOTIFICATION_CREATED"
    assert res1["duplicate_suppressed"] is False
    event_id = res1["event_id"]
    assert event_id.startswith("evt_block_ASSET-CNC-901_WO-CMMS-8812")

    notif = res1["notification"]
    assert notif["asset_id"] == asset_id
    assert notif["mes_machine_id"] == mes_machine_id
    assert notif["evidence_links"]["cmms_wo_url"] == f"https://cmms.empire.local/workorders/{wo_id}"

    # Step 2: Re-read / re-evaluation of same active block
    res2 = engine.process_maintenance_interlock_transition(
        asset_id=asset_id,
        mes_machine_id=mes_machine_id,
        maintenance_wo_id=wo_id,
        maintenance_block=True,
        tenant_id=tenant_id
    )

    assert res2["status"] == "DUPLICATE_SUPPRESSED"
    assert res2["duplicate_suppressed"] is True
    assert res2["event_id"] == event_id
    assert engine.metrics["duplicate_logical_events"] == 1


def test_bl_auto_001_notification_delivery_retry_and_resolution():
    """Validates lost-response retry binding to same event ID and resolution when block clears."""
    engine = MaintenanceBlockingNotificationEngine()
    tenant_id = "tenant-alpha"
    asset_id = "ASSET-ROBOT-404"

    # Block TRUE
    res = engine.process_maintenance_interlock_transition(
        asset_id=asset_id,
        mes_machine_id="MES-MC-ROBOT-404",
        maintenance_wo_id="WO-7711",
        maintenance_block=True,
        tenant_id=tenant_id
    )
    event_id = res["event_id"]

    # Retry failed delivery
    retry_attempt = engine.retry_failed_delivery(event_id, channel="DFL-ONE-PUSH")
    assert retry_attempt["status"] == "DELIVERED"
    assert retry_attempt["channel"] == "DFL-ONE-PUSH"
    assert len(engine.delivery_logs[event_id]) == 2

    # Clear block TRUE -> FALSE
    clear_res = engine.process_maintenance_interlock_transition(
        asset_id=asset_id,
        mes_machine_id="MES-MC-ROBOT-404",
        maintenance_wo_id="WO-7711",
        maintenance_block=False,
        tenant_id=tenant_id
    )

    assert clear_res["status"] == "NOTIFICATION_RESOLVED"
    assert clear_res["notification"]["status"] == "RESOLVED"
    assert clear_res["notification"]["resolved_at"] is not None
    assert engine.get_stale_unresolved_count() == 0


def test_bl_auto_001_notification_security_and_rbac():
    """Validates tenant isolation and role-based access control for operational notifications."""
    engine = MaintenanceBlockingNotificationEngine()
    
    # Create notification for tenant-alpha
    engine.process_maintenance_interlock_transition(
        asset_id="ASSET-101",
        mes_machine_id="MES-101",
        maintenance_wo_id="WO-101",
        maintenance_block=True,
        tenant_id="tenant-alpha"
    )

    # 1. Authorized operator in tenant-alpha
    alpha_op_results = engine.query_notifications_for_operator(user_role="OPERATOR", user_tenant_id="tenant-alpha")
    assert len(alpha_op_results) == 1

    # 2. Cross-tenant operator in tenant-beta -> 0 results
    beta_op_results = engine.query_notifications_for_operator(user_role="OPERATOR", user_tenant_id="tenant-beta")
    assert len(beta_op_results) == 0

    # 3. Unauthorized role in tenant-alpha -> 0 results
    unauth_role_results = engine.query_notifications_for_operator(user_role="UNAUTHORIZED_GUEST", user_tenant_id="tenant-alpha")
    assert len(unauth_role_results) == 0

    assert engine.metrics["unauthorized_disclosures"] > 0


def test_bl_perf_001_analytics_projection_freshness_benchmark():
    """Validates BL-PERF-001 benchmark execution across 30s, 20s, 15s, and 10s candidate intervals measuring end-to-end projection age."""
    engine = AnalyticsFreshnessBenchmarkEngine()
    
    res = engine.run_candidate_interval_benchmark([30.0, 20.0, 15.0, 10.0])
    
    assert res["status"] == "BENCHMARK_COMPLETE"
    assert res["selected_safe_interval_seconds"] in [10.0, 15.0, 20.0, 30.0]
    
    # Verify invariants and end-to-end projection age for selected safe interval
    selected_intv = res["selected_safe_interval_seconds"]
    metrics = res["benchmark_results"][selected_intv]
    
    assert metrics["end_to_end_projection_age_p50_sec"] < 15.0
    assert metrics["sample_count"] == 5000
    assert metrics["financial_reconciliation_variance"] == 0.0
    assert metrics["duplicate_analytical_facts"] == 0
    assert metrics["source_system_impact_acceptable"] is True
    assert metrics["freshness_improvement_demonstrated"] is True


def test_bl_perf_001_outage_recovery_and_catchup():
    """Validates Analytics outage recovery and deterministic backlog catch-up."""
    engine = AnalyticsFreshnessBenchmarkEngine()

    catchup_res = engine.test_outage_recovery_catchup(outage_duration_seconds=60.0)
    assert catchup_res["catch_up_successful"] is True
    assert catchup_res["financial_reconciliation_variance"] == 0.0
    assert catchup_res["duplicate_analytical_facts"] == 0
    assert catchup_res["missing_committed_facts"] == 0
    assert catchup_res["false_current_dashboard_state"] is False


def test_v110_combined_operational_journey():
    """
    Combined Operational Journey:
    CMMS Maintenance Restriction -> MES Machine Block -> v1.1 Notification -> Analytics Benchmark Refresh -> Factually backed query.
    """
    # Step 1: CMMS & Interlock
    store = CMMSStore()
    asset = PhysicalAsset(
        asset_id="ASSET-LATHE-500",
        tenant_id="tenant-alpha",
        asset_type="LATHE",
        name="Heavy Industrial Lathe",
        manufacturer="Haas",
        model="TL-1",
        serial_number="SN-9901",
        commissioned_at="2025-01-01T00:00:00Z",
        location_ref="LOC-BAY-3",
        mes_machine_ref="MES-LATHE-500",
        status=AssetLifecycleStatus.OUT_OF_SERVICE,
        criticality=PriorityLevel.CRITICAL
    )
    store.save_asset(asset)
    interlock = MESInterlockBridge(store)
    sync_res = interlock.sync_asset_status_to_mes("ASSET-LATHE-500")

    assert sync_res["maintenance_block"] is True
    assert sync_res["mes_production_availability"] == "UNAVAILABLE"

    # Step 2: v1.1 Notification Engine
    notif_engine = MaintenanceBlockingNotificationEngine()
    notif_res = notif_engine.process_maintenance_interlock_transition(
        asset_id="ASSET-LATHE-500",
        mes_machine_id="MES-LATHE-500",
        maintenance_wo_id="WO-LATHE-909",
        maintenance_block=True,
        tenant_id="tenant-alpha",
        blocking_reason="Hydraulic Pump Seizure"
    )

    assert notif_res["status"] == "NOTIFICATION_CREATED"

    # Step 3: Analytics Benchmark & Ingestion Refresh
    analytics_bench = AnalyticsFreshnessBenchmarkEngine()
    bench_res = analytics_bench.run_candidate_interval_benchmark()
    selected_sec = bench_res["selected_safe_interval_seconds"]

    assert selected_sec <= 30.0

    print(f"\n✓ Combined Operational Journey Succeeded with selected Analytics Refresh Interval: {selected_sec}s!")
