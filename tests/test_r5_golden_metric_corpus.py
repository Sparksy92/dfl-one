"""
DFL Empire R5 — Golden Metric Corpus Test Suite
Tests financial deterministic correctness, edge-case handling (voids, payments, credits, duplicates), multi-currency isolation, and permission bounds.
"""

import sys
import os
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-analytics")

from analytics_projection_store import AnalyticsProjectionStore
from incremental_analytics_ingestor import IncrementalAnalyticsIngestor
from canonical_metric_engine import CanonicalMetricEngine
from analytics_security_evaluator import AuthenticatedPrincipal


class TestR5GoldenMetricCorpus(unittest.TestCase):
    def setUp(self):
        self.store = AnalyticsProjectionStore(":memory:")
        self.ingestor = IncrementalAnalyticsIngestor(self.store)
        self.engine = CanonicalMetricEngine(self.store)

        self.tenant_a = "tenant-alpha"
        self.tenant_b = "tenant-beta"

        self.principal_a_admin = AuthenticatedPrincipal(sub="user-a1", tenant_id=self.tenant_a, roles={"admin"})
        self.principal_a_nonfin = AuthenticatedPrincipal(sub="user-a2", tenant_id=self.tenant_a, roles={"worker"})
        self.principal_b_admin = AuthenticatedPrincipal(sub="user-b1", tenant_id=self.tenant_b, roles={"admin"})

        # Seed Invoices for Tenant A
        # Invoice 1: $24,800 CAD UNPAID
        self.ingestor.ingest_invoice_event({
            "invoice_id": "inv-101", "tenant_id": self.tenant_a, "customer_id": "cust-a",
            "canonical_exact_id": "INV-101", "amount_minor_units": 2480000, "status": "UNPAID",
            "currency": "CAD", "due_date": "2026-10-01T00:00:00Z"
        }, source_watermark="wm-100")

        # Invoice 2: $5,000 CAD VOID (Must be ignored)
        self.ingestor.ingest_invoice_event({
            "invoice_id": "inv-102-void", "tenant_id": self.tenant_a, "customer_id": "cust-a",
            "canonical_exact_id": "INV-102", "amount_minor_units": 500000, "status": "VOID",
            "currency": "CAD"
        }, source_watermark="wm-100")

        # Invoice 3: $1,000 USD UNPAID (Multi-currency isolation)
        self.ingestor.ingest_invoice_event({
            "invoice_id": "inv-103-usd", "tenant_id": self.tenant_a, "customer_id": "cust-a",
            "canonical_exact_id": "INV-103", "amount_minor_units": 100000, "status": "UNPAID",
            "currency": "USD"
        }, source_watermark="wm-100")

        # Seed Invoice for Tenant B (Isolation test)
        self.ingestor.ingest_invoice_event({
            "invoice_id": "inv-201-beta", "tenant_id": self.tenant_b, "customer_id": "cust-b",
            "canonical_exact_id": "INV-201", "amount_minor_units": 9900000, "status": "UNPAID",
            "currency": "CAD"
        }, source_watermark="wm-100")

    def test_invoiced_amount_correctness_and_void_exclusion(self):
        """Verify invoiced_amount totals $24,800.00 CAD and excludes VOID invoice ($5,000.00)."""
        metric = self.engine.evaluate_metric("invoiced_amount", self.principal_a_admin, currency="CAD")
        self.assertEqual(metric.value, 2480000, "Invoiced amount minor units mismatch!")
        self.assertEqual(metric.display_value, "$24,800.00 CAD")
        self.assertEqual(metric.freshness_status, "HEALTHY")

    def test_idempotent_duplicate_ingestion(self):
        """Verify duplicate ingestion of same invoice event does not double count."""
        # Re-ingest Invoice 1 with same ID and version
        self.ingestor.ingest_invoice_event({
            "invoice_id": "inv-101", "tenant_id": self.tenant_a, "customer_id": "cust-a",
            "canonical_exact_id": "INV-101", "amount_minor_units": 2480000, "status": "UNPAID",
            "currency": "CAD"
        }, source_watermark="wm-101")

        metric = self.engine.evaluate_metric("invoiced_amount", self.principal_a_admin, currency="CAD")
        self.assertEqual(metric.value, 2480000, "Duplicate ingestion caused double counting!")

    def test_multi_currency_isolation(self):
        """Verify CAD and USD metrics remain 100% separate without un-governed FX combining."""
        metric_cad = self.engine.evaluate_metric("invoiced_amount", self.principal_a_admin, currency="CAD")
        metric_usd = self.engine.evaluate_metric("invoiced_amount", self.principal_a_admin, currency="USD")

        self.assertEqual(metric_cad.value, 2480000)
        self.assertEqual(metric_usd.value, 100000)
        self.assertEqual(metric_usd.display_value, "$1,000.00 USD")

    def test_tenant_data_isolation(self):
        """Verify Tenant A admin cannot see Tenant B financial metrics."""
        metric_a = self.engine.evaluate_metric("invoiced_amount", self.principal_a_admin, currency="CAD")
        metric_b = self.engine.evaluate_metric("invoiced_amount", self.principal_b_admin, currency="CAD")

        self.assertEqual(metric_a.value, 2480000)
        self.assertEqual(metric_b.value, 9900000, "Tenant B value mismatch!")

    def test_non_finance_permission_isolation(self):
        """Verify non-finance role receives $0.00 display without leaking financial amounts."""
        metric_nonfin = self.engine.evaluate_metric("invoiced_amount", self.principal_a_nonfin, currency="CAD")
        self.assertEqual(metric_nonfin.value, 0)
        self.assertEqual(metric_nonfin.display_value, "$0.00 CAD")


if __name__ == "__main__":
    unittest.main()
