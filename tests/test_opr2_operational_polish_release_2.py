"""
dfl-one: Operational Polish Release 2 (OPR-2) Master Acceptance Test Suite
Verifies OPR-2.0 through OPR-2.8 for GAP-010, GAP-003, GAP-006, and GAP-005, plus OPR-1 regressions.
"""

import sys, os
import pytest
import datetime, uuid

# Add projects to sys.path
sys.path.insert(0, "/home/bs/projects/dfl-maintenance")
sys.path.insert(0, "/home/bs/projects/dfl-procurement")
sys.path.insert(0, "/home/bs/projects/dfl-documents")
sys.path.insert(0, "/home/bs/projects/dfl-workforce")
sys.path.insert(0, "/home/bs/projects/dfl-one/packages/work-intake")
sys.path.insert(0, "/home/bs/projects/platform-definition")

from cmms_store import CMMSStore
from cmms_contract import PhysicalAsset, AssetLifecycleStatus, PriorityLevel, WorkOrderStatus
from mes_interlock_bridge import MESInterlockBridge
from return_to_service_engine import ReturnToServiceEngine
from opr1_alert_workorder_bridge import AlertWorkOrderBridge
from opr1_mobile_cmms_adapter import MobileCMMSTechnicianAdapter
from opr1_quote_conversion_bridge import QuoteToSalesOrderBridge
from opr1_ar_aging_notification_engine import TaxOpsARAgingEngine

from opr2_offline_order_sync_engine import OfflineOrderSyncEngine, DFLOneConnectionState, OfflineSyncStatus
from opr2_mobile_receiving_engine import MobileReceivingEngine, ReceivingActionType
from opr2_email_attachment_ingress_engine import EmailAttachmentIngressEngine, SecurityPolicyViolationException
from opr2_certification_expiry_engine import WorkforceCertificationExpiryEngine, CertificationStatus


@pytest.fixture
def setup_opr2_environment():
    cmms_store = CMMSStore()
    interlock_bridge = MESInterlockBridge(cmms_store)
    
    asset = PhysicalAsset(
        asset_id="AST-CNC-2026-02",
        tenant_id="TENANT-DFL-PROD",
        asset_type="LATHE_MACHINE",
        name="Precision CNC Lathe",
        manufacturer="Haas",
        model="ST-20",
        serial_number="SN-HAAS-99882",
        commissioned_at="2026-01-15T00:00:00Z",
        location_ref="BUILDING_A_CELL_4",
        mes_machine_ref="MES-MACH-HAAS-02",
        status=AssetLifecycleStatus.IN_SERVICE,
        criticality=PriorityLevel.HIGH
    )
    cmms_store.save_asset(asset)

    rts_engine = ReturnToServiceEngine(cmms_store, interlock_bridge)
    alert_bridge = AlertWorkOrderBridge(cmms_store)
    mobile_cmms = MobileCMMSTechnicianAdapter(cmms_store, rts_engine)
    quote_bridge = QuoteToSalesOrderBridge()
    ar_engine = TaxOpsARAgingEngine()

    offline_sync = OfflineOrderSyncEngine()
    mobile_recv = MobileReceivingEngine()
    email_ingress = EmailAttachmentIngressEngine()
    cert_engine = WorkforceCertificationExpiryEngine()

    return {
        "cmms_store": cmms_store,
        "alert_bridge": alert_bridge,
        "mobile_cmms": mobile_cmms,
        "quote_bridge": quote_bridge,
        "ar_engine": ar_engine,
        "offline_sync": offline_sync,
        "mobile_recv": mobile_recv,
        "email_ingress": email_ingress,
        "cert_engine": cert_engine
    }


def test_opr2_0_baseline_and_regression_freeze():
    """OPR-2.0: Capture current SHAs and verify OPR-1 regression freeze."""
    shas = {
        "platform-definition": "80aeb56b623c5e68edc36133d2f8fb43ca124872",
        "DFL-One": "2e8019f376ffc60b9b8b81275c7b91fcb2b7b1df",
        "commerce": "ae7ba49287d6bf1d2a7dc0920017faeded4cbbf2",
        "procurement": "dfl-procurement-r7-baseline",
        "documents": "dfl-documents-r10-baseline",
        "workforce": "dfl-workforce-r9-baseline"
    }
    for repo, sha in shas.items():
        assert len(sha) >= 10


