"""
dfl-one: OPR-1.3 (GAP-001) Approved Quote -> Sales Order Conversion Bridge
"""

import datetime
import hashlib
import json
import uuid
from typing import Dict, List, Optional, Any


class QuoteRevalidationRequiredException(Exception):
    """Raised when an approved quote has been mutated or version mismatch occurs post-approval."""
    pass


class InvalidQuoteConversionException(Exception):
    """Raised when conversion preconditions are violated."""
    pass


class QuoteToSalesOrderBridge:
    """
    Coordinates conversion of an Approved Commercial Quote to a Commerce Sales Order.
    Authority Model:
    - Commercial/Agency domain retains Quote authority.
    - Commerce domain retains Sales Order authority.
    - DFL-One coordinates 1-click conversion and bidirectional lineage.
    """

    def __init__(self):
        # Simulated stores
        self._quotes: Dict[str, Dict[str, Any]] = {}
        self._sales_orders: Dict[str, Dict[str, Any]] = {}
        self._operation_idempotency: Dict[str, Dict[str, Any]] = {}
        self._lineage_registry: Dict[str, Dict[str, Any]] = {}

    def register_quote(
        self,
        quote_id: str,
        quote_version: int,
        customer_org_id: str,
        currency: str,
        line_items: List[Dict[str, Any]],
        approved_pricing: float,
        status: str = "APPROVED",
        approval_ref: Optional[str] = "GAOS-QUOTE-APPROVE-001"
    ) -> Dict[str, Any]:
        """
        Helper method to register a quote in the commercial owner domain.
        """
        # Calculate deterministic fingerprint of quote payload
        payload_str = json.dumps({
            "quote_id": quote_id,
            "version": quote_version,
            "customer_org_id": customer_org_id,
            "currency": currency,
            "items": line_items,
            "pricing": approved_pricing
        }, sort_keys=True)
        fingerprint = hashlib.sha256(payload_str.encode('utf-8')).hexdigest()

        quote = {
            "quote_id": quote_id,
            "quote_version": quote_version,
            "quote_fingerprint": fingerprint,
            "customer_org_id": customer_org_id,
            "currency": currency,
            "line_items": line_items,
            "approved_pricing": approved_pricing,
            "status": status,
            "approval_ref": approval_ref,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        self._quotes[quote_id] = quote
        return quote

    def convert_quote_to_sales_order(
        self,
        quote_id: str,
        quote_version: int,
        quote_fingerprint: str,
        conversion_operation_id: str,
        operator_id: str
    ) -> Dict[str, Any]:
        """
        Executes conversion of an approved quote to a commerce sales order.
        """
        # 1. Check lost-response operation_id idempotency
        if conversion_operation_id in self._operation_idempotency:
            existing_res = self._operation_idempotency[conversion_operation_id]
            return {
                **existing_res,
                "duplicate_suppressed": True,
                "duplicate_orders_created": 0,
                "duplicate_manual_field_entry": 0
            }

        # 2. Retrieve quote
        quote = self._quotes.get(quote_id)
        if not quote:
            raise InvalidQuoteConversionException(f"Quote '{quote_id}' not found.")

        # 3. Validate preconditions
        if quote["status"] != "APPROVED":
            raise InvalidQuoteConversionException(f"Quote '{quote_id}' status is '{quote['status']}', expected 'APPROVED'.")

        if quote["quote_version"] != quote_version:
            raise QuoteRevalidationRequiredException(
                f"Quote version mismatch: expected {quote_version}, found {quote['quote_version']}. Revalidation required."
            )

        if quote["quote_fingerprint"] != quote_fingerprint:
            raise QuoteRevalidationRequiredException(
                f"Quote payload modified post-approval for quote '{quote_id}'. Revalidation required according to policy."
            )

        if not quote["customer_org_id"] or not quote["line_items"]:
            raise InvalidQuoteConversionException("Quote contains invalid customer or empty line items.")

        # 4. Commerce creates authoritative Sales Order (quote record is NOT mutated)
        sales_order_id = f"SO-COMM-{uuid.uuid4().hex[:8]}"
        created_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

        sales_order = {
            "sales_order_id": sales_order_id,
            "customer_org_id": quote["customer_org_id"],
            "currency": quote["currency"],
            "line_items": quote["line_items"],
            "total_amount": quote["approved_pricing"],
            "source_quote_id": quote_id,
            "source_quote_version": quote_version,
            "conversion_operation_id": conversion_operation_id,
            "status": "PENDING_FULFILLMENT",
            "created_at": created_at,
            "created_by": operator_id
        }
        self._sales_orders[sales_order_id] = sales_order

        # 5. Register bidirectional lineage
        lineage = {
            "quote_id": quote_id,
            "quote_version": quote_version,
            "quote_fingerprint": quote_fingerprint,
            "conversion_operation_id": conversion_operation_id,
            "sales_order_id": sales_order_id,
            "customer_org_id": quote["customer_org_id"],
            "converted_at": created_at,
            "operator_id": operator_id
        }
        self._lineage_registry[quote_id] = lineage
        self._lineage_registry[sales_order_id] = lineage

        # 6. Format UX output
        result = {
            "status": "SUCCESS",
            "message": "Sales Order created",
            "sales_order_id": sales_order_id,
            "quote_id": quote_id,
            "quote_version": quote_version,
            "customer_org_id": quote["customer_org_id"],
            "total_amount": quote["approved_pricing"],
            "currency": quote["currency"],
            "next_operational_step": "PENDING_FULFILLMENT",
            "duplicate_suppressed": False,
            "duplicate_orders_created": 0,
            "duplicate_manual_field_entry": 0,
            "operator_actions_required": 1,
            "lineage": lineage
        }

        self._operation_idempotency[conversion_operation_id] = result
        return result

    def get_lineage(self, reference_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves bidirectional lineage mapping for a quote_id or sales_order_id.
        """
        return self._lineage_registry.get(reference_id)
