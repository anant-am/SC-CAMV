from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List

from backend.app.core.engine import engine
from backend.app.simulation.scenario_generator import SCENARIOS

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])

class RunScenarioRequest(BaseModel):
    scenario_key: str

class SpeedRequest(BaseModel):
    multiplier: float

@router.get("")
def list_scenarios():
    return {
        "active_scenario": engine.active_scenario_key,
        "is_running": engine.is_scenario_running,
        "step": engine.scenario_step_idx,
        "total_steps": len(engine.scenario_frames),
        "simulation_speed": engine.simulation_speed,
        "scenarios": [
            {
                "key": s.key,
                "title": s.title,
                "description": s.description,
                "duration_steps": s.duration_steps,
                "seed": s.seed,
            }
            for s in SCENARIOS.values()
        ]
    }

@router.post("/run")
def run_scenario(req: RunScenarioRequest):
    if req.scenario_key not in SCENARIOS:
        raise HTTPException(status_code=404, detail="Scenario key not found")
    engine.start_scenario(req.scenario_key)
    return {
        "status": "RUNNING",
        "scenario": req.scenario_key,
        "total_steps": len(engine.scenario_frames),
    }

@router.post("/pause")
def pause_scenario():
    engine.pause_scenario()
    return {"status": "PAUSED", "step": engine.scenario_step_idx}

@router.post("/reset")
def reset_scenario():
    engine.reset_scenario()
    return {"status": "RESET", "step": 0}

@router.post("/speed")
def set_speed(req: SpeedRequest):
    if req.multiplier < 0.1 or req.multiplier > 10.0:
        raise HTTPException(status_code=400, detail="Speed multiplier must be between 0.1 and 10.0")
    engine.simulation_speed = req.multiplier
    return {"status": "UPDATED", "speed": engine.simulation_speed}
