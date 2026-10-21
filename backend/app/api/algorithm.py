from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List

from backend.app.core.engine import engine
from backend.app.algorithms.sc_camv import SCCAMVAlgorithm

router = APIRouter(prefix="/algorithm", tags=["Algorithm"])

class SelectAlgorithmRequest(BaseModel):
    algorithm_name: str

@router.get("/info")
def get_algorithm_info():
    algo = engine.algorithm
    is_sc = isinstance(algo, SCCAMVAlgorithm)
    return {
        "active_algorithm": engine.active_algorithm_name,
        "available_algorithms": list(engine.algorithms.keys()),
        "description": algo.get_name(),
        "baseline_version": getattr(algo, "baseline_version", 1),
        "weights": getattr(algo, "sensor_weights", {}),
        "interaction_matrix": [
            {"sensor_1": k[0], "sensor_2": k[1], "coefficient": v}
            for k, v in getattr(algo, "interaction_matrix", {}).items()
        ] if is_sc else [],
        "thresholds": getattr(algo, "thresholds", {}) if is_sc else {},
        "lockout_active": getattr(algo, "lockout_active", False) if is_sc else False,
        "recovery_attempts": getattr(algo, "recovery_attempts", 0) if is_sc else 0,
    }

@router.post("/select")
def select_algorithm(req: SelectAlgorithmRequest):
    success = engine.set_algorithm(req.algorithm_name)
    if not success:
        raise HTTPException(status_code=400, detail=f"Algorithm '{req.algorithm_name}' not recognized")
    return {"status": "SUCCESS", "active_algorithm": engine.active_algorithm_name}

@router.post("/reset")
def reset_algorithm():
    engine.algorithm.reset()
    return {"status": "SUCCESS", "message": "Algorithm state and accumulators reset"}

@router.post("/lockout-reset")
def reset_lockout():
    engine.manual_reset_lockout()
    return {"status": "SUCCESS", "message": "Operator lockout cleared, NORMAL state restored"}

@router.get("/explanation")
def get_explanation():
    if not engine.latest_decision:
        return {"status": "NO_DECISION_YET", "explanation": None}
    return {
        "status": "OK",
        "explanation": engine.latest_decision.model_dump(),
    }
