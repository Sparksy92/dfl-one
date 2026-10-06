"""
DFL Empire R3 — Unified Inbox UI Service
Sub-Gate R3.3 Implementation
Provides operator workspace views, multi-attribute filtering, and work item state management.
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any, Dict, List, Optional

from work_item_contract import WorkChannel, WorkItemEnvelope, WorkPriority, WorkStatus

logger = logging.getLogger("dfl.unified_inbox")


class InboxView(str, Enum):
    MY_WORK = "MY_WORK"
    UNASSIGNED = "UNASSIGNED"
    NEEDS_ACTION = "NEEDS_ACTION"
    WAITING = "WAITING"
    APPROVALS = "APPROVALS"
    CLIENT_MESSAGES = "CLIENT_MESSAGES"
    SYSTEM_ALERTS = "SYSTEM_ALERTS"
    ARCHIVED = "ARCHIVED"


class UnifiedInboxService:
    def __init__(self):
        self._items: Dict[str, WorkItemEnvelope] = {}

    def ingest_work_item(self, item: WorkItemEnvelope) -> WorkItemEnvelope:
        self._items[item.work_item_id] = item
        logger.info(f"Ingested work item {item.work_item_id} from {item.source_system} ({item.channel.value})")
        return item

    def get_work_item(self, work_item_id: str) -> Optional[WorkItemEnvelope]:
        return self._items.get(work_item_id)

    def get_view_items(
        self,
        view: InboxView,
        operator_id: Optional[str] = None,
    ) -> List[WorkItemEnvelope]:
        all_items = list(self._items.values())

        if view == InboxView.MY_WORK:
            return [i for i in all_items if i.assignment == operator_id and i.status != WorkStatus.ARCHIVED]
        elif view == InboxView.UNASSIGNED:
            return [i for i in all_items if i.assignment is None and i.status != WorkStatus.ARCHIVED]
        elif view == InboxView.NEEDS_ACTION:
            return [i for i in all_items if i.status in [WorkStatus.NEEDS_ACTION, WorkStatus.UNREAD]]
        elif view == InboxView.WAITING:
            return [i for i in all_items if i.status == WorkStatus.WAITING]
        elif view == InboxView.APPROVALS:
            return [i for i in all_items if i.channel == WorkChannel.GAOS_APPROVAL and i.status != WorkStatus.ARCHIVED]
        elif view == InboxView.CLIENT_MESSAGES:
            return [i for i in all_items if i.channel in [WorkChannel.EMAIL, WorkChannel.MATRIX_CHAT, WorkChannel.SMS, WorkChannel.AGENCY_REQUEST] and i.status != WorkStatus.ARCHIVED]
        elif view == InboxView.SYSTEM_ALERTS:
            return [i for i in all_items if i.channel in [WorkChannel.WATCHERS_ALERT, WorkChannel.JARVIS_RUN] and i.status != WorkStatus.ARCHIVED]
        elif view == InboxView.ARCHIVED:
            return [i for i in all_items if i.status in [WorkStatus.ARCHIVED, WorkStatus.RESOLVED]]
        return all_items

    def filter_items(
        self,
        customer_id: Optional[str] = None,
        project_id: Optional[str] = None,
        channel: Optional[WorkChannel] = None,
        priority: Optional[WorkPriority] = None,
        assignee: Optional[str] = None,
        status: Optional[WorkStatus] = None,
    ) -> List[WorkItemEnvelope]:
        results = list(self._items.values())
        if customer_id:
            results = [i for i in results if i.crm_customer_id == customer_id]
        if project_id:
            results = [i for i in results if i.agency_project_id == project_id]
        if channel:
            results = [i for i in results if i.channel == channel]
        if priority:
            results = [i for i in results if i.priority == priority]
        if assignee:
            results = [i for i in results if i.assignment == assignee]
        if status:
            results = [i for i in results if i.status == status]
        return results

    def update_status(self, work_item_id: str, new_status: WorkStatus) -> WorkItemEnvelope:
        item = self.get_work_item(work_item_id)
        if not item:
            raise ValueError(f"Work item {work_item_id} not found")
        item.status = new_status
        logger.info(f"Updated status of {work_item_id} to {new_status.value}")
        return item

    def assign_operator(self, work_item_id: str, operator_id: str) -> WorkItemEnvelope:
        item = self.get_work_item(work_item_id)
        if not item:
            raise ValueError(f"Work item {work_item_id} not found")
        item.assignment = operator_id
        if item.status == WorkStatus.UNREAD:
            item.status = WorkStatus.ASSIGNED
        logger.info(f"Assigned work item {work_item_id} to {operator_id}")
        return item
