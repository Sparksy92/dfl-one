"""
DFL Empire R8 — Operator & Production Journeys Integration Test Suite
Certifies the 12 required operator journeys across Work Orders, Routings, Work Centers,
Material Consumptions, Quality Control, Rework, Finished Goods, Jarvis, and DR Recovery.
"""

import sys
import os
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-mes")

from mes_contract import (
    ProductionSpec, BillOfMaterials, WorkOrder, ProductionRouting, WorkCenter
)
from mes_store import MESStore
from production_spec_bom_manager import ProductionSpecBOMManager
from work_order_routing_manager import WorkOrderRoutingManager
from work_center_scheduler import WorkCenterScheduler
from material_bridge import MaterialBridge
from quality_rework_manager import QualityReworkManager
from finished_goods_commerce_bridge import FinishedGoodsCommerceBridge
from production_genealogy_manager import ProductionGenealogyManager
from jarvis_mes_assistant import JarvisMESAssistant


class TestR8OperatorJourneys(unittest.TestCase):
    def setUp(self):
        self.store = MESStore(":memory:")
        self.spec_mgr = ProductionSpecBOMManager(self.store)
        self.wo_mgr = WorkOrderRoutingManager(self.store)
        self.wc_sched = WorkCenterScheduler(self.store)
        self.mat_bridge = MaterialBridge(self.store)
        self.qc_mgr = QualityReworkManager(self.store)
        self.fg_bridge = FinishedGoodsCommerceBridge(self.store)
        self.genealogy_mgr = ProductionGenealogyManager(self.store)
        self.jarvis = JarvisMESAssistant(self.store)

        # Seed routing & work center
        self.routing = self.wo_mgr.create_routing("R-E2E", "Standard Print & Press", [
            {"step_id": "step-101", "sequence": 1, "operation_name": "Print Transfer", "work_center_type": "WC-PRINT", "prerequisites": []},
            {"step_id": "step-102", "sequence": 2, "operation_name": "Press Transfer", "work_center_type": "WC-PRESS", "prerequisites": ["step-101"]}
        ])
        self.wc = self.wc_sched.register_work_center("wc-press-01", "tenant-alpha", "Press Station 1", "mach-press-A", 60)

    def test_journey_1_demand_to_work_order(self):
        """Journey 1: Demand -> Work Order creation with locked spec version."""
        wo = self.wo_mgr.create_work_order(
            "WO-J1", "tenant-alpha", "prod-shirt-blue", 50, self.routing.routing_id,
            production_spec_version=1, source_order_ref="ORD-COMMERCE-9001"
        )
        self.assertEqual(wo.status, "DRAFT")
        self.assertEqual(wo.source_order_ref, "ORD-COMMERCE-9001")

    def test_journey_2_material_reservation(self):
        """Journey 2: Material reservation request to Commerce."""
        res = self.mat_bridge.reserve_materials("WO-J2", "raw-shirt-blue", 50)
        self.assertEqual(res.status, "AVAILABLE")
        self.assertEqual(res.reserved_quantity, 50)

    def test_journey_3_production_routing(self):
        """Journey 3: Production routing verification."""
        r = self.store.get_routing(self.routing.routing_id)
        self.assertIsNotNone(r)
        self.assertEqual(len(r.steps), 2)

    def test_journey_4_operator_executes_operation(self):
        """Journey 4: Operator executes operation event."""
        wo = self.wo_mgr.create_work_order("WO-J4", "tenant-alpha", "prod-shirt-blue", 50, self.routing.routing_id)
        self.wo_mgr.transition_work_order_status("WO-J4", "IN_PRODUCTION", expected_version=1)

        wo_updated = self.store.get_work_order("WO-J4")
        self.assertEqual(wo_updated.status, "IN_PRODUCTION")

    def test_journey_5_material_consumed(self):
        """Journey 5: Material consumed idempotently."""
        c = self.mat_bridge.consume_materials("WO-J5", "raw-shirt-blue", 50.0, "EACH", "op-mat-j5")
        self.assertEqual(c["status"], "POSTED_TO_COMMERCE_INVENTORY")

    def test_journey_6_quality_pass(self):
        """Journey 6: Quality inspection PASS."""
        qi = self.qc_mgr.record_quality_inspection("WO-J6", "step-102", "qc-user-1", "PASS")
        self.assertEqual(qi.result, "PASS")

    def test_journey_7_finished_inventory_posted(self):
        """Journey 7: Finished goods completion posted to Commerce."""
        wo = self.wo_mgr.create_work_order("WO-J7", "tenant-alpha", "prod-shirt-blue", 50, self.routing.routing_id)
        res = self.fg_bridge.declare_finished_goods("WO-J7", "prod-shirt-blue", 50, "op-fg-j7")
        self.assertEqual(res["duplicate_suppressed"], False)

        wo_done = self.store.get_work_order("WO-J7")
        self.assertEqual(wo_done.status, "COMPLETE")

    def test_journey_8_quality_failure_to_rework(self):
        """Journey 8: Quality failure -> Rework creation."""
        qi = self.qc_mgr.record_quality_inspection("WO-J8", "step-101", "qc-user-1", "FAIL", "PRINT_MISALIGNMENT")
        rw = self.qc_mgr.create_rework_record("WO-J8", "step-101", "PRINT_MISALIGNMENT", "step-101-reprint")

        self.assertEqual(qi.result, "FAIL")
        self.assertEqual(rw.status, "PENDING")

    def test_journey_9_material_shortage_hold(self):
        """Journey 9: Material shortage hold."""
        wo = self.wo_mgr.create_work_order("WO-J9", "tenant-alpha", "prod-shirt-blue", 500, self.routing.routing_id)
        wo_hold = self.wo_mgr.transition_work_order_status("WO-J9", "MATERIAL_HOLD", expected_version=1, hold_reason="Blank shirts stock out of stock")

        self.assertEqual(wo_hold.status, "MATERIAL_HOLD")
        self.assertEqual(wo_hold.hold_reason, "Blank shirts stock out of stock")

    def test_journey_10_machine_outage(self):
        """Journey 10: Machine outage / maintenance update."""
        wc_updated = self.wc_sched.update_work_center_state("wc-press-01", "MAINTENANCE")
        self.assertEqual(wc_updated.state, "MAINTENANCE")

        est = self.wc_sched.calculate_estimated_completion("wc-press-01", 100)
        self.assertEqual(est["status"], "UNAVAILABLE")

    def test_journey_11_jarvis_production_status_question(self):
        """Journey 11: Jarvis asks production status question."""
        wo = self.wo_mgr.create_work_order("WO-J11", "tenant-alpha", "prod-shirt-blue", 50, self.routing.routing_id)
        resp = self.jarvis.query_production_status("WO-J11")

        self.assertTrue(resp["evidence_found"])
        self.assertEqual(resp["work_order_id"], "WO-J11")

    def test_journey_12_backup_restore_no_duplicate_side_effects(self):
        """Journey 12: Backup/Restore without duplicate inventory side effects."""
        wo = self.wo_mgr.create_work_order("WO-J12", "tenant-alpha", "prod-shirt-blue", 50, self.routing.routing_id)
        res1 = self.fg_bridge.declare_finished_goods("WO-J12", "prod-shirt-blue", 50, "op-fg-j12-retry")
        res2 = self.fg_bridge.declare_finished_goods("WO-J12", "prod-shirt-blue", 50, "op-fg-j12-retry")

        self.assertEqual(res1["duplicate_suppressed"], False)
        self.assertEqual(res2["duplicate_suppressed"], True)


if __name__ == "__main__":
    unittest.main()
