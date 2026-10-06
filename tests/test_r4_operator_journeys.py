"""
DFL Empire R4 — Daily Operator Journeys Test Suite
Certifies all 7 required R4 operator journeys.
"""

import sys
import os
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-search")

from search_document_contract import SearchDocumentChunk, generate_deterministic_id
from search_security_evaluator import AuthenticatedPrincipal
from hybrid_search_engine import HybridSearchEngine
from global_search_service import GlobalSearchService
from client_360_search_provider import Client360SearchProvider
from jarvis_search_interface import JarvisSearchInterface
from search_rebuild_manager import SearchRebuildManager


class TestR4OperatorJourneys(unittest.TestCase):
    def setUp(self):
        self.engine = HybridSearchEngine(":memory:")
        self.global_service = GlobalSearchService(self.engine)
        self.c360_provider = Client360SearchProvider(self.engine)
        self.jarvis_tool = JarvisSearchInterface(self.engine)
        self.rebuild_mgr = SearchRebuildManager(self.engine)

        self.tenant_id = "tenant-acme"
        self.principal = AuthenticatedPrincipal(
            sub="user-acme-1",
            tenant_id=self.tenant_id,
            roles={"admin"},
            acl_version_map={"taxops": 1, "crm": 1, "agency": 1}
        )

        # Seed test corpus
        self.org_chunk = SearchDocumentChunk(
            search_document_id=generate_deterministic_id("crm", "crm_organization", "org-acme"),
            chunk_id="0001", chunk_position=1, source_system="crm", source_object_type="crm_organization",
            source_object_id="org-acme", tenant_id=self.tenant_id, canonical_exact_id="CRM-ORG-ACME",
            source_acl_version=1, security_scope={f"tenant:{self.tenant_id}"},
            display_title="Acme Construction", index_text="Acme Construction commercial client org."
        )

        self.inv_chunk = SearchDocumentChunk(
            search_document_id=generate_deterministic_id("taxops", "taxops_invoice", "inv-fe8812a"),
            chunk_id="0001", chunk_position=1, source_system="taxops", source_object_type="taxops_invoice",
            source_object_id="inv-fe8812a", tenant_id=self.tenant_id, canonical_exact_id="INV-TX-FE8812A",
            source_acl_version=1, security_scope={f"tenant:{self.tenant_id}"},
            display_title="TaxOps Invoice INV-TX-FE8812A", index_text="Invoice for website redesign $2480."
        )

        self.msg_chunk = SearchDocumentChunk(
            search_document_id=generate_deterministic_id("rezhub-mailcow", "email_message", "msg-9901"),
            chunk_id="0001", chunk_position=1, source_system="rezhub-mailcow", source_object_type="email_message",
            source_object_id="msg-9901", tenant_id=self.tenant_id, canonical_exact_id="MSG-9901",
            source_acl_version=1, security_scope={f"tenant:{self.tenant_id}"},
            display_title="John Smith: Move launch date request", index_text="Can we move the homepage launch date to next Friday?"
        )

        self.engine.upsert_chunk(self.org_chunk)
        self.engine.upsert_chunk(self.inv_chunk)
        self.engine.upsert_chunk(self.msg_chunk)

    def test_journey_1_client_360_search(self):
        """Journey 1: Search customer name -> Client 360 results."""
        c360 = self.c360_provider.get_client_360_view(self.principal, "Acme Construction")
        self.assertEqual(len(c360["crm"]["organizations"]), 1)
        self.assertEqual(c360["crm"]["organizations"][0]["display_title"], "Acme Construction")

    def test_journey_2_exact_invoice_id(self):
        """Journey 2: Search exact invoice ID -> TaxOps result rank 1."""
        res = self.engine.search(self.principal, query="INV-TX-FE8812A")
        self.assertGreater(len(res), 0)
        self.assertEqual(res[0]["canonical_exact_id"], "INV-TX-FE8812A")
        self.assertEqual(res[0]["match_type"], "CANONICAL_EXACT_ID")

    def test_journey_3_natural_language_project_search(self):
        """Journey 3: Search natural language project request -> relevant message."""
        res = self.engine.search(self.principal, query="move launch date")
        self.assertGreater(len(res), 0)
        self.assertIn("John Smith", res[0]["display_title"])

    def test_journey_4_jarvis_evidence_qna(self):
        """Journey 4: Ask Jarvis a cross-system question -> evidence-backed answer."""
        ans = self.jarvis_tool.answer_with_evidence(self.principal, "What did John ask us to change about launch date?")
        self.assertGreater(len(ans.supported_facts), 0)
        self.assertIn("rezhub-mailcow", ans.supported_facts[0]["evidence_ref"])

    def test_journey_5_unauthorized_tenant_query(self):
        """Journey 5: Unauthorized tenant query -> zero leaked results."""
        unauth_principal = AuthenticatedPrincipal(sub="user-other", tenant_id="tenant-other")
        res = self.engine.search(unauth_principal, query="Acme Construction")
        self.assertEqual(len(res), 0)

    def test_journey_6_permission_revocation(self):
        """Journey 6: Change user permission -> restricted result disappears."""
        revoked_principal = AuthenticatedPrincipal(
            sub="user-acme-1",
            tenant_id=self.tenant_id,
            acl_version_map={"taxops": 2}  # Incremented active ACL version (invalidates chunk's ver 1)
        )
        res = self.engine.search(revoked_principal, query="INV-TX-FE8812A")
        self.assertEqual(len(res), 0)

    def test_journey_7_delete_and_rebuild_index(self):
        """Journey 7: Delete search index -> rebuild -> equivalent authorized results restored."""
        self.engine.clear_index()
        self.assertEqual(len(self.engine.search(self.principal, query="Acme Construction")), 0)

        # Rebuild
        authoritative_set = [self.org_chunk, self.inv_chunk, self.msg_chunk]
        self.rebuild_mgr.trigger_rebuild(authoritative_set, new_watermark="watermark-999")

        res = self.engine.search(self.principal, query="Acme Construction")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["canonical_exact_id"], "CRM-ORG-ACME")


if __name__ == "__main__":
    unittest.main()
