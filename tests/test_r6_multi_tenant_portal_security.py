"""
DFL Empire R6 — Multi-Tenant Client Portal Security Test Suite
Tests server-side timeline visibility filtering (PUBLIC only) and strict cross-tenant case isolation.
"""

import sys
import os
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-service-desk")

from service_desk_case_contract import ServiceDeskCase, CaseTimelineEvent
from service_desk_store import ServiceDeskStore
from client_portal_case_service import ClientPortalCaseService


class TestR6MultiTenantPortalSecurity(unittest.TestCase):
    def setUp(self):
        self.store = ServiceDeskStore(":memory:")
        self.portal_service = ClientPortalCaseService(self.store)

        self.tenant_a = "tenant-client-a"
        self.tenant_b = "tenant-client-b"

        # Case for Client A
        self.case_a = ServiceDeskCase(
            case_id="case-a-1",
            tenant_id=self.tenant_a,
            title="Client A Portal Case",
            status="IN_PROGRESS"
        )
        self.store.create_case(self.case_a)

        # Timeline events on Case A
        self.store.record_event(CaseTimelineEvent(
            case_event_id="evt-pub-1", case_id="case-a-1", case_version=1,
            event_type="PUBLIC_REPLY", actor_type="OPERATOR", actor_id="op-1",
            occurred_at="2026-10-01T10:00:00Z", visibility="PUBLIC",
            content="Hello Client A, we are working on your issue."
        ))

        self.store.record_event(CaseTimelineEvent(
            case_event_id="evt-int-1", case_id="case-a-1", case_version=1,
            event_type="INTERNAL_NOTE", actor_type="OPERATOR", actor_id="op-1",
            occurred_at="2026-10-01T10:05:00Z", visibility="INTERNAL",
            content="INTERNAL NOTE: Server database disk space is at 95%."
        ))

        self.store.record_event(CaseTimelineEvent(
            case_event_id="evt-sec-1", case_id="case-a-1", case_version=1,
            event_type="SECURITY_RESTRICTED", actor_type="SYSTEM", actor_id="gaos-gate",
            occurred_at="2026-10-01T10:10:00Z", visibility="SECURITY_RESTRICTED",
            content="SECURITY RESTRICTED: Private key seed verification log."
        ))

    def test_internal_note_server_side_filtering(self):
        """Verify Client Portal view includes ONLY PUBLIC timeline events (INTERNAL notes stripped)."""
        view = self.portal_service.get_client_case_view("case-a-1", authenticated_tenant_id=self.tenant_a)
        self.assertIsNotNone(view)
        timeline = view["public_timeline"]
        self.assertEqual(len(timeline), 1)
        self.assertEqual(timeline[0]["visibility"], "PUBLIC")
        self.assertIn("Hello Client A", timeline[0]["content"])
        self.assertNotIn("INTERNAL NOTE", str(view))
        self.assertNotIn("SECURITY RESTRICTED", str(view))

    def test_cross_tenant_portal_isolation(self):
        """Verify Client B authenticated tenant cannot access Client A case view."""
        view_b = self.portal_service.get_client_case_view("case-a-1", authenticated_tenant_id=self.tenant_b)
        self.assertIsNone(view_b, "Cross-tenant portal access permitted! Security breach.")


if __name__ == "__main__":
    unittest.main()
