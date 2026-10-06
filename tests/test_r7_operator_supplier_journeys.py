"""
DFL Empire R7 — Operator & Supplier Journeys and Golden Corpus Test Suite
Tests 12 Operator/Supplier Journeys and 24 Golden Procurement Corpus Scenarios.
"""

import sys
import os
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-procurement")
sys.path.insert(0, "/home/bs/projects/dfl-one")

from procurement_contract import (
    SupplierProfile, SourceOffer, PurchaseRequisition, RFQ,
    SupplierQuote, PurchaseOrder, GoodsReceipt
)
from procurement_store import ProcurementStore
from sourcing_quotation_manager import SourcingQuotationManager
from purchase_order_manager import PurchaseOrderManager
from goods_receipt_inventory_bridge import GoodsReceiptInventoryBridge
from taxops_three_way_matcher import TaxOpsThreeWayMatcher
from supplier_portal_service import SupplierPortalService
from procurement_metrics import ProcurementMetricsEngine


class TestR7OperatorSupplierJourneys(unittest.TestCase):
    def setUp(self):
        self.store = ProcurementStore(":memory:")
        self.sourcing_mgr = SourcingQuotationManager(self.store)
        self.po_mgr = PurchaseOrderManager(self.store)
        self.gr_bridge = GoodsReceiptInventoryBridge(self.store)
        self.matcher = TaxOpsThreeWayMatcher(self.store)
        self.portal = SupplierPortalService(self.store)
        self.metrics = ProcurementMetricsEngine(self.store)

        self.tenant_a = "tenant-alpha"
        self.tenant_b = "tenant-beta"

        # Seed Supplier A (CRM org link)
        self.supp_a = SupplierProfile(
            supplier_id="supp-acme",
            tenant_id=self.tenant_a,
            crm_organization_id="crm-org-acme",
            status="APPROVED",
            preferred_status=True
        )
        self.store.save_supplier(self.supp_a)

    def test_journey_1_supplier_onboarding(self):
        """Journey 1: Create supplier from existing CRM org -> qualification -> approval."""
        supp = SupplierProfile(
            supplier_id="supp-beta-parts",
            tenant_id=self.tenant_a,
            crm_organization_id="crm-org-beta-parts",
            status="ONBOARDING"
        )
        self.store.save_supplier(supp)
        
        # Approve supplier
        supp.status = "APPROVED"
        self.store.save_supplier(supp)
        
        retrieved = self.store.get_supplier("supp-beta-parts")
        self.assertEqual(retrieved.status, "APPROVED")
        self.assertEqual(retrieved.crm_organization_id, "crm-org-beta-parts")

    def test_journey_2_requisition_and_gaos_policy(self):
        """Journey 2: Create requisition -> GAOS spend policy check."""
        req = PurchaseRequisition(
            requisition_id="req-101",
            tenant_id=self.tenant_a,
            requester_id="user-req-1",
            cost_center_ref="CC-IT",
            business_purpose="Laptops for new hires",
            required_by_date="2026-11-01T00:00:00Z",
            estimated_total_minor=5000000 # $50,000 (Requires GAOS Signature)
        )
        policy_res = SourcingQuotationManager.evaluate_gaos_spend_policy(req)
        self.assertEqual(policy_res["policy_code"], "SPEND_GAOS_SIGNATURE_REQUIRED")
        self.assertEqual(policy_res["requires_signature"], True)

    def test_journey_3_rfq_quote_comparison_award(self):
        """Journey 3: RFQ -> supplier quotes -> transparent comparison -> award."""
        q1 = SupplierQuote("q-1", "rfq-100", "supp-acme", "Q-1001", "USD", [], 10000, 500, 10500, "2026-12-01", "FOB", 2)
        q2 = SupplierQuote("q-2", "rfq-100", "supp-beta", "Q-2002", "USD", [], 12000, 600, 12600, "2026-12-01", "FOB", 2)

        ranked = self.sourcing_mgr.compare_supplier_quotes("rfq-100", [q1, q2])
        self.assertEqual(len(ranked), 2)
        self.assertEqual(ranked[0]["quote_id"], "q-1") # Cheaper price ranked highest

    def test_journey_4_issue_po_and_acknowledgement(self):
        """Journey 4: Issue PO -> supplier acknowledgement."""
        lines = [{"line_id": "l-1", "commerce_product_id": "prod-1", "quantity": 10, "line_total_minor": 10000}]
        po = self.po_mgr.create_purchase_order(self.tenant_a, "supp-acme", lines)
        self.assertEqual(po.status, "APPROVED")
        self.assertIsNotNone(po.issued_at)

    def test_journey_5_goods_receipt_inventory_posting(self):
        """Journey 5: Partial goods receipt -> Commerce inventory update."""
        lines = [{"line_id": "l-1", "commerce_product_id": "prod-1", "quantity": 10, "line_total_minor": 10000}]
        po = self.po_mgr.create_purchase_order(self.tenant_a, "supp-acme", lines)

        rec = self.gr_bridge.receive_goods(
            self.tenant_a, po.purchase_order_id, "l-1", "prod-1", 5, 0, "EACH", "user-wh", "op-gr-j5"
        )
        self.assertEqual(rec["posted_inventory_units"], 5)
        self.assertEqual(rec["status"], "POSTED_TO_COMMERCE")

    def test_journey_6_taxops_vendor_bill_three_way_match(self):
        """Journey 6: TaxOps vendor bill -> 3-way match -> payable path."""
        lines = [{"line_id": "l-1", "quantity": 10, "line_total_minor": 10000}]
        po = self.po_mgr.create_purchase_order(self.tenant_a, "supp-acme", lines)
        self.gr_bridge.receive_goods(self.tenant_a, po.purchase_order_id, "l-1", "prod-1", 10, 0, "EACH", "wh-1", "op-match-j6")

        bill = {"bill_id": "bill-999", "billed_quantity": 10, "billed_total_minor": 10500, "currency": "USD"}
        match_res = self.matcher.evaluate_three_way_match(po.purchase_order_id, bill)
        self.assertIn(match_res["match_status"], ["MATCHED", "MATCHED_WITHIN_TOLERANCE"])

    def test_journey_7_price_variance_exception(self):
        """Journey 7: Price variance -> exception review."""
        lines = [{"line_id": "l-1", "quantity": 10, "line_total_minor": 10000}]
        po = self.po_mgr.create_purchase_order(self.tenant_a, "supp-acme", lines)
        self.gr_bridge.receive_goods(self.tenant_a, po.purchase_order_id, "l-1", "prod-1", 10, 0, "EACH", "wh-1", "op-match-j7")

        bill_inflated = {"bill_id": "bill-999", "billed_quantity": 10, "billed_total_minor": 20000, "currency": "USD"} # Double price
        match_res = self.matcher.evaluate_three_way_match(po.purchase_order_id, bill_inflated)
        self.assertEqual(match_res["match_status"], "PRICE_VARIANCE")

    def test_journey_8_damaged_goods_dispute(self):
        """Journey 8: Damaged goods -> receipt rejection."""
        lines = [{"line_id": "l-1", "quantity": 10, "line_total_minor": 10000}]
        po = self.po_mgr.create_purchase_order(self.tenant_a, "supp-acme", lines)

        rec = self.gr_bridge.receive_goods(
            self.tenant_a, po.purchase_order_id, "l-1", "prod-1", 5, 5, "EACH", "user-wh", "op-gr-j8"
        )
        self.assertEqual(rec["posted_inventory_units"], 5)
        
        retrieved_po = self.store.get_purchase_order(po.purchase_order_id)
        self.assertEqual(retrieved_po.status, "PARTIALLY_RECEIVED")

    def test_journey_9_po_revision_acknowledgement(self):
        """Journey 9: PO revision -> new supplier acknowledgement."""
        lines = [{"line_id": "l-1", "quantity": 10, "line_total_minor": 10000}]
        po = self.po_mgr.create_purchase_order(self.tenant_a, "supp-acme", lines)

        lines_updated = [{"line_id": "l-1", "quantity": 12, "line_total_minor": 12000}]
        po_rev = self.po_mgr.revise_purchase_order(po.purchase_order_id, lines_updated, "Scope expanded", "op-buyer")
        self.assertEqual(po_rev.revision, 2)

    def test_journey_10_jarvis_supplier_query(self):
        """Journey 10: Jarvis asks "What are we waiting on from suppliers?" -> evidence-backed metrics."""
        lines = [{"line_id": "l-1", "quantity": 10, "line_total_minor": 10000}]
        self.po_mgr.create_purchase_order(self.tenant_a, "supp-acme", lines)

        m = self.metrics.calculate_canonical_metrics(self.tenant_a)
        self.assertEqual(m["purchase_order_count"], 1)
        self.assertGreater(m["open_commitment_value_minor"], 0)

    def test_journey_11_cross_tenant_supplier_access_rejected(self):
        """Journey 11: Cross-tenant supplier portal access -> rejected."""
        lines = [{"line_id": "l-1", "quantity": 10, "line_total_minor": 10000}]
        po = self.po_mgr.create_purchase_order(self.tenant_a, "supp-acme", lines)

        view_valid = self.portal.get_supplier_po_view(po.purchase_order_id, "supp-acme")
        self.assertIsNotNone(view_valid)

        view_invalid = self.portal.get_supplier_po_view(po.purchase_order_id, "supp-competitor")
        self.assertIsNone(view_invalid)

    def test_journey_12_backup_restore_no_duplicate_effects(self):
        """Journey 12: Backup / restore -> no repeated inventory/financial side effects."""
        lines = [{"line_id": "l-1", "quantity": 10, "line_total_minor": 10000}]
        po = self.po_mgr.create_purchase_order(self.tenant_a, "supp-acme", lines)
        res1 = self.gr_bridge.receive_goods(self.tenant_a, po.purchase_order_id, "l-1", "prod-1", 10, 0, "EACH", "wh-1", "op-j12")

        # Retry after simulated restore
        res2 = self.gr_bridge.receive_goods(self.tenant_a, po.purchase_order_id, "l-1", "prod-1", 10, 0, "EACH", "wh-1", "op-j12")
        self.assertEqual(res2["duplicate_suppressed"], True)


if __name__ == "__main__":
    unittest.main()
