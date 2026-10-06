"""
DFL Empire R3 — Notification Policy Engine
Sub-Gate R3.7 Implementation
Separates work item existence from operator interruption to prevent notification storms.
"""

from __future__ import annotations

import logging
from typing import Dict, List

from work_item_contract import WorkChannel, WorkItemEnvelope, WorkPriority

logger = logging.getLogger("dfl.notification_policy")


class NotificationPolicyEngine:
    def __init__(self):
        self._interrupted_count = 0
        self._batched_count = 0

    def evaluate_notification(self, item: WorkItemEnvelope) -> Dict[str, Any]:
        # High-urgency or security approval triggers immediate operator interruption
        should_interrupt = (
            item.priority == WorkPriority.URGENT
            or item.channel == WorkChannel.GAOS_APPROVAL
            or item.channel == WorkChannel.WATCHERS_ALERT
        )

        if should_interrupt:
            self._interrupted_count += 1
            action = "IMMEDIATE_INTERRUPT_ALERT"
            logger.info(f"Notification policy: Immediate interrupt triggered for {item.work_item_id} (Priority: {item.priority.value})")
        else:
            self._batched_count += 1
            action = "BATCH_INBOX_DIGEST"
            logger.info(f"Notification policy: Batched for digest for {item.work_item_id}")

        return {
            "work_item_id": item.work_item_id,
            "should_interrupt": should_interrupt,
            "action": action,
            "priority": item.priority.value,
        }
