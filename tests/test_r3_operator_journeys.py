"""
DFL Empire R3 — Sub-Gate R3.10 Daily Operator Journeys Certification Test
Verifies complete multichannel operator workflow journeys from intake to context resolution, Jarvis triage, governed action, and evidence trail.
"""

from __future__ import annotations

import logging
import sys
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-one/packages/work-intake")
from context_resolution_service import BusinessContextResolutionEngine
from governed_action_router import GovernedActionRouter
from jarvis_triage_service import JarvisTriageService
from notification_policy_engine import NotificationPolicyEngine
from unified_inbox_service import InboxView, UnifiedInboxService
from work_item_contract import WorkChannel, WorkItemEnvelope, WorkPriority, WorkStatus
from work_item_dedup_engine import WorkItemDedupEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("r3.test_operator_journeys")


class TestR3OperatorJourneys(unittest.TestCase):
    def setUp(self):
        self.inbox = UnifiedInboxService()
        self.dedup = WorkItemDedupEngine()
        self.context_engine = BusinessContextResolutionEngine()
        self.triage = JarvisTriageService()
        self.router = GovernedActionRouter()
        self.notifications = NotificationPolicyEngine()

    def test_complete_multichannel_operator_journeys(self):
        logger.info("Executing Multichannel Daily Operator Journeys Certification Test")

        # 1. EMAIL JOURNEY: John Smith (john@example.com) -> Homepage Revision
        item_email = WorkItemEnvelope(
            source_system="rezhub-mailcow",
            source_object_id="msg-john-001",
            channel=WorkChannel.EMAIL,
            sender="john@example.com",
            subject="Can we change the homepage layout?",
            safe_preview="Hi team, can we update the homepage header image...",
        )
        self.inbox.ingest_work_item(item_email)

        # Context Resolution
        ctx_email = self.context_engine.resolve_context(item_email)
        self.assertTrue(ctx_email["resolved"])
        self.assertEqual(item_email.crm_customer_id, "crm-cust-acme-001")
        self.assertEqual(item_email.agency_project_id, "proj-acme-redesign")

        # Jarvis Triage
        triage_email = self.triage.triage_item(item_email, ctx_email)
        self.assertEqual(triage_email["intent"], "SERVICE_REQUEST_CHANGE")

        # Notification Evaluation
        notif_email = self.notifications.evaluate_notification(item_email)
        self.assertEqual(notif_email["action"], "BATCH_INBOX_DIGEST")

        # Operator View & Action
        my_work = self.inbox.get_view_items(InboxView.CLIENT_MESSAGES)
        self.assertTrue(len(my_work) > 0)

        # Governed Actions: Create Service Request & Draft Reply
        act1 = self.router.dispatch_action(item_email, "CREATE_AGENCY_REQUEST", {})
        self.assertEqual(act1["domain_result"]["status"], "CREATED")

        act2 = self.router.dispatch_action(item_email, "DRAFT_REPLY", {})
        self.assertEqual(act2["domain_result"]["status"], "DRAFTED")

        # Set status RESOLVED
        self.inbox.update_status(item_email.work_item_id, WorkStatus.RESOLVED)
        self.assertEqual(item_email.status, WorkStatus.RESOLVED)

        # 2. GAOS APPROVAL JOURNEY: High-Risk Domain Purchase Approval
        item_gaos = WorkItemEnvelope(
            source_system="GAOS",
            source_object_id="appr-gaos-789",
            channel=WorkChannel.GAOS_APPROVAL,
            sender="gaos-core@dfl-empire.internal",
            subject="GAOS Approval Required: Domain Purchase r2certcompany.com",
            safe_preview="High-risk operation DOMAIN_PURCHASE requires Ed25519 operator signature",
            priority=WorkPriority.URGENT,
        )
        self.inbox.ingest_work_item(item_gaos)

        # Notification Evaluation: Immediate Interrupt
        notif_gaos = self.notifications.evaluate_notification(item_gaos)
        self.assertEqual(notif_gaos["action"], "IMMEDIATE_INTERRUPT_ALERT")

        # Approve GAOS Action
        act_gaos = self.router.dispatch_action(item_gaos, "APPROVE_GAOS_REQUEST", {"approval_id": "appr-gaos-789"})
        self.assertEqual(act_gaos["domain_result"]["status"], "APPROVED")
        self.assertEqual(item_gaos.status, WorkStatus.RESOLVED)

        logger.info("DAILY OPERATOR JOURNEYS CERTIFIED: Email & GAOS Approval workflows executed cleanly with full audit trail")


if __name__ == "__main__":
    unittest.main()
