from fastapi import APIRouter
from typing import List, Dict, Any, Optional

from backend.app.storage.database import db_manager

router = APIRouter(prefix="/events", tags=["System Events"])

@router.get("")
def get_system_events(limit: int = 100):
    """Retrieve recent system audit events (transitions, faults, calibrations, warnings)."""
    return {
        "status": "SUCCESS",
        "events": db_manager.get_recent_events(limit=limit),
    }
