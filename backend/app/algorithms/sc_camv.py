import math
import time
from typing import Dict, List, Optional, Tuple, Any
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
    BaselineStats,
    CalibrationProfile,
    MotorState,
)

class SCCAMVAlgorithm(BaseHealthAlgorithm):
    """
    Self-Calibrating, Contradiction-Aware Multifactor Verification (SC-CAMV)
    Also known as GC-PWCE (Gated-Calibration, Persistence-Weighted Corroboration Engine
    with Asymmetric Hysteresis Actuation).
    """

    def __init__(
        self,
        alpha_calib: float = 0.05,
        h_min_dwell_s: float = 5.0,
        beta_decay: float = 0.85,
        tau_persistence_threshold: float = 2.0,
        gamma_corr: float = 0.85,
        gamma_contra: float = 1.0,
        e_scale: float = 14.0,
        max_recovery_attempts: int = 3,
        probation_duration_s: float = 10.0,
    ):
        self.alpha_calib = alpha_calib
        self.h_min_dwell_s = h_min_dwell_s
        self.beta_decay = beta_decay
        self.tau_persistence_threshold = tau_persistence_threshold
        self.gamma_corr = gamma_corr
        self.gamma_contra = gamma_contra
        self.e_scale = e_scale
        self.max_recovery_attempts = max_recovery_attempts
        self.probation_duration_s = probation_duration_s

        # Physical bounds (allowing for bidirectional Hall effect zero-offset drift [-1.5, 6.0])
        self.sensor_bounds = {
            "current_a": (-1.5, 6.0),
            "vibe_g": (0.0, 15.0),
            "amb_temp_c": (-10.0, 60.0),
            "amb_hum_pct": (5.0, 100.0),
        }

        # Base importance weights (ambient context has 0.0 base weight)
        self.sensor_weights = {
            "current_a": 1.5,
            "vibe_g": 1.4,
            "ir_object_detected": 1.2,
            "amb_temp_c": 0.0,
            "amb_hum_pct": 0.0,
        }

        # Pairwise physical relationship matrix C_jk (-1.0 to +1.0)
        self.interaction_matrix: Dict[Tuple[str, str], float] = {
            ("current_a", "vibe_g"): 0.85,              # Overload increases both
            ("current_a", "ir_object_detected"): 0.90,  # Obstacle increases current
            ("vibe_g", "ir_object_detected"): 0.80,    # Obstacle collision induces vibration
            ("amb_temp_c", "current_a"): -0.90,         # Ambient heatwave with normal current contradicts motor fault
            ("amb_temp_c", "vibe_g"): -0.85,            # Ambient heatwave with normal vibration contradicts mechanical fault
            ("amb_hum_pct", "current_a"): 0.0,
            ("amb_hum_pct", "vibe_g"): 0.0,
        }

        self.baseline: Dict[str, Dict[str, float]] = {}
        self.baseline_version: int = 1
        self.is_calibrated: bool = False

        self.persistence: Dict[str, float] = {s: 0.0 for s in self.sensor_bounds}
        self.persistence["ir_object_detected"] = 0.0

        self.current_state: SystemState = SystemState.NORMAL
        self.state_entry_time_ms: int = 0
        self.last_frame_time_ms: Optional[int] = None
        self.normal_dwell_s: float = 0.0

        self.recovery_attempts: int = 0
        self.recovery_start_time_ms: Optional[int] = None
        self.lockout_active: bool = False

        self.thresholds = {
            SystemState.WATCH: {"rise": 25.0, "fall": 15.0, "dwell_up_s": 0.8, "dwell_down_s": 3.5},
            SystemState.WARNING: {"rise": 45.0, "fall": 30.0, "dwell_up_s": 1.0, "dwell_down_s": 4.5},
            SystemState.HIGH_RISK: {"rise": 68.0, "fall": 50.0, "dwell_up_s": 0.6, "dwell_down_s": 5.5},
            SystemState.CRITICAL: {"rise": 85.0, "fall": 65.0, "dwell_up_s": 0.4, "dwell_down_s": 7.0},
        }

        self._init_default_baseline()

    def _init_default_baseline(self):
        defaults = {
            "current_a": (0.75, 0.08),
            "vibe_g": (0.075, 0.02),
            "amb_temp_c": (26.8, 1.2),
            "amb_hum_pct": (75.0, 3.0),
        }
        for s, (m, sd) in defaults.items():
            self.baseline[s] = {
                "mean": m,
                "variance": sd ** 2,
                "count": 100,
                "min": m - 3 * sd,
                "max": m + 3 * sd,
            }
        self.is_calibrated = True

    def get_name(self) -> str:
        return "SC-CAMV (Proposed GC-PWCE)"

    def reset(self):
        self.current_state = SystemState.NORMAL
        self.normal_dwell_s = 0.0
        self.recovery_attempts = 0
        self.recovery_start_time_ms = None
        self.lockout_active = False
        self.persistence = {s: 0.0 for s in self.sensor_bounds}
        self.persistence["ir_object_detected"] = 0.0
        self.last_frame_time_ms = None

    def manual_reset_lockout(self):
        self.lockout_active = False
        self.recovery_attempts = 0
        self.current_state = SystemState.NORMAL
        self.normal_dwell_s = self.h_min_dwell_s + 1.0

    def calibrate(self, frames: List[RawSensorFrame]) -> CalibrationProfile:
        if len(frames) < 15:
            return CalibrationProfile(
                version=self.baseline_version,
                created_at_iso=datetime.now(timezone.utc).isoformat(),
                sample_count=len(frames),
                hold_dwell_seconds=0.0,
                sensors={},
                is_valid=False,
                rejection_reason="Insufficient sample count (minimum 15 required for statistical validity)",
            )

        new_baseline: Dict[str, Dict[str, float]] = {}
        for s in self.sensor_bounds:
            vals = []
            for f in frames:
                v = getattr(f, s, None)
                if v is not None and not math.isnan(v) and not math.isinf(v):
                    b_min, b_max = self.sensor_bounds[s]
                    if b_min <= v <= b_max:
                        vals.append(v)

            if len(vals) < 10 and s in ["current_a", "vibe_g"]:
                return CalibrationProfile(
                    version=self.baseline_version,
                    created_at_iso=datetime.now(timezone.utc).isoformat(),
                    sample_count=len(frames),
                    hold_dwell_seconds=0.0,
                    sensors={},
                    is_valid=False,
                    rejection_reason=f"Primary sensor {s} has fewer than 10 valid samples during calibration window",
                )

            if vals:
                mean_val = sum(vals) / len(vals)
                variance_val = sum((x - mean_val) ** 2 for x in vals) / max(1, len(vals) - 1)
                new_baseline[s] = {
                    "mean": mean_val,
                    "variance": max(variance_val, 1e-4),
                    "count": len(vals),
                    "min": min(vals),
                    "max": max(vals),
                }

        self.baseline = new_baseline
        self.baseline_version += 1
        self.is_calibrated = True
        self.normal_dwell_s = self.h_min_dwell_s + 1.0

        sensor_stats = {
            s: BaselineStats(
                sensor_name=s,
                mean=b["mean"],
                std_dev=math.sqrt(b["variance"]),
                sample_count=int(b["count"]),
                min_val=b["min"],
                max_val=b["max"],
                last_updated_iso=datetime.now(timezone.utc).isoformat(),
            )
            for s, b in self.baseline.items()
        }

        return CalibrationProfile(
            version=self.baseline_version,
            created_at_iso=datetime.now(timezone.utc).isoformat(),
            sample_count=len(frames),
            hold_dwell_seconds=self.normal_dwell_s,
            sensors=sensor_stats,
            is_valid=True,
        )

    def _update_online_welford(self, sensor: str, val: float):
        if sensor not in self.baseline:
            self.baseline[sensor] = {
                "mean": val,
                "variance": 1.0,
                "count": 1,
                "min": val,
                "max": val,
            }
            return

        b = self.baseline[sensor]
        b["count"] += 1
        n = b["count"]
        delta = val - b["mean"]
        b["mean"] += delta / n
        delta2 = val - b["mean"]
        m2 = b["variance"] * max(1, n - 2) + delta * delta2
        b["variance"] = max(1e-4, m2 / max(1, n - 1))
        b["min"] = min(b["min"], val)
        b["max"] = max(b["max"], val)

    def process_frame(self, frame: RawSensorFrame, current_time_ms: Optional[int] = None) -> DecisionExplanation:
        now_ms = current_time_ms if current_time_ms is not None else frame.timestamp_ms
        dt_s = (
            min(1.0, max(0.01, (now_ms - self.last_frame_time_ms) / 1000.0))
            if self.last_frame_time_ms is not None
            else 0.2
        )
        self.last_frame_time_ms = now_ms

        validation_results: List[SensorValidationResult] = []
        valid_sensors: Dict[str, float] = {}
        degraded_count = 0

        for s, (b_min, b_max) in self.sensor_bounds.items():
            val = getattr(frame, s, None)
            if val is None:
                if s in ["current_a", "vibe_g"]:
                    degraded_count += 1
                    status = SensorQualityStatus.DISCONNECTED
                    reason = f"Primary sensor {s} missing/disconnected"
                else:
                    status = SensorQualityStatus.DEGRADED
                    reason = f"Context sensor {s} offline"
                validation_results.append(SensorValidationResult(
                    sensor_name=s,
                    status=status,
                    value=None,
                    bounds_min=b_min,
                    bounds_max=b_max,
                    reason=reason,
                    source=frame.source,
                ))
            elif val < b_min or val > b_max:
                degraded_count += 1
                validation_results.append(SensorValidationResult(
                    sensor_name=s,
                    status=SensorQualityStatus.INVALID,
                    value=val,
                    bounds_min=b_min,
                    bounds_max=b_max,
                    reason=f"Reading {val} outside physical bounds [{b_min}, {b_max}]",
                    source=frame.source,
                ))
            else:
                valid_sensors[s] = val

        if frame.ir_object_detected:
            valid_sensors["ir_object_detected"] = 1.0
        else:
            valid_sensors["ir_object_detected"] = 0.0

        if degraded_count > 0 and ("current_a" not in valid_sensors or "vibe_g" not in valid_sensors):
            self.current_state = SystemState.SENSOR_DEGRADED
            self.normal_dwell_s = 0.0
            return DecisionExplanation(
                timestamp_iso=datetime.now(timezone.utc).isoformat(),
                timestamp_ms=now_ms,
                state=SystemState.SENSOR_DEGRADED,
                risk_score=60.0,
                confidence=0.50,
                raw_evidence_score=0.0,
                sensor_quality_issues=validation_results,
                rules_triggered=[f"Critical sensor outage: {degraded_count} channels failed"],
                action_requested=ProtectiveAction.DERATE_PWM_60,
                action_executed=True,
                is_simulated_action=frame.is_simulated,
                baseline_version=self.baseline_version,
                recovery_attempts=self.recovery_attempts,
                lockout_active=self.lockout_active,
                commanded_state=frame.commanded_motor_state,
                inferred_state=frame.inferred_motor_state,
            )

        z_scores: Dict[str, float] = {}
        supporting_evidence: List[EvidenceItem] = []
        neutral_evidence: List[EvidenceItem] = []

        for s, val in valid_sensors.items():
            if s == "ir_object_detected":
                z = 3.5 if val > 0.5 else 0.0
                z_scores[s] = z
            elif s in self.baseline:
                b = self.baseline[s]
                std_dev = math.sqrt(b["variance"])
                z = (val - b["mean"]) / std_dev
                z_scores[s] = z

            prev_p = self.persistence.get(s, 0.0)
            z_mag = abs(z_scores.get(s, 0.0))
            new_p = min(10.0, (self.beta_decay * prev_p) + (z_mag * dt_s))
            self.persistence[s] = new_p

        rules_triggered: List[str] = []
        contradictory_evidence: List[EvidenceItem] = []
        corroboration_bonus = 0.0
        contradiction_discount = 0.0

        for (s1, s2), c_jk in self.interaction_matrix.items():
            if s1 in z_scores and s2 in z_scores:
                z1 = z_scores[s1]
                z2 = z_scores[s2]
                p1 = self.persistence.get(s1, 0.0)
                p2 = self.persistence.get(s2, 0.0)

                if p1 >= self.tau_persistence_threshold or p2 >= self.tau_persistence_threshold:
                    if c_jk > 0.0:
                        # Physical corroboration: both sensors must be elevated above baseline (e.g. high current + high vibration)
                        if z1 > 1.5 and z2 > 1.5:
                            impact = c_jk * (p1 + p2) * 0.6
                            corroboration_bonus += impact
                            rules_triggered.append(
                                f"Corroboration: {s1} (z={z1:+.1f}) & {s2} (z={z2:+.1f}) aligned (C_jk=+{c_jk:.2f})"
                            )
                    elif c_jk < 0.0:
                        if z1 > 1.8 and abs(z2) < 1.2:
                            discount = abs(c_jk) * p1 * 1.5
                            contradiction_discount += discount
                            rules_triggered.append(
                                f"Contradiction: {s1} elevated (z={z1:+.1f}) but {s2} normal (z={z2:+.1f}) -> Environmental effect, motor healthy (C_jk={c_jk:.2f})"
                            )
                            contradictory_evidence.append(EvidenceItem(
                                sensor_name=s1,
                                deviation_z=round(z1, 2),
                                persistence_p=round(p1, 2),
                                weight=abs(c_jk),
                                direction="CONTRADICTION",
                                description=f"Ambient deviation explained away by normal {s2}",
                            ))

        raw_evidence = 0.0
        for s, z in z_scores.items():
            w = self.sensor_weights.get(s, 1.0)
            p = self.persistence.get(s, 0.0)

            # For motor current, vibration, and obstacles: only elevated readings indicate faults
            if z > 1.2:
                raw_evidence += w * p
                supporting_evidence.append(EvidenceItem(
                    sensor_name=s,
                    deviation_z=round(z, 2),
                    persistence_p=round(p, 2),
                    weight=w,
                    direction="HIGH",
                    description=f"{s} z={z:+.2f}, persistent for {p:.1f}s",
                ))
            elif z < -1.2:
                # Sub-baseline readings (idle motor, low current, smooth vibration) are safe neutral states
                neutral_evidence.append(EvidenceItem(
                    sensor_name=s,
                    deviation_z=round(z, 2),
                    persistence_p=round(p, 2),
                    weight=w,
                    direction="LOW",
                    description=f"{s} sub-baseline z={z:+.2f} (motor idle / low load)",
                ))
            else:
                neutral_evidence.append(EvidenceItem(
                    sensor_name=s,
                    deviation_z=round(z, 2),
                    persistence_p=round(p, 2),
                    weight=w,
                    direction="NEUTRAL",
                    description=f"{s} within normal baseline bounds",
                ))

        net_evidence = max(0.0, raw_evidence + (self.gamma_corr * corroboration_bonus) - (self.gamma_contra * contradiction_discount))
        risk_score = round(100.0 / (1.0 + math.exp(-net_evidence / (self.e_scale * 0.5) + 3.0)), 1)
        if net_evidence < 0.8:
            risk_score = min(risk_score, 8.0)

        if self.lockout_active:
            target_state = SystemState.HARD_LOCKOUT
            action = ProtectiveAction.MANUAL_RESET_REQUIRED
        elif risk_score >= self.thresholds[SystemState.CRITICAL]["rise"]:
            target_state = SystemState.CRITICAL
            action = ProtectiveAction.EMERGENCY_SHUTDOWN
        elif risk_score >= self.thresholds[SystemState.HIGH_RISK]["rise"]:
            target_state = SystemState.HIGH_RISK
            action = ProtectiveAction.DERATE_PWM_30
        elif risk_score >= self.thresholds[SystemState.WARNING]["rise"]:
            target_state = SystemState.WARNING
            action = ProtectiveAction.DERATE_PWM_60
        elif risk_score >= self.thresholds[SystemState.WATCH]["rise"]:
            target_state = SystemState.WATCH
            action = ProtectiveAction.OBSERVE_LOG
        elif risk_score <= self.thresholds[SystemState.WATCH]["fall"]:
            target_state = SystemState.NORMAL
            action = ProtectiveAction.NONE
        else:
            target_state = self.current_state
            action = ProtectiveAction.NONE

        if target_state in [SystemState.CRITICAL, SystemState.HIGH_RISK]:
            if self.current_state not in [SystemState.CRITICAL, SystemState.HIGH_RISK]:
                self.recovery_attempts += 1
                if self.recovery_attempts >= self.max_recovery_attempts:
                    self.lockout_active = True
                    target_state = SystemState.HARD_LOCKOUT
                    action = ProtectiveAction.MANUAL_RESET_REQUIRED
                    rules_triggered.append(
                        f"3-Strike Lockout Enforced: {self.recovery_attempts} trips within operating cycle"
                    )

        if target_state == SystemState.NORMAL:
            self.normal_dwell_s += dt_s
            if self.normal_dwell_s >= self.h_min_dwell_s:
                for s, val in valid_sensors.items():
                    if s in self.sensor_bounds:
                        self._update_online_welford(s, val)
        else:
            self.normal_dwell_s = 0.0

        self.current_state = target_state
        confidence = max(0.60, min(0.98, 1.0 - (degraded_count * 0.20)))

        return DecisionExplanation(
            timestamp_iso=datetime.now(timezone.utc).isoformat(),
            timestamp_ms=now_ms,
            state=target_state,
            risk_score=risk_score,
            confidence=round(confidence, 2),
            raw_evidence_score=round(raw_evidence, 2),
            supporting_evidence=supporting_evidence,
            contradictory_evidence=contradictory_evidence,
            neutral_evidence=neutral_evidence,
            sensor_quality_issues=validation_results,
            rules_triggered=rules_triggered,
            action_requested=action,
            action_executed=True,
            is_simulated_action=frame.is_simulated,
            baseline_version=self.baseline_version,
            recovery_attempts=self.recovery_attempts,
            lockout_active=self.lockout_active,
            commanded_state=frame.commanded_motor_state,
            inferred_state=frame.inferred_motor_state,
        )
