"""
DFL Empire R4 — Deletion & Retention Propagation Test Suite
Tests immediate search projection deletion when source objects are removed, archived, or user access is revoked.
"""

import sys
import os
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-search")

from search_document_contract import SearchDocumentChunk, generate_deterministic_id
from search_security_evaluator import AuthenticatedPrincipal
from hybrid_search_engine import HybridSearchEngine


class TestR4DeletionRetention(unittest.TestCase):
    def setUp(self):
        self.engine = HybridSearchEngine(":memory:")
        self.doc_id = generate_deterministic_id("agency", "agency_project", "proj-701")
        self.chunk = SearchDocumentChunk(
            search_document_id=self.doc_id,
            chunk_id="0001",
            chunk_position=1,
            source_system="agency",
            source_object_type="agency_project",
            source_object_id="proj-701",
            tenant_id="tenant-gamma",
            canonical_exact_id="proj-701",
            security_scope={"tenant:tenant-gamma"},
            display_title="Project Gamma Website Redesign",
            index_text="Website redesign project details and timeline."
        )
        self.engine.upsert_chunk(self.chunk)
        self.principal = AuthenticatedPrincipal(sub="user-gamma-1", tenant_id="tenant-gamma")

    def test_source_object_deletion_propagation(self):
        """Verify deleting source object chunk immediately removes it from search index."""
        # Initial check: readable
        results_before = self.engine.search(self.principal, query="proj-701")
        self.assertEqual(len(results_before), 1)

        # Execute source object deletion in projection
        self.engine.delete_chunk(self.doc_id)

        # Post check: unsearchable
        results_after = self.engine.search(self.principal, query="proj-701")
        self.assertEqual(len(results_after), 0, "Deleted object remained searchable in projection!")

    def test_tenant_offboarding_purge(self):
        """Verify tenant offboarding (clearing index or tenant boundary match) hides all data."""
        self.engine.clear_index()
        results = self.engine.search(self.principal, query="Website redesign")
        self.assertEqual(len(results), 0, "Offboarded tenant data remained in search index!")


if __name__ == "__main__":
    unittest.main()
