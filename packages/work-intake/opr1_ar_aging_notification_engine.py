"""
dfl-one / taxops: OPR-1.4 (GAP-004) Automated AR Aging Notifications & Needs Attention Projection Engine
"""

import datetime
from enum import Enum
from typing import Dict, List, Optional, Any


class ARAgingBucket(str, Enum):
    CURRENT = "CURRENT"
    DAYS_1_30 = "1-30 DAYS"
    DAYS_31_60 = "31-60 DAYS"
    DAYS_61_90 = "61-90 DAYS"
    DAYS_90_PLUS = "90+ DAYS"


class TaxOpsARAgingEngine:
    """
    Computes deterministic AR aging projections from TaxOps invoice state and emits
    evidence-backed DFL-One Needs Attention items with deterministic suppression.
    Authority Model:
    - TaxOps retains AR financial authority.
    - DFL-One displays projected Needs Attention items.
    - Notification state never alters AR financial balances.
    """

    def __init__(self):
        # Simulated TaxOps invoice state
        self._taxops_invoices: Dict[str, Dict[str, Any]] = {}
        self._followup_history: Dict[str, List[Dict[str, Any]]] = {}
        self._emitted_notifications: Dict[str, str] = {}  # invoice_id -> last_notification_timestamp

    def register_taxops_invoice(
        self,
        invoice_id: str,
        customer_org_id: str,
        amount_due: float,
        currency: str,
        due_date_iso: str,
        status: str = "UNPAID",
        last_payment_ref: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Registers an authoritative TaxOps invoice record.
        """
        invoice = {
            "invoice_id": invoice_id,
            "customer_org_id": customer_org_id,
            "amount_due": amount_due,
            "currency": currency,
            "due_date": due_date_iso,
            "status": status,  # UNPAID, PARTIALLY_PAID, PAID, DISPUTED, HELD
            "last_payment_ref": last_payment_ref,
            "authoritative_taxops_ref": f"TAXOPS-INV-{invoice_id}",
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        self._taxops_invoices[invoice_id] = invoice
        return invoice

    def record_followup_action(self, invoice_id: str, operator_id: str, note: str) -> Dict[str, Any]:
        """
        Records a completed AR follow-up workflow item in DFL-One.
        """
        if invoice_id not in self._taxops_invoices:
            raise KeyError(f"TaxOps invoice '{invoice_id}' not found.")

        followup_ref = f"FLP-{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')}"
        record = {
            "followup_ref": followup_ref,
            "invoice_id": invoice_id,
            "operator_id": operator_id,
            "note": note,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        self._followup_history.setdefault(invoice_id, []).append(record)
        return record

    def compute_invoice_aging(self, invoice_id: str, as_of_date: Optional[datetime.datetime] = None) -> Dict[str, Any]:
        """
        Computes deterministic aging metrics from TaxOps invoice due date.
        """
        invoice = self._taxops_invoices.get(invoice_id)
        if not invoice:
            raise KeyError(f"TaxOps invoice '{invoice_id}' not found.")

        now = as_of_date or datetime.datetime.now(datetime.timezone.utc)
        due_date = datetime.datetime.fromisoformat(invoice["due_date"].replace('Z', '+00:00'))

        delta_days = (now - due_date).days
        days_overdue = max(0, delta_days)

        if days_overdue == 0:
            bucket = ARAgingBucket.CURRENT
        elif 1 <= days_overdue <= 30:
            bucket = ARAgingBucket.DAYS_1_30
        elif 31 <= days_overdue <= 60:
            bucket = ARAgingBucket.DAYS_31_60
        elif 61 <= days_overdue <= 90:
            bucket = ARAgingBucket.DAYS_61_90
        else:
            bucket = ARAgingBucket.DAYS_90_PLUS

        followups = self._followup_history.get(invoice_id, [])
        last_followup = followups[-1]["followup_ref"] if followups else None

        return {
            "invoice_id": invoice_id,
            "customer_org_id": invoice["customer_org_id"],
            "amount_due": invoice["amount_due"],
            "currency": invoice["currency"],
            "due_date": invoice["due_date"],
            "days_overdue": days_overdue,
            "aging_bucket": bucket.value,
            "last_payment_ref": invoice["last_payment_ref"],
            "last_followup_ref": last_followup,
            "authoritative_taxops_ref": invoice["authoritative_taxops_ref"],
            "status": invoice["status"]
        }

    def generate_needs_attention_projections(self, as_of_date: Optional[datetime.datetime] = None) -> List[Dict[str, Any]]:
        """
        Generates evidence-backed Needs Attention projection items for DFL-One.
        Applies deterministic notification suppression rules.
        """
        projections = []
        now = as_of_date or datetime.datetime.now(datetime.timezone.utc)

        for invoice_id in self._taxops_invoices.keys():
            aging = self.compute_invoice_aging(invoice_id, as_of_date=now)

            # Deterministic suppression check
            status = aging["status"]
            if status in ["PAID", "DISPUTED", "HELD"] or aging["amount_due"] <= 0:
                continue  # Suppress paid, disputed, or held invoices

            if aging["days_overdue"] <= 0:
                continue  # Suppress current invoices not yet overdue

            # Suppress if follow-up was completed recently (e.g., within 7 days)
            followups = self._followup_history.get(invoice_id, [])
            if followups:
                last_fp_time = datetime.datetime.fromisoformat(followups[-1]["timestamp"].replace('Z', '+00:00'))
                if (now - last_fp_time).days < 7:
                    continue  # Suppress recently followed-up invoice

            projections.append({
                "work_item_id": f"WRK-AR-{invoice_id}",
                "channel": "SYSTEM_ALERTS",
                "status": "NEEDS_ACTION",
                "title": f"Overdue Receivable: {aging['customer_org_id']} ({aging['aging_bucket']})",
                "projection_data": aging,
                "external_ar_spreadsheet_required": "NO"
            })

        return projections

    def query_jarvis_ar_assistant(self, query: str) -> Dict[str, Any]:
        """
        Answers operator query backed strictly by TaxOps AR evidence.
        Guarantees: Jarvis does not write off debt, alter balance, or fabricate promises.
        """
        query_upper = query.upper()
        now = datetime.datetime.now(datetime.timezone.utc)
        all_agings = [self.compute_invoice_aging(inv_id, as_of_date=now) for inv_id in self._taxops_invoices.keys()]

        if "OVER 60" in query_upper or "60 DAYS" in query_upper:
            results = [a for a in all_agings if a["days_overdue"] > 60 and a["status"] == "UNPAID"]
            answer = f"Found {len(results)} customer invoice(s) over 60 days overdue."
        elif "FOLLOW-UP" in query_upper or "NEED" in query_upper:
            projections = self.generate_needs_attention_projections(as_of_date=now)
            results = projections
            answer = f"There are {len(projections)} overdue receivable item(s) requiring follow-up."
        elif "CHANGED" in query_upper or "YESTERDAY" in query_upper:
            results = [a for a in all_agings if a["last_followup_ref"] or a["last_payment_ref"]]
            answer = "Retrieved recent AR payment and follow-up updates."
        else:
            results = all_agings
            answer = f"Retrieved total {len(all_agings)} TaxOps invoice record(s)."

        return {
            "query": query,
            "answer": answer,
            "evidence_records": results,
            "authoritative_source": "TaxOps",
            "debt_writeoff_permitted": False,
            "balance_alteration_permitted": False,
            "external_spreadsheet_required": "NO"
        }