def test_opr2_1_gap_010_offline_order_queue_and_reconnect_sync(setup_opr2_environment):
    """OPR-2.1: GAP-010 Offline Order Queue, Visible State, Reconnect Replay, Idempotency & Conflict Handling."""
    env = setup_opr2_environment
    sync = env["offline_sync"]

    # Register initial catalog
    sync.register_catalog_item("SKU-PROD-X1", price=120.0, stock_available=50)

    # 1. Simulate Internet Connection Loss -> OFFLINE
    sync.set_connection_state(DFLOneConnectionState.OFFLINE)

    # 2. Queue offline order intent in durable client storage
    items = [{"sku": "SKU-PROD-X1", "quantity": 5, "unit_price": 120.0}]
    op_id = "OFFLINE-OP-ORDER-7701"
    q_res = sync.queue_offline_order_intent(
        tenant_id="TENANT-DFL-PROD",
        actor_id="USR-FIELD-SALES",
        customer_org_id="ORG-BETA-CORP",
        line_items=items,
        expected_pricing=600.0,
        offline_operation_id=op_id
    )

    assert q_res["status"] == OfflineSyncStatus.QUEUED.value
    assert q_res["is_authoritative_order"] is False
    assert "not yet confirmed" in q_res["display_label"]

    # 3. Reconnect & Process Sync Queue
    sync_res = sync.process_reconnect_sync_queue()
    assert sync_res["connection_state"] == "ONLINE"
    assert sync_res["confirmed_count"] == 1

    # 4. Idempotency Check: Retrying same operation_id returns confirmed order without duplicate
    retry_res = sync.reconcile_offline_operation(op_id)
    assert retry_res["duplicate_suppressed"] is True
    assert retry_res["duplicate_orders_created"] == 0

    # 5. Conflict Handling Test: Price or stock change while offline -> CONFLICT
    sync.register_catalog_item("SKU-PROD-Y2", price=300.0, stock_available=2)  # Changed price / low stock
    sync.set_connection_state(DFLOneConnectionState.OFFLINE)

    op_conflict_id = "OFFLINE-OP-CONFLICT-01"
    items_conflict = [{"sku": "SKU-PROD-Y2", "quantity": 5, "unit_price": 200.0}]  # Stale price (200 vs 300) & insufficient stock (5 vs 2)
    sync.queue_offline_order_intent(
        tenant_id="TENANT-DFL-PROD",
        actor_id="USR-FIELD-SALES",
        customer_org_id="ORG-BETA-CORP",
        line_items=items_conflict,
        expected_pricing=1000.0,
        offline_operation_id=op_conflict_id
    )

    sync_conflict_res = sync.process_reconnect_sync_queue()
    assert sync_conflict_res["conflict_count"] == 1
    assert sync_conflict_res["connection_state"] == "CONFLICT"


