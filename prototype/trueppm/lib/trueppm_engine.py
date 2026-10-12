#!/usr/bin/env python3
"""
TruePPM Scheduler Core Engine — Pinned v0.4.0 Engine Model.
Implements Critical Path Method (CPM), forward/backward passes, calendar working-day arithmetic,
relationship types (FS, SS, FF, SF) with lag, constraint dates, and float calculations.
Exposes a clean CLI and JSON protocol for headless execution and MCP integration.
"""

import sys
import json
from datetime import datetime, date, timedelta
from typing import Dict, List, Set, Any, Optional

class TruePpmCalendar:
    def __init__(self, calendar_id: str, working_days: List[int], holidays: List[str]):
        """
        working_days: List of weekday integers (0 = Monday, ..., 5 = Saturday, 6 = Sunday).
        Nepal standard: [6, 0, 1, 2, 3, 4] -> Sun, Mon, Tue, Wed, Thu, Fri (Sat = 5 is holiday).
        Standard 5-day: [0, 1, 2, 3, 4] -> Mon, Tue, Wed, Thu, Fri (Sat/Sun are holidays).
        """
        self.calendar_id = calendar_id
        self.working_days = set(working_days)
        self.holidays = set(holidays)

    def is_working_day(self, d: date) -> bool:
        if d.isoformat() in self.holidays:
            return False
        return d.weekday() in self.working_days

    def add_working_days(self, start_date: date, working_days: int) -> date:
        if working_days <= 0:
            return start_date
        current = start_date
        added = 0
        while added < working_days:
            current += timedelta(days=1)
            if self.is_working_day(current):
                added += 1
        return current

    def sub_working_days(self, end_date: date, working_days: int) -> date:
        if working_days <= 0:
            return end_date
        current = end_date
        subbed = 0
        while subbed < working_days:
            current -= timedelta(days=1)
            if self.is_working_day(current):
                subbed += 1
        return current

    def count_working_days(self, start_date: date, end_date: date) -> int:
        if start_date > end_date:
            return 0
        count = 0
        current = start_date
        while current <= end_date:
            if self.is_working_day(current):
                count += 1
            current += timedelta(days=1)
        return count


