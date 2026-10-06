"""
DFL Empire R3 — Business Context Resolution Engine
Sub-Gate R3.2 Implementation
Correlates incoming work items with CRM, Agency, TaxOps, and Storage context.
Guarantees that unknown senders remain explicitly unlinked without fabrication.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from work_item_contract import WorkItemEnvelope

logger = logging.getLogger("dfl.context_resolution")


class BusinessContextResolutionEngine:
    def __init__(self):
        # Known customer database mapping for resolution
        self._known_contacts: Dict[str, Dict[str, Any]] = {
            "john@example.com": {
                "tenant_id": "tenant-acme-corp",
                "crm_customer_id": "crm-cust-acme-001",
                "crm_contact_id": "contact-john-smith",
                "agency_project_id": "proj-acme-redesign",
                "company_name": "Acme Construction",
                "outstanding_invoice_usd": 2480.00,
                "latest_request": "Homepage revision",
            }
        }
        self._manual_links: Dict[str, Dict[str, Any]] = {}

    def register_known_contact(self, email_or_phone: str, context: Dict[str, Any]):
        self._known_contacts[email_or_phone.lower()] = context

    def resolve_context(self, item: WorkItemEnvelope) -> Dict[str, Any]:
        sender_key = item.sender.lower()

        # Check explicit manual override first
        if sender_key in self._manual_links:
            ctx = self._manual_links[sender_key]
            item.tenant_id = ctx["tenant_id"]
            item.crm_customer_id = ctx["crm_customer_id"]
            item.crm_contact_id = ctx["crm_contact_id"]
            item.agency_project_id = ctx["agency_project_id"]
            return {
                "resolved": True,
                "confidence": 1.0,
                "source": "MANUAL_OPERATOR_LINK",
                "context": ctx,
            }

        # Check known contact mapping
        if sender_key in self._known_contacts:
            ctx = self._known_contacts[sender_key]
            item.tenant_id = ctx["tenant_id"]
            item.crm_customer_id = ctx["crm_customer_id"]
            item.crm_contact_id = ctx["crm_contact_id"]
            item.agency_project_id = ctx["agency_project_id"]
            return {
                "resolved": True,
                "confidence": 1.0,
                "source": "KNOWN_CRM_MATCH",
                "context": ctx,
            }

        # Check if item already carries explicit tenant/customer tags
        if item.tenant_id and item.crm_customer_id:
            return {
                "resolved": True,
                "confidence": 0.9,
                "source": "EXPLICIT_HEADER_MATCH",
                "context": {
                    "tenant_id": item.tenant_id,
                    "crm_customer_id": item.crm_customer_id,
                    "agency_project_id": item.agency_project_id,
                },
            }

        # UNKNOWN SENDER: Must remain explicitly unlinked without fabrication
        logger.info(f"Sender {item.sender} is unknown. Leaving business context explicitly unlinked.")
        return {
            "resolved": False,
            "confidence": 0.0,
            "source": "UNKNOWN_SENDER",
            "context": {
                "tenant_id": None,
                "crm_customer_id": None,
                "crm_contact_id": None,
                "agency_project_id": None,
                "company_name": "Unregistered / External Sender",
            },
        }

    def link_operator_context(self, sender: str, context: Dict[str, Any]):
        self._manual_links[sender.lower()] = context
        logger.info(f"Operator linked sender {sender} to customer {context.get('crm_customer_id')}")
