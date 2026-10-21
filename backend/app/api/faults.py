from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from backend.app.core.engine import engine, SUPPORTED_FAULTS

router = APIRouter(prefix="/faults", tags=["Fault Injection Lab"])

class FaultRequest(BaseModel):
    fault_key: str
    value: Optional[Any] = None

@router.get("")
@router.get("/active")
def list_faults():
    """List all 17 supported fault modes and their active status."""
    return engine.get_active_faults()

@router.post("/inject")
def inject_fault(req: FaultRequest):
    """Safely inject a simulated fault mode."""
    success = engine.inject_fault(req.fault_key)
    if not success:
        raise HTTPException(status_code=400, detail=f"Unsupported fault key: {req.fault_key}")
    return {"status": "SUCCESS", "fault_key": req.fault_key, "is_active": True}

@router.post("/clear")
def clear_fault(req: FaultRequest):
    """Clear an active fault mode."""
    success = engine.clear_fault(req.fault_key)
    if not success:
        raise HTTPException(status_code=400, detail=f"Unsupported fault key: {req.fault_key}")
    return {"status": "SUCCESS", "fault_key": req.fault_key, "is_active": False}

@router.post("/clear-all")
def clear_all_faults():
    """Clear all active faults and return to healthy operation."""
    engine.clear_all_faults()
    return {"status": "SUCCESS", "message": "All faults cleared"}

