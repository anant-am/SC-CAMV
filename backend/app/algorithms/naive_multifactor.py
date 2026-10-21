from typing import List, Optional, Dict
from datetime import datetime, timezone
import math

from backend.app.algorithms.base import BaseHealthAlgorithm
from backend.app.schemas.telemetry import (
    RawSensorFrame,
    DecisionExplanation,
    SystemState,
    ProtectiveAction,
    EvidenceItem,
    CalibrationProfile,
    BaselineStats,
    MotorState,
)

class NaiveMultifactorAlgorithm(BaseHealthAlgorithm):
    """
    Naive Multi-factor Fusion Baseline.
    Normalizes sensor readings against baseline statistics, but blindly sums deviations
    into a scalar score without leaky temporal persistence and without pairwise contradiction handling.
    Critically: treats ambient temperature/humidity rises as if they were motor health degradation!
    """

    def __init__(self):
        self.baseline: Dict[str, Dict[str, float]] = {
            "current_a": {"mean": 0.75, "std": 0.12},
            "vibe_g": {"mean": 0.075, "std": 0.03},
            "amb_temp_c": {"mean": 26.8, "std": 1.5},
            "amb_hum_pct": {"mean": 75.0, "std": 3.0},
        }
        self.current_state = SystemState.NORMAL

    def get_name(self) -> str:
        return "Naive Multifactor Fusion (No Contradiction Resolution)"

    def reset(self):
        self.current_state = SystemState.NORMAL

    def calibrate(self, frames: List[RawSensorFrame]) -> CalibrationProfile:
        if len(frames) < 10:
            return CalibrationProfile(
                version=1,
                created_at_iso=datetime.now(timezone.utc).isoformat(),
                sample_count=len(frames),
                hold_dwell_seconds=0.0,
                sensors={},
                is_valid=False,
                rejection_reason="Insufficient frames",
            )
        new_b = {}
        for s in ["current_a", "vibe_g", "amb_temp_c", "amb_hum_pct"]:
            vals = [getattr(f, s) for f in frames if getattr(f, s, None) is not None]
            if vals:
                m = sum(vals) / len(vals)
                var = sum((x - m) ** 2 for x in vals) / max(1, len(vals) - 1)
                new_b[s] = {"mean": m, "std": max(math.sqrt(var), 0.01)}
        self.baseline = new_b
        return CalibrationProfile(
            version=2,
            created_at_iso=datetime.now(timezone.utc).isoformat(),
            sample_count=len(frames),
            hold_dwell_seconds=0.0,
            sensors={
                s: BaselineStats(
                    sensor_name=s,
                    mean=b["mean"],
                    std_dev=b["std"],
                    sample_count=len(frames),
                    min_val=0,
                    max_val=100,
                    last_updated_iso=datetime.now(timezone.utc).isoformat(),
                )
                for s, b in new_b.items()
            },
            is_valid=True,
        )

    def process_frame(self, frame: RawSensorFrame, current_time_ms: Optional[int] = None) -> DecisionExplanation:
        now_ms = current_time_ms if current_time_ms is not None else frame.timestamp_ms
        raw_evidence = 0.0
        supporting: List[EvidenceItem] = []
        rules: List[str] = []

        for s, stats in self.baseline.items():
            val = getattr(frame, s, None)
            if val is not None:
                z = (val - stats["mean"]) / stats["std"]
                if abs(z) > 1.8:
                    raw_evidence += abs(z)
                    item = EvidenceItem(
                        sensor_name=s,
                        deviation_z=round(z, 2),
                        persistence_p=round(abs(z), 2),
                        weight=1.0,
                        direction="HIGH" if z > 0 else "LOW",
                        description=f"Naive: {s} z={z:+.2f} blindly added without contradiction checking",
                    )
                    supporting.append(item)
                    rules.append(f"Naive: Added z={z:+.2f} for {s}")

        # Add IR obstacle as flat penalty in naive model
        if frame.ir_object_detected:
            raw_evidence += 3.0
            supporting.append(EvidenceItem(
                sensor_name="ir_object_detected",
                deviation_z=3.0,
                persistence_p=3.0,
                weight=1.0,
                direction="OBSTRUCTION",
                description="Naive: Added penalty for obstacle without verifying current/vibration",
            ))

        # Blind sum maps to risk score
        risk = min(100.0, max(0.0, raw_evidence * 10.0))

        if risk >= 75.0:
            state = SystemState.CRITICAL
            action = ProtectiveAction.EMERGENCY_SHUTDOWN
        elif risk >= 50.0:
            state = SystemState.HIGH_RISK
            action = ProtectiveAction.DERATE_PWM_30
        elif risk >= 35.0:
            state = SystemState.WARNING
            action = ProtectiveAction.DERATE_PWM_60
        elif risk >= 20.0:
            state = SystemState.WATCH
            action = ProtectiveAction.OBSERVE_LOG
        else:
            state = SystemState.NORMAL
            action = ProtectiveAction.NONE

        self.current_state = state

        return DecisionExplanation(
            timestamp_iso=datetime.now(timezone.utc).isoformat(),
            timestamp_ms=now_ms,
            state=state,
            risk_score=round(risk, 1),
            confidence=0.75,
            raw_evidence_score=round(raw_evidence, 2),
            supporting_evidence=supporting,
            contradictory_evidence=[],
            neutral_evidence=[],
            sensor_quality_issues=[],
            rules_triggered=rules,
            action_requested=action,
            action_executed=True,
            is_simulated_action=frame.is_simulated,
            baseline_version=1,
            recovery_attempts=0,
            lockout_active=False,
            commanded_state=frame.commanded_motor_state,
            inferred_state=frame.inferred_motor_state,
        )
