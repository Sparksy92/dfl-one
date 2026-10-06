"""
DFL Empire R3 — Jarvis Triage Integration Service
Sub-Gate R3.4 Implementation
Provides AI-assisted message summarization, intent classification, urgency estimation, and suggested next actions.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from work_item_contract import WorkItemEnvelope, WorkPriority

logger = logging.getLogger("dfl.jarvis_triage")


class JarvisTriageService:
    def triage_item(
        self,
        item: WorkItemEnvelope,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        safe_text = f"{item.subject} {item.safe_preview}".lower()

        # Classify Intent & Urgency
        if "urgent" in safe_text or "outage" in safe_text or "down" in safe_text:
            estimated_priority = WorkPriority.URGENT
            intent = "INCIDENT_ALERT"
        elif "change" in safe_text or "revision" in safe_text or "update" in safe_text:
            estimated_priority = WorkPriority.HIGH
            intent = "SERVICE_REQUEST_CHANGE"
        elif "invoice" in safe_text or "billing" in safe_text or "payment" in safe_text:
            estimated_priority = WorkPriority.MEDIUM
            intent = "BILLING_QUERY"
        else:
            estimated_priority = WorkPriority.LOW
            intent = "GENERAL_COMMUNICATION"

        item.priority = estimated_priority

        # Generate Safe Summary & Suggested Actions
        summary = f"Client requests: {item.safe_preview[:120]}..."
        suggested_actions = [
            {"action": "CREATE_AGENCY_REQUEST", "label": "Create Service Request"},
            {"action": "ATTACH_TO_PROJECT", "label": "Attach to Existing Project"},
            {"action": "DRAFT_REPLY", "label": "Draft Response"},
        ]

        if item.channel.value == "GAOS_APPROVAL":
            suggested_actions.append({"action": "APPROVE_GAOS_REQUEST", "label": "Approve GAOS Request"})

        triage_report = {
            "work_item_id": item.work_item_id,
            "intent": intent,
            "estimated_priority": estimated_priority.value,
            "summary": summary,
            "suggested_actions": suggested_actions,
            "context_linked": context.get("resolved", False) if context else False,
            "confidence": context.get("confidence", 0.0) if context else 0.0,
        }

        logger.info(f"Jarvis triaged work item {item.work_item_id}: Intent={intent}, Priority={estimated_priority.value}")
        return triage_report
