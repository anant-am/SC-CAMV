from fastapi import APIRouter, Query
from typing import Dict, Any, List
from backend.app.core.engine import engine
from backend.app.storage.database import db_manager

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])

@router.get("/latest")
def get_latest():
    return {
        "telemetry": engine.latest_frame.model_dump() if engine.latest_frame else None,
        "decision": engine.latest_decision.model_dump() if engine.latest_decision else None,
        "active_pwm": engine.active_motor_pwm,
        "mode": engine.mode,
    }

@router.get("/history")
def get_history(limit: int = Query(100, ge=10, le=1000)):
    return {
        "telemetry": db_manager.get_recent_telemetry(limit),
        "decisions": db_manager.get_recent_decisions(limit),
    }
