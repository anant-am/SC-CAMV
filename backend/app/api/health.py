from fastapi import APIRouter
import time
from backend.app.config import settings
from backend.app.core.engine import engine
from backend.app.hardware.serial_reader import serial_manager

router = APIRouter(prefix="/health", tags=["Health"])

START_TIME = time.time()

@router.get("")
def get_health():
    return {
        "status": "HEALTHY",
        "app_name": settings.app_name,
        "version": settings.app_version,
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "engine_mode": engine.mode,
        "active_algorithm": engine.active_algorithm_name,
        "serial_connection": serial_manager.get_status(),
        "is_scenario_running": engine.is_scenario_running,
    }
