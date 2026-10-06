"""
DFL Empire R3 — Threading & Deduplication Engine
Sub-Gate R3.6 Implementation
Prevents duplicate work items from repeated webhooks/retries and maintains stable thread correlation.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from work_item_contract import WorkItemEnvelope

logger = logging.getLogger("dfl.work_item_dedup")


class WorkItemDedupEngine:
    def __init__(self):
        self._seen_fingerprints: Dict[str, WorkItemEnvelope] = {}
        self._threads: Dict[str, List[WorkItemEnvelope]] = {}

    def process_inbound_item(self, item: WorkItemEnvelope) -> Dict[str, Any]:
        fp = item.fingerprint()

        # Check duplicate suppression
        if fp in self._seen_fingerprints:
            existing = self._seen_fingerprints[fp]
            logger.info(f"Duplicate work item suppressed for fingerprint {fp[:12]}. Reusing {existing.work_item_id}")
            return {
                "is_duplicate": True,
                "reused": True,
                "item": existing,
            }

        self._seen_fingerprints[fp] = item

        # Threading correlation
        thread_id = item.source_thread_id
        if thread_id not in self._threads:
            self._threads[thread_id] = []
        self._threads[thread_id].append(item)

        logger.info(f"Work item {item.work_item_id} added to thread {thread_id} (Total items in thread: {len(self._threads[thread_id])})")
        return {
            "is_duplicate": False,
            "reused": False,
            "item": item,
            "thread_count": len(self._threads[thread_id]),
        }

    def get_thread_items(self, thread_id: str) -> List[WorkItemEnvelope]:
        return self._threads.get(thread_id, [])
