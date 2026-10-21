from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional

from backend.app.core.engine import engine

router = APIRouter(prefix="/motor", tags=["Motor Control"])

class StartMotorRequest(BaseModel):
    pwm: Optional[int] = Field(100, ge=0, le=255, description="Initial PWM duty cycle (default 100)")

class SetPWMRequest(BaseModel):
    pwm: int = Field(..., ge=0, le=255, description="PWM duty cycle command (0-255)")

@router.post("/start")
def start_motor(req: StartMotorRequest):
    """Explicitly start motor at the specified PWM (default 100)."""
    engine.start_motor(req.pwm)
    return {
        "status": "SUCCESS",
        "commanded_state": "RUNNING",
        "active_pwm": engine.active_motor_pwm,
    }

@router.post("/stop")
def stop_motor():
    """Explicitly stop motor."""
    engine.stop_motor()
    return {
        "status": "SUCCESS",
        "commanded_state": "STOPPED",
        "active_pwm": 0,
    }

@router.post("/pwm")
def set_motor_pwm(req: SetPWMRequest):
    """Update motor PWM duty cycle."""
    engine.set_pwm(req.pwm)
    return {
        "status": "SUCCESS",
        "active_pwm": engine.active_motor_pwm,
    }

@router.post("/estop")
def emergency_stop():
    """Trigger immediate software emergency stop."""
    engine.emergency_stop()
    return {
        "status": "EMERGENCY_STOP_EXECUTED",
        "commanded_state": "STOPPED",
        "active_pwm": 0,
    }

@router.post("/reset")
def reset_motor_lockout():
    """Manual reset of trip / hard lockout."""
    engine.manual_reset_lockout()
    return {
        "status": "RESET_CONFIRMED",
        "commanded_state": "STOPPED",
        "active_pwm": 0,
    }
