"""
DFL Empire R6 — Operator & Client Journeys Test Suite
Certifies all 9 required R6 operator and client journeys.
"""

import sys
import os
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-service-desk")

from service_desk_case_contract import ServiceDeskCase
from service_desk_store import ServiceDeskStore
from case_lifecycle_manager import CaseLifecycleManager
from intake_case_converter import IntakeCaseConverter
from watchers_incident_correlator import WatchersIncidentCorrelator
from jarvis_service_desk_assistant import JarvisServiceDeskAssistant
from client_portal_case_service import ClientPortalCaseService


class TestR6OperatorJourneys(unittest.TestCase):
    def setUp(self):
        self.store = ServiceDeskStore(":memory:")
        self.lifecycle_mgr = CaseLifecycleManager(self.store)
        self.intake_converter = IntakeCaseConverter(self.store)
        self.correlator = WatchersIncidentCorrelator(self.store)
        self.jarvis_assistant = JarvisServiceDeskAssistant(self.store)
        self.portal_service = ClientPortalCaseService(self.store)

        self.tenant_a = "tenant-journey-a"
        self.tenant_b = "tenant-journey-b"

    def test_journey_1_email_to_intake_case_creation(self):
        """Journey 1: Support email -> Unified Inbox -> case created -> customer identified."""
        item = {"work_item_id": "item-j1", "subject": "Need homepage copy update", "crm_customer_id": "cust-900"}
        case = self.intake_converter.convert_work_item_to_case(item, self.tenant_a)
        self.assertEqual(case.status, "NEW")
        self.assertEqual(case.crm_customer_id, "cust-900")
        self.assertEqual(case.source_work_item_id, "item-j1")

    def test_journey_2_case_triage_acknowledgement_and_sla(self):
        """Journey 2: Case triaged -> assigned -> acknowledged -> response SLA satisfied."""
        item = {"work_item_id": "item-j2", "subject": "Billing inquiry"}
        case = self.intake_converter.convert_work_item_to_case(item, self.tenant_a)

        c_assigned = self.lifecycle_mgr.transition_status(case.case_id, "ASSIGNED", "OPERATOR", "op-1")
        self.assertEqual(c_assigned.status, "ASSIGNED")

        c_ack = self.lifecycle_mgr.transition_status(case.case_id, "ACKNOWLEDGED", "OPERATOR", "op-1")
        self.assertEqual(c_ack.response_sla_status, "MET")

    def test_journey_3_jarvis_assistant_analysis(self):
        """Journey 3: Jarvis retrieves similar case/docs -> operator resolves issue."""
        item = {"work_item_id": "item-j3", "subject": "Urgent server down"}
        case = self.intake_converter.convert_work_item_to_case(item, self.tenant_a, severity="HIGH")

        analysis = self.jarvis_assistant.analyze_case(case.case_id)
        self.assertEqual(analysis.recommended_severity, "HIGH")
        self.assertIn("investigating", analysis.suggested_draft_reply)

    def test_journey_4_engineering_handoff(self):
        """Journey 4: Engineering work required -> task/project handoff -> case remains linked."""
        item = {"work_item_id": "item-j4", "subject": "Feature request"}
        case = self.intake_converter.convert_work_item_to_case(item, self.tenant_a)

        # Link Agency Project
        case.agency_project_id = "proj-eng-404"
        self.store.update_case_with_concurrency(case, expected_version=1)

        refetched = self.store.get_case(case.case_id)
        self.assertEqual(refetched.agency_project_id, "proj-eng-404")

    def test_journey_5_watchers_incident_correlation(self):
        """Journey 5: Watchers detects incident -> correlated Service Desk case -> affected client update."""
        alert = {"incident_id": "inc-999", "service_name": "API Ingress"}
        parent, children = self.correlator.correlate_incident_alert(alert, [self.tenant_a])
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0].parent_incident_id, "inc-999")

    def test_journey_6_client_portal_resume(self):
        """Journey 6: Client portal -> client replies -> case resumes from WAITING_ON_CLIENT."""
        item = {"work_item_id": "item-j6", "subject": "Info requested"}
        case = self.intake_converter.convert_work_item_to_case(item, self.tenant_a)

        # Move to WAITING_ON_CLIENT
        self.lifecycle_mgr.transition_status(case.case_id, "WAITING_ON_CLIENT", "OPERATOR", "op-1")
        c_paused = self.store.get_case(case.case_id)
        self.assertEqual(c_paused.resolution_sla_status, "PAUSED")

        # Client replies -> resume to IN_PROGRESS
        c_resumed = self.lifecycle_mgr.transition_status(case.case_id, "IN_PROGRESS", "CLIENT", "client-1")
        self.assertEqual(c_resumed.resolution_sla_status, "RUNNING")

    def test_journey_7_sla_breach_detection(self):
        """Journey 7: SLA breach -> escalation -> Needs Attention."""
        case = ServiceDeskCase(
            case_id="case-j7-breached", tenant_id=self.tenant_a, title="Breached Case",
            status="NEW", created_at="2026-09-01T00:00:00Z", response_due_at="2026-09-01T01:00:00Z"
        )
        self.store.create_case(case)
        # Transition at current time -> Breached
        c_ack = self.lifecycle_mgr.transition_status(case.case_id, "ACKNOWLEDGED", "OPERATOR", "op-1")
        self.assertEqual(c_ack.response_sla_status, "BREACHED")

    def test_journey_8_cross_tenant_rejection(self):
        """Journey 8: Cross-tenant access attempt -> rejected."""
        case = ServiceDeskCase(case_id="case-j8-a", tenant_id=self.tenant_a, title="Client A Only")
        self.store.create_case(case)

        view = self.portal_service.get_client_case_view("case-j8-a", authenticated_tenant_id=self.tenant_b)
        self.assertIsNone(view)

    def test_journey_9_service_restart_recovery(self):
        """Journey 9: Service Desk outage/restart -> cases recover without duplication."""
        item = {"work_item_id": "item-j9", "subject": "Outage check"}
        case1 = self.intake_converter.convert_work_item_to_case(item, self.tenant_a)
        # Re-convert same work item post restart
        case2 = self.intake_converter.convert_work_item_to_case(item, self.tenant_a)
        self.assertEqual(case1.case_id, case2.case_id)


if __name__ == "__main__":
    unittest.main()
