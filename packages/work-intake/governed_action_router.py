"""
DFL Empire R3 — Governed Action Router
Sub-Gate R3.5 Implementation
Routes inbox operator actions to authoritative domain services without cross-domain DB mutation.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any, Dict, Optional

from work_item_contract import WorkItemEnvelope, WorkStatus

logger = logging.getLogger("dfl.governed_action_router")


class GovernedActionRouter:
    def __init__(self):
        self.action_history: list[Dict[str, Any]] = []

    def dispatch_action(
        self,
        item: WorkItemEnvelope,
        action_type: str,
        payload: Dict[str, Any],
        operator_id: str = "operator-001",
    ) -> Dict[str, Any]:
        logger.info(f"Routing action '{action_type}' for work item {item.work_item_id} by {operator_id}")

        action_id = f"act-{hashlib.sha256(f'{item.work_item_id}:{action_type}'.encode()).hexdigest()[:12]}"

        # Domain Routing Logic
        if action_type == "CREATE_AGENCY_REQUEST":
            domain_result = {
                "target_domain": "dfl-agency-portal",
                "service_request_id": f"req-ag-{item.work_item_id[:8]}",
                "status": "CREATED",
            }
            item.status = WorkStatus.NEEDS_ACTION

        elif action_type == "DRAFT_REPLY":
            domain_result = {
                "target_domain": "rezhub-mailcow",
                "draft_id": f"draft-mail-{item.work_item_id[:8]}",
                "status": "DRAFTED",
            }
            item.status = WorkStatus.WAITING

        elif action_type == "APPROVE_GAOS_REQUEST":
            domain_result = {
                "target_domain": "GAOS",
                "approval_id": payload.get("approval_id", "appr-default"),
                "status": "APPROVED",
            }
            item.status = WorkStatus.RESOLVED

        elif action_type == "CREATE_CRM_FOLLOWUP":
            domain_result = {
                "target_domain": "CRM",
                "activity_id": f"act-crm-{item.work_item_id[:8]}",
                "status": "SCHEDULED",
            }
            item.status = WorkStatus.NEEDS_ACTION

        else:
            domain_result = {
                "target_domain": item.source_system,
                "status": "PROCESSED",
            }
            item.status = WorkStatus.ACKNOWLEDGED

        record = {
            "action_id": action_id,
            "work_item_id": item.work_item_id,
            "action_type": action_type,
            "operator_id": operator_id,
            "domain_result": domain_result,
            "updated_item_status": item.status.value,
        }

        self.action_history.append(record)
        return record
