from typing import List, Optional
from datetime import datetime, timezone

from backend.app.algorithms.base import BaseHealthAlgorithm
from backend.app.schemas.telemetry import (
    RawSensorFrame,
    DecisionExplanation,
    SystemState,
    ProtectiveAction,
    SensorQualityStatus,
    SensorValidationResult,
    EvidenceItem,
    CalibrationProfile,
    MotorState,
)

class FixedThresholdAlgorithm(BaseHealthAlgorithm):
    """
    Standard industrial fixed-threshold baseline.
    Evaluates static upper/lower bounds independently for each channel.
    Lacks adaptive calibration, contradiction awareness, and physical context isolation.
    """

    def __init__(
        self,
        current_warning_a: float = 1.30,
        current_critical_a: float = 1.80,
        vibe_warning_g: float = 0.35,
        vibe_critical_g: float = 0.85,
        temp_warning_c: float = 38.0,
        temp_critical_c: float = 43.0,
    ):
        self.current_warning = current_warning_a
        self.current_critical = current_critical_a
        self.vibe_warning = vibe_warning_g
        self.vibe_critical = vibe_critical_g
        self.temp_warning = temp_warning_c
        self.temp_critical = temp_critical_c

    def get_name(self) -> str:
        return "Fixed Threshold Baseline"

    def reset(self):
        pass

    def calibrate(self, frames: List[RawSensorFrame]) -> CalibrationProfile:
        return CalibrationProfile(
            version=1,
            created_at_iso=datetime.now(timezone.utc).isoformat(),
            sample_count=len(frames),
            hold_dwell_seconds=0.0,
            sensors={},
            is_valid=False,
            rejection_reason="Fixed Threshold baseline does not implement adaptive calibration",
        )

    def process_frame(self, frame: RawSensorFrame, current_time_ms: Optional[int] = None) -> DecisionExplanation:
        now_ms = current_time_ms if current_time_ms is not None else frame.timestamp_ms
        rules = []
        violations_critical = 0
        violations_warning = 0
        supporting: List[EvidenceItem] = []
        quality_issues: List[SensorValidationResult] = []

        # Current check (ACS712)
        if frame.current_a is None:
            rules.append("Fixed: Current Sensor Missing/Disconnected")
            violations_warning += 1
            quality_issues.append(SensorValidationResult(
                sensor_name="current_a",
                status=SensorQualityStatus.DISCONNECTED,
                value=None,
                bounds_min=0.0,
                bounds_max=5.0,
                reason="Current signal unavailable",
                source=frame.source,
            ))
        elif frame.current_a >= self.current_critical:
            violations_critical += 1
            rules.append(f"Fixed: Current {frame.current_a:.2f}A >= Critical {self.current_critical}A")
            supporting.append(EvidenceItem(
                sensor_name="current_a",
                deviation_z=3.0,
                persistence_p=1.0,
                weight=1.5,
                direction="HIGH",
                description="Current above critical threshold",
            ))
        elif frame.current_a >= self.current_warning:
            violations_warning += 1
            rules.append(f"Fixed: Current {frame.current_a:.2f}A >= Warning {self.current_warning}A")
            supporting.append(EvidenceItem(
                sensor_name="current_a",
                deviation_z=2.0,
                persistence_p=1.0,
                weight=1.0,
                direction="HIGH",
                description="Current above warning threshold",
            ))

        # Vibration check (MPU6050)
        if frame.vibe_g is None:
            rules.append("Fixed: Vibration Sensor Missing/Disconnected")
            violations_warning += 1
            quality_issues.append(SensorValidationResult(
                sensor_name="vibe_g",
                status=SensorQualityStatus.DISCONNECTED,
                value=None,
                bounds_min=0.0,
                bounds_max=3.0,
                reason="Vibration signal unavailable",
                source=frame.source,
            ))
        elif frame.vibe_g >= self.vibe_critical:
            violations_critical += 1
            rules.append(f"Fixed: Vibration {frame.vibe_g:.2f}g >= Critical {self.vibe_critical}g")
            supporting.append(EvidenceItem(
                sensor_name="vibe_g",
                deviation_z=3.0,
                persistence_p=1.0,
                weight=1.4,
                direction="HIGH",
                description="Vibration above critical threshold",
            ))
        elif frame.vibe_g >= self.vibe_warning:
            violations_warning += 1
            rules.append(f"Fixed: Vibration {frame.vibe_g:.2f}g >= Warning {self.vibe_warning}g")
            supporting.append(EvidenceItem(
                sensor_name="vibe_g",
                deviation_z=2.0,
                persistence_p=1.0,
                weight=1.0,
                direction="HIGH",
                description="Vibration above warning threshold",
            ))

        # IR Obstacle check
        if frame.ir_object_detected:
            violations_warning += 1
            rules.append("Fixed: IR Obstacle Sensor Triggered (Obstruction near fan)")
            supporting.append(EvidenceItem(
                sensor_name="ir_object_detected",
                deviation_z=2.5,
                persistence_p=1.0,
                weight=1.2,
                direction="OBSTRUCTION",
                description="Stationary obstacle detected near fan blades",
            ))

        # Ambient Temperature naive check
        if frame.amb_temp_c is not None:
            if frame.amb_temp_c >= self.temp_critical:
                violations_critical += 1
                rules.append(f"Fixed: Ambient Temp {frame.amb_temp_c:.1f}C >= Critical {self.temp_critical}C (Naive false trip!)")
                supporting.append(EvidenceItem(
                    sensor_name="amb_temp_c",
                    deviation_z=3.0,
                    persistence_p=1.0,
                    weight=1.0,
                    direction="HIGH",
                    description="Ambient temperature above static threshold",
                ))
            elif frame.amb_temp_c >= self.temp_warning:
                violations_warning += 1
                rules.append(f"Fixed: Ambient Temp {frame.amb_temp_c:.1f}C >= Warning {self.temp_warning}C")

        # Decision synthesis
        if violations_critical > 0:
            state = SystemState.CRITICAL
            action = ProtectiveAction.EMERGENCY_SHUTDOWN
            risk_score = 92.0
        elif violations_warning >= 2:
            state = SystemState.HIGH_RISK
            action = ProtectiveAction.DERATE_PWM_30
            risk_score = 75.0
        elif violations_warning == 1:
            state = SystemState.WARNING
            action = ProtectiveAction.DERATE_PWM_60
            risk_score = 50.0
        else:
            state = SystemState.NORMAL
            action = ProtectiveAction.NONE
            risk_score = 10.0

        return DecisionExplanation(
            timestamp_iso=datetime.now(timezone.utc).isoformat(),
            timestamp_ms=now_ms,
            state=state,
            risk_score=risk_score,
            confidence=0.80,
            raw_evidence_score=float(violations_critical * 3 + violations_warning * 1),
            supporting_evidence=supporting,
            contradictory_evidence=[],
            neutral_evidence=[],
            sensor_quality_issues=quality_issues,
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
