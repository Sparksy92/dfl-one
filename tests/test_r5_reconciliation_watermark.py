"""
DFL Empire R5 — Reconciliation Watermark Test Suite
Tests consistent watermark reconciliation and STALE vs RECONCILIATION_FAILED status handling.
"""

import sys
import os
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-analytics")

from analytics_projection_store import AnalyticsProjectionStore
from incremental_analytics_ingestor import IncrementalAnalyticsIngestor
from financial_reconciliation_engine import FinancialReconciliationEngine


class TestR5ReconciliationWatermark(unittest.TestCase):
    def setUp(self):
        self.store = AnalyticsProjectionStore(":memory:")
        self.ingestor = IncrementalAnalyticsIngestor(self.store)
        self.rec_engine = FinancialReconciliationEngine(self.store)
        self.tenant_id = "tenant-rec-01"

        # Authoritative TaxOps invoices list
        self.auth_invoices = [
            {"invoice_id": "inv-r1", "amount_minor_units": 100000, "status": "UNPAID"},
            {"invoice_id": "inv-r2", "amount_minor_units": 200000, "status": "UNPAID"}
        ]

        # Ingest invoice inv-r1 into projection at watermark wm-100
        self.ingestor.ingest_invoice_event({
            "invoice_id": "inv-r1", "tenant_id": self.tenant_id, "amount_minor_units": 100000,
            "status": "UNPAID", "currency": "CAD"
        }, source_watermark="wm-100")

    def test_stale_watermark_status(self):
        """Verify analytics projection behind source watermark reports STALE (not RECONCILIATION_FAILED)."""
        # TaxOps is at watermark wm-200, but projection is at wm-100
        res = self.rec_engine.reconcile_taxops_invoices(
            tenant_id=self.tenant_id,
            authoritative_taxops_invoices=self.auth_invoices,
            taxops_source_watermark="wm-200"  # Ahead of projection
        )
        self.assertEqual(res.freshness_status, "STALE")
        self.assertFalse(res.is_watermark_aligned)

    def test_aligned_watermark_healthy_reconciliation(self):
        """Verify aligned watermark with 0 variance yields HEALTHY status."""
        # Ingest inv-r2 at wm-200 so projection catches up
        self.ingestor.ingest_invoice_event({
            "invoice_id": "inv-r2", "tenant_id": self.tenant_id, "amount_minor_units": 200000,
            "status": "UNPAID", "currency": "CAD"
        }, source_watermark="wm-200")

        res = self.rec_engine.reconcile_taxops_invoices(
            tenant_id=self.tenant_id,
            authoritative_taxops_invoices=self.auth_invoices,
            taxops_source_watermark="wm-200"
        )

        self.assertEqual(res.freshness_status, "HEALTHY")
        self.assertEqual(res.amount_variance_minor_units, 0)
        self.assertEqual(res.unexplained_variance_minor_units, 0)


if __name__ == "__main__":
    unittest.main()
