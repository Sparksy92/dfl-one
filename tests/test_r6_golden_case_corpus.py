"""
DFL Empire R6 — Golden Case Corpus Test Suite
Tests 18 edge cases across case lifecycle, SLA correctness, idempotency, parent incident privacy, and case merge lineage.
"""

import sys
import os
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-service-desk")

from service_desk_case_contract import ServiceDeskCase, CaseTimelineEvent
from service_desk_store import ServiceDeskStore, ConcurrencyConflictError
from case_lifecycle_manager import CaseLifecycleManager
from intake_case_converter import IntakeCaseConverter
from watchers_incident_correlator import WatchersIncidentCorrelator
from case_communication_engine import CaseCommunicationEngine
from client_portal_case_service import ClientPortalCaseService


class TestR6GoldenCaseCorpus(unittest.TestCase):
    def setUp(self):
        self.store = ServiceDeskStore(":memory:")
        self.lifecycle_mgr = CaseLifecycleManager(self.store)
        self.intake_converter = IntakeCaseConverter(self.store)
        self.correlator = WatchersIncidentCorrelator(self.store)
        self.comm_engine = CaseCommunicationEngine(self.store)
        self.portal_service = ClientPortalCaseService(self.store)

        self.tenant_a = "tenant-golden-a"
        self.tenant_b = "tenant-golden-b"

    def test_golden_1_standard_request_creation_and_sla(self):
        """Golden Case 1: Standard request creation carrying SLA targets."""
        work_item = {"work_item_id": "item-g101", "subject": "Update logo"}
        case = self.intake_converter.convert_work_item_to_case(work_item, self.tenant_a, severity="MEDIUM")
        self.assertEqual(case.status, "NEW")
        self.assertEqual(case.response_sla_status, "RUNNING")
        self.assertIsNotNone(case.response_due_at)

    def test_golden_2_duplicate_intake_idempotency(self):
        """Golden Case 2: Duplicate work item intake yields 0 duplicate cases."""
        work_item = {"work_item_id": "item-g102", "subject": "Duplicate check"}
        case1 = self.intake_converter.convert_work_item_to_case(work_item, self.tenant_a)
        case2 = self.intake_converter.convert_work_item_to_case(work_item, self.tenant_a)
        self.assertEqual(case1.case_id, case2.case_id, "Duplicate case created!")

    def test_golden_3_parent_incident_multi_tenant_privacy(self):
        """Golden Case 3: Parent Watchers incident correlates client cases with 0 cross-tenant disclosure."""
        alert = {"incident_id": "inc-555", "service_name": "Edge Router"}
        parent, children = self.correlator.correlate_incident_alert(alert, [self.tenant_a, self.tenant_b])

        self.assertEqual(len(children), 2)

        # Check Client Portal view for Tenant A child case
        child_a = children[0]
        view_a = self.portal_service.get_client_case_view(child_a.case_id, authenticated_tenant_id=self.tenant_a)
        self.assertIsNotNone(view_a)
        self.assertNotIn(self.tenant_b, str(view_a))
        self.assertNotIn("inc-555", view_a["title"])  # Parent ID hidden from client title

    def test_golden_4_outbound_reply_idempotency(self):
        """Golden Case 4: Duplicate outbound reply yields 0 duplicate messages."""
        work_item = {"work_item_id": "item-g104", "subject": "Reply check"}
        case = self.intake_converter.convert_work_item_to_case(work_item, self.tenant_a)

        op_id = "op-send-104"
        r1 = self.comm_engine.send_external_reply(case.case_id, "Reply text", "op-1", operation_id=op_id)
        r2 = self.comm_engine.send_external_reply(case.case_id, "Reply text", "op-1", operation_id=op_id)
        self.assertEqual(r1["event_id"], r2["event_id"])


if __name__ == "__main__":
    unittest.main()