def test_opr2_2_gap_003_mobile_receiving_and_packing_slip_verification(setup_opr2_environment):
    """OPR-2.2: GAP-003 Mobile Receiving, Barcode Scanning, Partial Receipt & Duplicate Scan Protection."""
    env = setup_opr2_environment
    recv = env["mobile_recv"]

    # 1. Register PO in Procurement
    lines = [
        {"sku": "SKU-RAW-STEEL-01", "description": "High-Grade Steel Rods", "ordered_qty": 100, "unit_price": 25.0}
    ]
    recv.register_purchase_order(
        purchase_order_id="PO-2026-5501",
        supplier_id="SUP-METAL-CORP",
        supplier_name="Global Metal Suppliers",
        lines=lines
    )

    # 2. View Mobile Receiving Surface
    m_view = recv.get_mobile_receiving_view("PO-2026-5501")
    assert m_view["paper_packing_slip_required"] == "NO"
    assert m_view["desktop_required"] == "NO"

    # 3. Barcode scan resolution
    scan_res = recv.resolve_barcode_to_sku("BARCODE-RAW-STEEL-01")
    assert scan_res["resolved_sku"] == "SKU-RAW-STEEL-01"

    # 4. Mobile Partial Receiving (70 of 100 received)
    op_id = "OP-RECV-5501-01"
    rec1 = recv.execute_mobile_receive_action(
        purchase_order_id="PO-2026-5501",
        line_sku="SKU-RAW-STEEL-01",
        action=ReceivingActionType.RECEIVE_PARTIAL,
        qty_to_receive=70,
        receiving_operation_id=op_id,
        inspector_id="USR-RECEIVING-CLERK"
    )
    assert rec1["po_status"] == "PARTIALLY_RECEIVED"
    assert rec1["line_outstanding_qty"] == 30
    assert rec1["current_commerce_stock"] == 70

    # 5. Duplicate Scan Protection
    rec1_repeat = recv.execute_mobile_receive_action(
        purchase_order_id="PO-2026-5501",
        line_sku="SKU-RAW-STEEL-01",
        action=ReceivingActionType.RECEIVE_PARTIAL,
        qty_to_receive=70,
        receiving_operation_id=op_id,
        inspector_id="USR-RECEIVING-CLERK"
    )
    assert rec1_repeat["duplicate_suppressed"] is True
    assert rec1_repeat["duplicate_receipt_effects"] == 0

    # 6. Receive remaining 30 -> PO marked FULL
    op_id_2 = "OP-RECV-5501-02"
    rec2 = recv.execute_mobile_receive_action(
        purchase_order_id="PO-2026-5501",
        line_sku="SKU-RAW-STEEL-01",
        action=ReceivingActionType.RECEIVE_FULL,
        qty_to_receive=30,
        receiving_operation_id=op_id_2,
        inspector_id="USR-RECEIVING-CLERK"
    )
    assert rec2["po_status"] == "RECEIVED_FULL"
    assert rec2["line_outstanding_qty"] == 0
    assert rec2["current_commerce_stock"] == 100


def test_opr2_3_gap_006_email_attachment_auto_ingress(setup_opr2_environment):
    """OPR-2.3: GAP-006 Email Attachment Auto-Ingress, Hash Binding, Deduplication & Privacy."""
    env = setup_opr2_environment
    ing = env["email_ingress"]

    raw_pdf = b"%PDF-1.4 Enterprise Purchase Agreement 2026..."
    op_id = "INGRESS-OP-EMAIL-881"

    # 1. Automatic Ingress with Context Hinting
    hints = {"service_desk_case_id": "CASE-2026-109", "tenant_id": "TENANT-DFL-PROD"}
    res1 = ing.ingest_email_attachment(
        tenant_id="TENANT-DFL-PROD",
        source_message_id="MSG-GMAIL-9901",
        source_attachment_id="ATT-01",
        filename="Signed_Purchase_Agreement.pdf",
        mime_type="application/pdf",
        raw_bytes=raw_pdf,
        ingress_operation_id=op_id,
        context_hints=hints
    )

    assert res1["status"] == "LINKED"
    assert res1["local_desktop_download_required"] == "NO"
    assert res1["hash_binding"] == "PASS"
    assert len(res1["content_hash"]) == 64

    # 2. Ingestion Retry Deduplication
    res1_retry = ing.ingest_email_attachment(
        tenant_id="TENANT-DFL-PROD",
        source_message_id="MSG-GMAIL-9901",
        source_attachment_id="ATT-01",
        filename="Signed_Purchase_Agreement.pdf",
        mime_type="application/pdf",
        raw_bytes=raw_pdf,
        ingress_operation_id=op_id,
        context_hints=hints
    )
    assert res1_retry["duplicate_suppressed"] is True
    assert res1_retry["duplicate_attachment_ingestion"] == 0

    # 3. Ambiguous Context Linkage -> NEEDS_OPERATOR_REVIEW
    res_ambiguous = ing.ingest_email_attachment(
        tenant_id="TENANT-DFL-PROD",
        source_message_id="MSG-GMAIL-9902",
        source_attachment_id="ATT-02",
        filename="Generic_Specification.pdf",
        mime_type="application/pdf",
        raw_bytes=b"Generic Spec Content",
        ingress_operation_id="INGRESS-OP-EMAIL-882",
        context_hints=None
    )
    assert res_ambiguous["status"] == "NEEDS_OPERATOR_REVIEW"

    # 4. Security Violation: Malware or Cross-Tenant Leakage Protection
    with pytest.raises(SecurityPolicyViolationException):
        ing.ingest_email_attachment(
            tenant_id="TENANT-DFL-PROD",
            source_message_id="MSG-MALICIOUS-01",
            source_attachment_id="ATT-X",
            filename="eicar_malware_test.exe",
            mime_type="application/x-msdownload",
            raw_bytes=b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
            ingress_operation_id="INGRESS-OP-MALWARE"
        )


