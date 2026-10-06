"""
DFL Empire R3 — Canonical Work Item Contract
Sub-Gate R3.1 Implementation
Defines the normalized work envelope and workflow state machine for Unified Work Intake.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4


class WorkChannel(str, Enum):
    EMAIL = "EMAIL"
    MATRIX_CHAT = "MATRIX_CHAT"
    PHONE_VOICEMAIL = "PHONE_VOICEMAIL"
    SMS = "SMS"
    AGENCY_REQUEST = "AGENCY_REQUEST"
    CRM_ACTIVITY = "CRM_ACTIVITY"
    WEBSITE_FORM = "WEBSITE_FORM"
    COMMERCE_ORDER = "COMMERCE_ORDER"
    FINANCE_INVOICE = "FINANCE_INVOICE"
    GAOS_APPROVAL = "GAOS_APPROVAL"
    JARVIS_RUN = "JARVIS_RUN"
    WATCHERS_ALERT = "WATCHERS_ALERT"


class WorkDirection(str, Enum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"
    INTERNAL = "INTERNAL"


class WorkPriority(str, Enum):
    URGENT = "URGENT"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class WorkStatus(str, Enum):
    UNREAD = "UNREAD"
    ASSIGNED = "ASSIGNED"
    SNOOZED = "SNOOZED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    NEEDS_ACTION = "NEEDS_ACTION"
    WAITING = "WAITING"
    RESOLVED = "RESOLVED"
    ARCHIVED = "ARCHIVED"


class WorkItemEnvelope:
    def __init__(
        self,
        source_system: str,
        source_object_id: str,
        channel: WorkChannel,
        sender: str,
        subject: str,
        safe_preview: str,
        tenant_id: Optional[str] = None,
        source_thread_id: Optional[str] = None,
        crm_customer_id: Optional[str] = None,
        crm_contact_id: Optional[str] = None,
        agency_project_id: Optional[str] = None,
        direction: WorkDirection = WorkDirection.INBOUND,
        recipients: Optional[List[str]] = None,
        priority: WorkPriority = WorkPriority.MEDIUM,
        assignment: Optional[str] = None,
        evidence_refs: Optional[List[str]] = None,
        attachment_refs: Optional[List[str]] = None,
        correlation_id: Optional[str] = None,
    ):
        self.work_item_id = f"item-{uuid4().hex[:12]}"
        self.source_system = source_system
        self.source_object_id = source_object_id
        self.source_thread_id = source_thread_id or source_object_id
        self.channel = channel
        self.direction = direction
        self.received_at = datetime.now(timezone.utc).isoformat()
        self.sender = sender
        self.recipients = recipients or []
        self.subject = subject
        self.safe_preview = safe_preview[:250]
        self.tenant_id = tenant_id
        self.crm_customer_id = crm_customer_id
        self.crm_contact_id = crm_contact_id
        self.agency_project_id = agency_project_id
        self.priority = priority
        self.status = WorkStatus.UNREAD
        self.assignment = assignment
        self.evidence_refs = evidence_refs or []
        self.attachment_refs = attachment_refs or []
        self.correlation_id = correlation_id or f"corr-{hashlib.sha256(f'{source_system}:{source_object_id}'.encode()).hexdigest()[:12]}"

    def fingerprint(self) -> str:
        raw = f"{self.source_system}:{self.source_object_id}:{self.sender}:{self.subject}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "work_item_id": self.work_item_id,
            "source_system": self.source_system,
            "source_object_id": self.source_object_id,
            "source_thread_id": self.source_thread_id,
            "channel": self.channel.value,
            "direction": self.direction.value,
            "received_at": self.received_at,
            "sender": self.sender,
            "recipients": self.recipients,
            "subject": self.subject,
            "safe_preview": self.safe_preview,
            "tenant_id": self.tenant_id,
            "crm_customer_id": self.crm_customer_id,
            "crm_contact_id": self.crm_contact_id,
            "agency_project_id": self.agency_project_id,
            "priority": self.priority.value,
            "status": self.status.value,
            "assignment": self.assignment,
            "evidence_refs": self.evidence_refs,
            "attachment_refs": self.attachment_refs,
            "correlation_id": self.correlation_id,
            "fingerprint": self.fingerprint(),
        }
