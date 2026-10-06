"""
DFL Empire R5 — Executive Journeys Test Suite
Certifies all 8 required R5 executive command center journeys.
"""

import sys
import os
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-analytics")

from analytics_projection_store import AnalyticsProjectionStore
from incremental_analytics_ingestor import IncrementalAnalyticsIngestor
from canonical_metric_engine import CanonicalMetricEngine
from executive_command_center_service import ExecutiveCommandCenterService
from jarvis_analytics_interface import JarvisAnalyticsInterface
from analytics_security_evaluator import AuthenticatedPrincipal


class TestR5ExecutiveJourneys(unittest.TestCase):
    def setUp(self):
        self.store = AnalyticsProjectionStore(":memory:")
        self.ingestor = IncrementalAnalyticsIngestor(self.store)
        self.engine = CanonicalMetricEngine(self.store)
        self.service = ExecutiveCommandCenterService(self.engine)
        self.jarvis = JarvisAnalyticsInterface(self.engine)

        self.tenant_id = "tenant-exec-01"
        self.principal_admin = AuthenticatedPrincipal(sub="exec-1", tenant_id=self.tenant_id, roles={"admin"})
        self.principal_restricted = AuthenticatedPrincipal(sub="exec-2", tenant_id=self.tenant_id, roles={"worker"})

        # Seed facts
        self.ingestor.ingest_invoice_event({
            "invoice_id": "inv-ex-1", "tenant_id": self.tenant_id, "customer_id": "cust-ex",
            "canonical_exact_id": "INV-EX-1", "amount_minor_units": 2480000, "status": "UNPAID",
            "currency": "CAD"
        }, source_watermark="wm-exec-1")

        self.ingestor.ingest_pipeline_event({
            "opportunity_id": "opp-ex-1", "tenant_id": self.tenant_id, "customer_id": "cust-ex",
            "opportunity_name": "Website Redesign Deal", "stage": "PROSPECTING",
            "amount_minor_units": 1500000, "currency": "CAD"
        }, source_watermark="wm-exec-1")

    def test_journey_1_morning_command_center(self):
        """Journey 1: Login -> dashboard -> current business state."""
        dash = self.service.get_command_center_dashboard(self.principal_admin)
        self.assertIn("financials", dash)
        self.assertEqual(dash["financials"]["invoiced_amount"]["display_value"], "$24,800.00 CAD")

    def test_journey_2_finance_drillthrough(self):
        """Journey 2: Outstanding receivables -> TaxOps invoice set drilldown."""
        dash = self.service.get_command_center_dashboard(self.principal_admin)
        ar_metric = dash["financials"]["accounts_receivable_outstanding"]
        self.assertEqual(ar_metric["display_value"], "$24,800.00 CAD")
        self.assertEqual(ar_metric["evidence_drilldown_ids"], ["INV-EX-1"])

    def test_journey_3_sales_pipeline(self):
        """Journey 3: Pipeline aggregate -> opportunity drilldown."""
        dash = self.service.get_command_center_dashboard(self.principal_admin)
        pipe = dash["sales"]["pipeline_value"]
        self.assertEqual(pipe["display_value"], "$15,000.00 CAD")
        self.assertEqual(pipe["evidence_drilldown_ids"], ["opp-ex-1"])

    def test_journey_4_and_5_delivery_workload(self):
        """Journeys 4 & 5: Open projects & unresolved workload."""
        dash = self.service.get_command_center_dashboard(self.principal_admin)
        self.assertIn("delivery", dash)
        self.assertIn("workload", dash)

    def test_journey_6_jarvis_analytics_qna(self):
        """Journey 6: Ask business question -> canonical metric answer with evidence."""
        res = self.jarvis.answer_executive_question(self.principal_admin, "How much did we invoice this month?")
        self.assertGreater(len(res.measured_facts), 0)
        fact = res.measured_facts[0]
        self.assertEqual(fact["measured_value"], "$24,800.00 CAD")
        self.assertEqual(fact["evidence"], ["INV-EX-1"])

    def test_journey_7_permission_isolation(self):
        """Journey 7: Restricted user cannot infer protected aggregate."""
        dash = self.service.get_command_center_dashboard(self.principal_restricted)
        self.assertEqual(dash["financials"]["invoiced_amount"]["display_value"], "$0.00 CAD")

    def test_journey_8_stale_analytics_indicator(self):
        """Journey 8: Stop ingestion / set stale watermark -> explicit stale status."""
        cursor = self.store.conn.cursor()
        cursor.execute("UPDATE analytics_watermarks SET status = 'STALE' WHERE source_system = 'taxops'")
        self.store.conn.commit()

        dash = self.service.get_command_center_dashboard(self.principal_admin)
        self.assertEqual(dash["financials"]["invoiced_amount"]["freshness_status"], "STALE")


if __name__ == "__main__":
    unittest.main()
