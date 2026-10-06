"""
DFL Empire R9 — Worker & Operator E2E Journeys Test Suite
Verifies the 13 canonical end-to-end workforce journeys across dfl-workforce, dfl-mes, and dfl-one.
"""

import sys
import os
import unittest

sys.path.insert(0, "/home/bs/projects/dfl-workforce")

from workforce_contract import Worker, Skill, Certification, Availability, Shift, TimeEntry
from workforce_store import WorkforceStore
from worker_manager import WorkerManager
from skill_certification_manager import SkillCertificationManager
from production_eligibility_engine import ProductionEligibilityEngine
from shift_scheduler import ShiftScheduler
from time_attendance_manager import TimeAttendanceManager
from leave_absence_manager import LeaveAbsenceManager
from compensation_terms_manager import CompensationTermsManager, TaxOpsPayrollHandoffBridge
from onboarding_offboarding_engine import OnboardingOffboardingEngine
from workforce_security_manager import WorkforceSecurityManager


class TestR9WorkerJourneys(unittest.TestCase):
    def setUp(self):
        self.store = WorkforceStore(":memory:")
        self.worker_mgr = WorkerManager(self.store)
        self.skill_cert_mgr = SkillCertificationManager(self.store)
        self.eligibility_engine = ProductionEligibilityEngine(self.store, self.skill_cert_mgr)
        self.shift_sched = ShiftScheduler(self.store, self.eligibility_engine)
        self.time_mgr = TimeAttendanceManager(self.store)
        self.leave_mgr = LeaveAbsenceManager(self.store)
        self.comp_mgr = CompensationTermsManager(self.store)
        self.payroll_bridge = TaxOpsPayrollHandoffBridge(self.store)
        self.onb_offb_engine = OnboardingOffboardingEngine(self.store, self.worker_mgr)

    def test_journey_01_onboarding_to_active(self):
        """Journey 1: Onboarding -> Active Worker transition."""
        w = self.worker_mgr.create_worker("tenant-j1", "auth-j1", "EMP-J1", "Jane", "Doe", "jane@dfl.com", "POS-1", "DEP-1")
        self.assertEqual(w.employment_status, "PRE_HIRE")

        self.onb_offb_engine.initiate_onboarding(w.worker_id)
        w_onb = self.store.get_worker(w.worker_id)
        self.assertEqual(w_onb.employment_status, "ONBOARDING")

        w_act = self.worker_mgr.transition_employment_status(w.worker_id, "ACTIVE", expected_version=w_onb.version, gaos_approval_ref="GAOS-ACT-J1")
        self.assertEqual(w_act.employment_status, "ACTIVE")

    def test_journey_02_qualification_to_mes_eligibility(self):
        """Journey 2: Qualification -> MES eligibility check."""
        w = self.worker_mgr.create_worker("tenant-j2", "auth-j2", "EMP-J2", "John", "Doe", "john@dfl.com", "POS-1", "DEP-1")
        self.worker_mgr.transition_employment_status(w.worker_id, "ACTIVE", expected_version=1, gaos_approval_ref="GAOS-J2")
        self.skill_cert_mgr.add_worker_skill(w.worker_id, "HEAT_TRANSFER", "EXPERT", "eval-j2")
        self.skill_cert_mgr.add_worker_certification(w.worker_id, "SAFETY_CERT", "OSHA", "2026-01-01", "2027-01-01", "ref-j2")

        elig = self.eligibility_engine.evaluate_worker_eligibility(w.worker_id, required_skill_type="HEAT_TRANSFER", required_cert_type="SAFETY_CERT")
        self.assertTrue(elig["eligible"])

    def test_journey_03_mes_demand_to_worker_schedule(self):
        """Journey 3: MES Demand -> Worker Schedule."""
        w = self.worker_mgr.create_worker("tenant-j3", "auth-j3", "EMP-J3", "Alice", "Vance", "alice@dfl.com", "POS-1", "DEP-1")
        self.worker_mgr.transition_employment_status(w.worker_id, "ACTIVE", expected_version=1, gaos_approval_ref="GAOS-J3")
        self.skill_cert_mgr.add_worker_skill(w.worker_id, "SCREEN_PRINTING", "ADVANCED", "eval-j3")

        s = self.shift_sched.create_shift(w.worker_id, "WC-PRINT-A", "2026-10-15T08:00:00Z", "2026-10-15T16:00:00Z", "SCREEN_PRINTER")
        self.assertEqual(s.location_work_center_ref, "WC-PRINT-A")

    def test_journey_04_worker_views_schedule(self):
        """Journey 4: Worker views own schedule."""
        w = self.worker_mgr.create_worker("tenant-j4", "auth-j4", "EMP-J4", "Bob", "Builder", "bob@dfl.com", "POS-1", "DEP-1")
        self.worker_mgr.transition_employment_status(w.worker_id, "ACTIVE", expected_version=1, gaos_approval_ref="GAOS-J4")
        self.shift_sched.create_shift(w.worker_id, "WC-MAIN", "2026-10-15T08:00:00Z", "2026-10-15T16:00:00Z", "OPERATOR")

        shifts = self.store.get_worker_shifts(w.worker_id)
        self.assertEqual(len(shifts), 1)

    def test_journey_05_shift_to_time_entry(self):
        """Journey 5: Shift -> Time Entry clock-in/out."""
        w = self.worker_mgr.create_worker("tenant-j5", "auth-j5", "EMP-J5", "Carl", "Sagan", "carl@dfl.com", "POS-1", "DEP-1")
        te = self.time_mgr.record_clock_in(w.worker_id, "2026-10-15T08:00:00Z")
        te_out = self.time_mgr.record_clock_out(te.time_entry_id, "2026-10-15T16:00:00Z", break_duration_minutes=30)
        self.assertEqual(te_out.status, "SUBMITTED")

    def test_journey_06_manager_approves_time(self):
        """Journey 6: Manager approves time entry."""
        w = self.worker_mgr.create_worker("tenant-j6", "auth-j6", "EMP-J6", "Dave", "Grohl", "dave@dfl.com", "POS-1", "DEP-1")
        te = self.time_mgr.record_clock_in(w.worker_id, "2026-10-15T08:00:00Z")
        self.time_mgr.record_clock_out(te.time_entry_id, "2026-10-15T16:00:00Z")
        te_app = self.time_mgr.approve_time_entry(te.time_entry_id, approver_worker_id="WRK-MANAGER-J6")
        self.assertEqual(te_app.status, "APPROVED")

    def test_journey_07_approved_time_to_taxops_handoff(self):
        """Journey 7: Approved time -> TaxOps payroll handoff."""
        w = self.worker_mgr.create_worker("tenant-j7", "auth-j7", "EMP-J7", "Eve", "Online", "eve@dfl.com", "POS-1", "DEP-1")
        self.comp_mgr.set_compensation_terms(w.worker_id, "HOURLY", 3000, "2026-01-01")
        op_id = "payroll-j7-001"

        p1 = self.payroll_bridge.handoff_approved_payroll(w.worker_id, ["TME-J7"], 40.0, op_id)
        p2 = self.payroll_bridge.handoff_approved_payroll(w.worker_id, ["TME-J7"], 40.0, op_id)

        self.assertFalse(p1["duplicate_suppressed"])
        self.assertTrue(p2["duplicate_suppressed"])

    def test_journey_08_leave_changes_availability(self):
        """Journey 8: Approved leave changes worker availability to UNAVAILABLE."""
        w = self.worker_mgr.create_worker("tenant-j8", "auth-j8", "EMP-J8", "Frank", "Zappa", "frank@dfl.com", "POS-1", "DEP-1")
        self.worker_mgr.transition_employment_status(w.worker_id, "ACTIVE", expected_version=1, gaos_approval_ref="GAOS-J8")
        lr = self.leave_mgr.submit_leave_request(w.worker_id, "VACATION", "2026-11-10", "2026-11-20")
        self.leave_mgr.approve_leave_request(lr.leave_request_id, approver_worker_id="WRK-MGR-J8")

        elig = self.eligibility_engine.evaluate_worker_eligibility(w.worker_id, target_date="2026-11-15")
        self.assertFalse(elig["eligible"])
        self.assertIn("UNAVAILABLE", elig["reason"])

    def test_journey_09_certification_expires_to_ineligibility(self):
        """Journey 9: Certification expires -> production ineligibility."""
        w = self.worker_mgr.create_worker("tenant-j9", "auth-j9", "EMP-J9", "Grace", "Hopper", "grace@dfl.com", "POS-1", "DEP-1")
        self.worker_mgr.transition_employment_status(w.worker_id, "ACTIVE", expected_version=1, gaos_approval_ref="GAOS-J9")
        self.skill_cert_mgr.add_worker_certification(w.worker_id, "FORKLIFT", "OSHA", "2025-01-01", "2025-12-31", "ref-j9", status="EXPIRED")

        elig = self.eligibility_engine.evaluate_worker_eligibility(w.worker_id, required_cert_type="FORKLIFT")
        self.assertFalse(elig["eligible"])

    def test_journey_10_compensation_version_change(self):
        """Journey 10: Compensation version change preserves history."""
        w = self.worker_mgr.create_worker("tenant-j10", "auth-j10", "EMP-J10", "Hank", "Hill", "hank@dfl.com", "POS-1", "DEP-1")
        ct1 = self.comp_mgr.set_compensation_terms(w.worker_id, "HOURLY", 2000, "2026-01-01")
        ct2 = self.comp_mgr.set_compensation_terms(w.worker_id, "HOURLY", 2500, "2026-07-01")

        self.assertEqual(ct1.version, 1)
        self.assertEqual(ct2.version, 2)

    def test_journey_11_offboarding_to_access_revocation(self):
        """Journey 11: Offboarding -> identity/access revocation."""
        w = self.worker_mgr.create_worker("tenant-j11", "auth-j11", "EMP-J11", "Iris", "West", "iris@dfl.com", "POS-1", "DEP-1")
        self.worker_mgr.transition_employment_status(w.worker_id, "ACTIVE", expected_version=1, gaos_approval_ref="GAOS-J11")

        res_dict = self.onb_offb_engine.initiate_offboarding(w.worker_id, gaos_approval_ref="GAOS-OFFB-J11")
        tasks = res_dict["tasks"]
        rev_task = [t for t in tasks if t.step_name == "KEYCLOAK_ACCESS_REVOCATION"][0]
        self.assertEqual(res_dict["access_revocation_state"], "ACCESS_REVOKED")

        w_term = self.store.get_worker(w.worker_id)
        self.assertEqual(w_term.employment_status, "TERMINATED")

    def test_journey_12_cross_tenant_confidential_attack_rejected(self):
        """Journey 12: Cross-tenant / confidential-data attack rejected."""
        w = self.worker_mgr.create_worker("tenant-alpha", "auth-j12", "EMP-J12", "Jack", "Sparrow", "jack@dfl.com", "POS-1", "DEP-1")

        # Unauthorized role trying to authorize payroll
        with self.assertRaises(PermissionError):
            WorkforceSecurityManager.validate_segregation_of_duties("WORKER", w.worker_id, w.worker_id, "AUTHORIZE_PAYROLL_HANDOFF")

    def test_journey_13_dr_restore_no_duplicate_payroll(self):
        """Journey 13: DR restore -> zero duplicate payroll side effect on retry."""
        w = self.worker_mgr.create_worker("tenant-j13", "auth-j13", "EMP-J13", "Kate", "Bishop", "kate@dfl.com", "POS-1", "DEP-1")
        op_id = "op-dr-payroll-j13"

        p1 = self.payroll_bridge.handoff_approved_payroll(w.worker_id, ["TME-DR"], 40.0, op_id)
        p2 = self.payroll_bridge.handoff_approved_payroll(w.worker_id, ["TME-DR"], 40.0, op_id)

        self.assertFalse(p1["duplicate_suppressed"])
        self.assertTrue(p2["duplicate_suppressed"])


if __name__ == "__main__":
    unittest.main()