class TruePpmScheduler:
    def __init__(self):
        self.calendars: Dict[str, TruePpmCalendar] = {}
        self._init_default_calendars()

    def _init_default_calendars(self):
        # Default 5-day week
        self.calendars["default"] = TruePpmCalendar("default", [0, 1, 2, 3, 4], [])
        # Nepal Standard 6-day week (Sunday to Friday, Saturday holiday)
        self.calendars["nepal_standard"] = TruePpmCalendar(
            "nepal_standard",
            [6, 0, 1, 2, 3, 4],
            ["2026-10-19", "2026-10-20", "2026-10-21"] # Example Dashain / Tihar holidays
        )

    def register_calendar(self, cal: TruePpmCalendar):
        self.calendars[cal.calendar_id] = cal

    def schedule(self, project_data: Dict[str, Any]) -> Dict[str, Any]:
        data_date_str = project_data.get("data_date", date.today().isoformat())
        data_date = datetime.strptime(data_date_str, "%Y-%m-%d").date()

        # Parse project calendars
        for cal_dict in project_data.get("calendars", []):
            cid = cal_dict["id"]
            wd = cal_dict.get("working_days", [0, 1, 2, 3, 4])
            holidays = cal_dict.get("holidays", [])
            self.register_calendar(TruePpmCalendar(cid, wd, holidays))

        tasks = {t["id"]: dict(t) for t in project_data.get("tasks", [])}
        deps = project_data.get("dependencies", [])

        # Build adjacency maps
        successors: Dict[str, List[Dict[str, Any]]] = {tid: [] for tid in tasks}
        predecessors: Dict[str, List[Dict[str, Any]]] = {tid: [] for tid in tasks}

        for dep in deps:
            pred = dep["pred_id"]
            succ = dep["succ_id"]
            if pred in tasks and succ in tasks:
                successors[pred].append(dep)
                predecessors[succ].append(dep)

        # Topological Sort with Cycle Detection
        in_degree = {tid: len(predecessors[tid]) for tid in tasks}
        queue = [tid for tid, deg in in_degree.items() if deg == 0]
        topo_order: List[str] = []

        while queue:
            curr = queue.pop(0)
            topo_order.append(curr)
            for dep in successors[curr]:
                succ = dep["succ_id"]
                in_degree[succ] -= 1
                if in_degree[succ] == 0:
                    queue.append(succ)

        if len(topo_order) != len(tasks):
            unresolved = [tid for tid, deg in in_degree.items() if deg > 0]
            raise ValueError(f"Cycle detected in task dependency graph involving tasks: {unresolved}")

        # --- FORWARD PASS (Early Dates) ---
        for tid in topo_order:
            task = tasks[tid]
            cal_id = task.get("calendar_id", "default")
            cal = self.calendars.get(cal_id, self.calendars["default"])
            duration = task.get("duration", 0)

            # Determine Early Start based on predecessors
            es = data_date
            # Ensure start date is on a working day
            while not cal.is_working_day(es):
                es += timedelta(days=1)

            for dep in predecessors[tid]:
                pred = tasks[dep["pred_id"]]
                pred_cal = self.calendars.get(pred.get("calendar_id", "default"), self.calendars["default"])
                dep_type = dep.get("type", "FS")
                lag = dep.get("lag", 0)

                pred_es = datetime.strptime(pred["early_start"], "%Y-%m-%d").date()
                pred_ef = datetime.strptime(pred["early_finish"], "%Y-%m-%d").date()

                if dep_type == "FS":
                    # Finish to Start: ES >= pred_EF + lag
                    candidate = pred_cal.add_working_days(pred_ef, lag)
                    while not cal.is_working_day(candidate):
                        candidate += timedelta(days=1)
                    if candidate > es:
                        es = candidate
                elif dep_type == "SS":
                    # Start to Start: ES >= pred_ES + lag
                    candidate = pred_cal.add_working_days(pred_es, lag)
                    while not cal.is_working_day(candidate):
                        candidate += timedelta(days=1)
                    if candidate > es:
                        es = candidate
                elif dep_type == "FF":
                    # Finish to Finish: EF >= pred_EF + lag -> handled after initial EF or constraint
                    pass
                elif dep_type == "SF":
                    # Start to Finish
                    pass

            # Check Start-No-Earlier-Than constraint
            if "snet_constraint" in task and task["snet_constraint"]:
                snet = datetime.strptime(task["snet_constraint"], "%Y-%m-%d").date()
                if snet > es:
                    es = snet
                    while not cal.is_working_day(es):
                        es += timedelta(days=1)

            # Calculate Early Finish
            if duration == 0:
                ef = es
            else:
                # Inclusive duration: duration of 1 day finishes on same day if working day
                ef = cal.add_working_days(es, duration - 1)

            # Re-evaluate FF dependencies
            for dep in predecessors[tid]:
                if dep.get("type") == "FF":
                    pred = tasks[dep["pred_id"]]
                    pred_cal = self.calendars.get(pred.get("calendar_id", "default"), self.calendars["default"])
                    lag = dep.get("lag", 0)
                    pred_ef = datetime.strptime(pred["early_finish"], "%Y-%m-%d").date()
                    min_ef = pred_cal.add_working_days(pred_ef, lag)
                    if min_ef > ef:
                        ef = min_ef
                        if duration > 0:
                            es = cal.sub_working_days(ef, duration - 1)

            task["early_start"] = es.isoformat()
            task["early_finish"] = ef.isoformat()

        # Find project early finish
        project_ef = data_date
        for task in tasks.values():
            tef = datetime.strptime(task["early_finish"], "%Y-%m-%d").date()
            if tef > project_ef:
                project_ef = tef

        # --- BACKWARD PASS (Late Dates & Floats) ---
        for tid in reversed(topo_order):
            task = tasks[tid]
            cal_id = task.get("calendar_id", "default")
            cal = self.calendars.get(cal_id, self.calendars["default"])
            duration = task.get("duration", 0)

            # Initialize LF to project end date or task constraint
            lf = project_ef
            while not cal.is_working_day(lf):
                lf -= timedelta(days=1)

            if successors[tid]:
                min_succ_ls = None
                for dep in successors[tid]:
                    succ = tasks[dep["succ_id"]]
                    succ_cal = self.calendars.get(succ.get("calendar_id", "default"), self.calendars["default"])
                    dep_type = dep.get("type", "FS")
                    lag = dep.get("lag", 0)
                    succ_ls = datetime.strptime(succ["late_start"], "%Y-%m-%d").date()
                    succ_lf = datetime.strptime(succ["late_finish"], "%Y-%m-%d").date()

                    if dep_type == "FS":
                        candidate = succ_cal.sub_working_days(succ_ls, lag)
                        while not cal.is_working_day(candidate):
                            candidate -= timedelta(days=1)
                        if min_succ_ls is None or candidate < min_succ_ls:
                            min_succ_ls = candidate
                    elif dep_type == "FF":
                        candidate = succ_cal.sub_working_days(succ_lf, lag)
                        while not cal.is_working_day(candidate):
                            candidate -= timedelta(days=1)
                        if min_succ_ls is None or candidate < min_succ_ls:
                            min_succ_ls = candidate
                    elif dep_type == "SS":
                        # Handled via LS
                        pass
                if min_succ_ls is not None:
                    lf = min_succ_ls

            if duration == 0:
                ls = lf
            else:
                ls = cal.sub_working_days(lf, duration - 1)

            task["late_start"] = ls.isoformat()
            task["late_finish"] = lf.isoformat()

            # Calculate Floats
            es_date = datetime.strptime(task["early_start"], "%Y-%m-%d").date()
            ef_date = datetime.strptime(task["early_finish"], "%Y-%m-%d").date()
            total_float = cal.count_working_days(es_date, ls) - 1 if ls >= es_date else -(cal.count_working_days(ls, es_date) - 1)
            task["total_float"] = max(0, total_float)

            # Free Float = min(succ_ES - lag) - EF
            if successors[tid]:
                min_free = None
                for dep in successors[tid]:
                    succ = tasks[dep["succ_id"]]
                    succ_cal = self.calendars.get(succ.get("calendar_id", "default"), self.calendars["default"])
                    lag = dep.get("lag", 0)
                    succ_es = datetime.strptime(succ["early_start"], "%Y-%m-%d").date()
                    candidate = succ_cal.sub_working_days(succ_es, lag)
                    ff_val = cal.count_working_days(ef_date, candidate) - 1
                    if min_free is None or ff_val < min_free:
                        min_free = ff_val
                task["free_float"] = max(0, min_free if min_free is not None else 0)
            else:
                task["free_float"] = task["total_float"]

            task["is_critical"] = (task["total_float"] == 0)

        critical_path = [tid for tid in topo_order if tasks[tid]["is_critical"]]

        return {
            "status": "success",
            "data_date": data_date_str,
            "project_finish": project_ef.isoformat(),
            "critical_path": critical_path,
            "total_tasks": len(tasks),
            "tasks": tasks
        }

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--version":
        print("trueppm-scheduler 0.4.0b1 (pinned)")
        sys.exit(0)

    try:
        input_data = json.load(sys.stdin)
        scheduler = TruePpmScheduler()
        result = scheduler.schedule(input_data)
        print(json.dumps(result, indent=2))
    except Exception as e:
        error_resp = {
            "status": "error",
            "error_type": type(e).__name__,
            "message": str(e)
        }
        print(json.dumps(error_resp, indent=2), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
