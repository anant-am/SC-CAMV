from fastapi import APIRouter
from fastapi.responses import Response
import csv
import io
import json
from datetime import datetime, timezone

from backend.app.storage.database import db_manager
from backend.app.api.evaluation import evaluate_algorithm_suite

router = APIRouter(prefix="/export", tags=["Export"])

@router.get("/telemetry.csv")
def export_telemetry_csv():
    rows = db_manager.get_recent_telemetry(limit=5000)
    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        output.write("No telemetry recorded\n")

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sc_camv_telemetry.csv"},
    )

@router.get("/decisions.csv")
def export_decisions_csv():
    rows = db_manager.get_recent_decisions(limit=5000)
    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        output.write("No decision events recorded\n")

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sc_camv_decisions.csv"},
    )

@router.get("/events.csv")
def export_events_csv():
    rows = db_manager.get_recent_events(limit=5000)
    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        output.write("No system events recorded\n")

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sc_camv_events.csv"},
    )

@router.get("/benchmark-report.json")
def export_benchmark_report():
    benchmarks = evaluate_algorithm_suite()
    report = {
        "title": "SC-CAMV Comparative Benchmark and Experimental Report",
        "generated_at_iso": datetime.now(timezone.utc).isoformat(),
        "methodology": "Hardware-in-the-Loop Lumped Physics Multi-Sensor Verification",
        "benchmarks": benchmarks,
    }
    return Response(
        content=json.dumps(report, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=sc_camv_benchmark_report.json"},
    )