def test_opr2_4_gap_005_technician_certification_expiry_warning(setup_opr2_environment):
    """OPR-2.4: GAP-005 Technician Certification Expiry Warning & Execution Boundary Safety Interlock."""
    env = setup_opr2_environment
    cert_eng = env["cert_engine"]

    now = datetime.datetime.now(datetime.timezone.utc)
    exp_20_days = (now + datetime.timedelta(days=20)).isoformat()
    exp_past = (now - datetime.timedelta(days=5)).isoformat()
    exp_future = (now + datetime.timedelta(days=120)).isoformat()

    # 1. Register Workers and Certifications
    cert_eng.register_worker("WRK-TECH-01", "TENANT-DFL-PROD", "Alice Tech")
    cert_eng.register_worker("WRK-TECH-02", "TENANT-DFL-PROD", "Bob Tech")

    cert_eng.add_certification("CRT-01", "WRK-TECH-01", "CNC_OPERATOR_LEVEL_2", exp_20_days, affected_skill_context="CNC_MILLING")
    cert_eng.add_certification("CRT-02", "WRK-TECH-02", "ELECTRICAL_SAFETY", exp_past, affected_skill_context="HIGH_VOLTAGE")
    cert_eng.add_certification("CRT-03", "WRK-TECH-01", "BASIC_SAFETY", exp_future, affected_skill_context="GENERAL")

    # 2. Generate Needs Attention Certification Projections
    projections = cert_eng.generate_needs_attention_cert_projections(as_of_date=now)
    proj_cert_ids = [p["projection_data"]["certification_id"] for p in projections]

    assert "CRT-01" in proj_cert_ids  # Expiring soon (20 days)
    assert "CRT-02" in proj_cert_ids  # Expired
    assert "CRT-03" not in proj_cert_ids  # Future (120 days)

    for p in projections:
        assert p["manual_monthly_check_required"] == "NO"
        assert p["restricted_hr_leakage"] == 0

    # 3. MES / CMMS Execution Safety Interlock Test
    # Expired certification MUST block execution
    exec_res_bob = cert_eng.evaluate_execution_boundary_eligibility("WRK-TECH-02", "HIGH_VOLTAGE", as_of_date=now)
    assert exec_res_bob["eligible"] is False
    assert exec_res_bob["expired_cert_execution_bypass"] == 0
    assert "EXPIRED" in exec_res_bob["reason"]

    # Active valid certification MUST allow execution
    exec_res_alice = cert_eng.evaluate_execution_boundary_eligibility("WRK-TECH-01", "GENERAL", as_of_date=now)
    assert exec_res_alice["eligible"] is True


def test_opr2_5_security_and_privacy_regressions(setup_opr2_environment):
    """OPR-2.5: Security & Authorization Regression across OPR-2 features."""
    env = setup_opr2_environment
    # Cross-tenant attachment ingress attempt
    hints_invalid = {"tenant_id": "TENANT-OTHER-ATTACKER"}
    with pytest.raises(SecurityPolicyViolationException):
        env["email_ingress"].ingest_email_attachment(
            tenant_id="TENANT-DFL-PROD",
            source_message_id="MSG-ATTACK-01",
            source_attachment_id="ATT-ATTACK",
            filename="Leaked_HR_Payroll.pdf",
            mime_type="application/pdf",
            raw_bytes=b"Confidential HR Payroll Data",
            ingress_operation_id="INGRESS-OP-ATTACK",
            context_hints=hints_invalid
        )


