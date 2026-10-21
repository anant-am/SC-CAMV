from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

from backend.app.core.engine import engine
from backend.app.hardware.serial_reader import serial_manager

router = APIRouter(prefix="/hardware", tags=["Hardware"])

class ConnectRequest(BaseModel):
    port: str
    baud_rate: int = 9600

class ModeRequest(BaseModel):
    mode: str  # SIMULATION or LIVE_HARDWARE

@router.get("/ports")
def get_ports():
    is_active = serial_manager.connection_status in [
        "CONNECTED", "LIVE", "CONNECTING", "CONNECTED_WAITING_FOR_TELEMETRY", "STALE"
    ]
    return {
        "ports": serial_manager.list_available_ports(),
        "connected_port": serial_manager.port if is_active else None,
        "status": serial_manager.connection_status,
        "is_live": serial_manager.connection_status == "LIVE",
    }

@router.post("/connect")
def connect_hardware(req: ConnectRequest):
    success = serial_manager.connect(port=req.port, baud_rate=req.baud_rate)
    if not success:
        raise HTTPException(
            status_code=503,
            detail=serial_manager.last_error or f"Could not open serial port {req.port}",
        )
    engine.mode = "LIVE_HARDWARE"
    return {
        "status": serial_manager.connection_status,
        "port": req.port,
        "baud_rate": req.baud_rate,
        "transport": serial_manager.transport_type,
        "detail": serial_manager.status_reason,
    }

@router.post("/disconnect")
def disconnect_hardware():
    serial_manager.disconnect()
    engine.mode = "SIMULATION"
    return {
        "status": "DISCONNECTED",
        "fallback_mode": "SIMULATION",
        "detail": "Hardware serial port cleanly closed and background reader stopped. Operating mode returned to SIMULATION.",
    }

@router.post("/mode")
def set_mode(req: ModeRequest):
    if req.mode not in ["SIMULATION", "LIVE_HARDWARE", "REPLAY"]:
        raise HTTPException(status_code=400, detail="Invalid mode. Must be SIMULATION, LIVE_HARDWARE, or REPLAY")
    success = engine.set_mode(req.mode)
    return {"status": "SUCCESS", "mode": engine.mode}

@router.get("/status")
def get_hardware_status():
    return {
        "engine_mode": engine.mode,
        "serial": serial_manager.get_status(),
        "active_pwm": engine.active_motor_pwm,
    }