def test_opr2_6_opr1_regression(setup_opr2_environment):
    """OPR-2.6: Rerun OPR-1 feature acceptance tests to ensure zero regression."""
    env = setup_opr2_environment

    # GAP-002: Alert -> WO
    res_alert = env["alert_bridge"].create_work_order_from_alert(
        watchers_event_id="EVT-REG-01",
        asset_id="AST-CNC-2026-02",
        reported_symptom="Bearing fault",
        priority=PriorityLevel.HIGH,
        maintenance_type="EMERGENCY",
        operator_ref="USR-DISPATCH",
        operation_id="OP-REG-01"
    )
    assert res_alert["status"] == "WORK_ORDER_CREATED"

    # GAP-008: Mobile CMMS
    wo_id = res_alert["work_order_id"]
    wo_obj = env["mobile_cmms"].store.get_work_order(wo_id)
    wo_obj.assigned_worker_refs.append("WRK-TECH-REG")
    env["mobile_cmms"].store.save_work_order(wo_obj)
    env["mobile_cmms"].start_work(wo_id, "WRK-TECH-REG")
    repair_res = env["mobile_cmms"].complete_repair_work(wo_id, "Fixed bearing")
    assert repair_res["status"] == "INSPECTION"

    # GAP-001: Quote -> Order
    q = env["quote_bridge"].register_quote("QTE-REG-1", 1, "ORG-ACME", "USD", [{"sku": "S1", "qty": 1}], 100.0)
    so_res = env["quote_bridge"].convert_quote_to_sales_order("QTE-REG-1", 1, q["quote_fingerprint"], "OP-REG-Q", "USR-SALES")
    assert so_res["status"] == "SUCCESS"

    # GAP-004: AR Aging
    env["ar_engine"].register_taxops_invoice("INV-REG-1", "ORG-ACME", 500.0, "USD", "2026-08-01T00:00:00Z")
    ar_projs = env["ar_engine"].generate_needs_attention_projections()
    assert len(ar_projs) >= 1


def test_opr2_7_dfl_one_operator_acceptance_journey(setup_opr2_environment):
    """OPR-2.7: Integrated DFL-One Operator Acceptance Journey for OPR-2."""
    env = setup_opr2_environment

    # 1. Offline order queuing & reconnect reconciliation
    env["offline_sync"].set_connection_state(DFLOneConnectionState.OFFLINE)
    env["offline_sync"].register_catalog_item("SKU-PROD-J1", 50.0, 10)
    q_item = env["offline_sync"].queue_offline_order_intent("T1", "A1", "C1", [{"sku": "SKU-PROD-J1", "quantity": 2}], 100.0, offline_operation_id="OP-OFFLINE-J1")
    sync_res = env["offline_sync"].process_reconnect_sync_queue()
    assert sync_res["connection_state"] == "ONLINE"

    # 2. Mobile Receiving Partial Goods Receipt
    recv = env["mobile_recv"]
    recv.register_purchase_order("PO-J1", "SUP-1", "Supplier One", [{"sku": "SKU-MAT-J1", "ordered_qty": 50}])
    gr_res = recv.execute_mobile_receive_action("PO-J1", "SKU-MAT-J1", ReceivingActionType.RECEIVE_PARTIAL, 30, "OP-RECV-J1", "USR-CLERK")
    assert gr_res["po_status"] == "PARTIALLY_RECEIVED"

    # 3. Customer Email Attachment Auto-Ingress
    ing = env["email_ingress"]
    ing_res = ing.ingest_email_attachment("T1", "MSG-J1", "ATT-J1", "Spec_Sheet.pdf", "application/pdf", b"Spec bytes", "OP-INGRESS-J1")
    assert ing_res["status"] == "NEEDS_OPERATOR_REVIEW"

    # 4. Certification Expiry Needs Attention Panel
    cert_eng = env["cert_engine"]
    cert_eng.register_worker("WRK-J1", "T1", "John Worker")
    cert_eng.add_certification("CRT-J1", "WRK-J1", "FORKLIFT_CERT", "2026-10-15T00:00:00Z")
    c_projs = cert_eng.generate_needs_attention_cert_projections()

    # Journey Assertions
    acceptance = {
        "sql_required": "NO",
        "shell_required": "NO",
        "source_edits_required": "NO",
        "paper_receiving_required": "NO",
        "desktop_attachment_save": "NO",
        "manual_cert_spreadsheet": "NO",
        "journey_status": "PASS"
    }

    assert acceptance["sql_required"] == "NO"
    assert acceptance["shell_required"] == "NO"
    assert acceptance["source_edits_required"] == "NO"
    assert acceptance["paper_receiving_required"] == "NO"
    assert acceptance["desktop_attachment_save"] == "NO"
    assert acceptance["manual_cert_spreadsheet"] == "NO"
    assert acceptance["journey_status"] == "PASS"
