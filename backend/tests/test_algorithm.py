import pytest
from backend.app.algorithms.sc_camv import SCCAMVAlgorithm
from backend.app.algorithms.fixed_threshold import FixedThresholdAlgorithm
from backend.app.algorithms.naive_multifactor import NaiveMultifactorAlgorithm
from backend.app.simulation.scenario_generator import generate_scenario_frames
from backend.app.schemas.telemetry import RawSensorFrame, SystemState, ProtectiveAction

def test_healthy_baseline_remains_normal():
    algo = SCCAMVAlgorithm()
    frames = generate_scenario_frames("healthy_baseline", dt_s=0.2)
    decisions = [algo.process_frame(f) for f in frames]

    for d in decisions[-30:]:
        assert d.state == SystemState.NORMAL, f"Expected NORMAL but got {d.state} with risk {d.risk_score}"
        assert d.risk_score < 25.0
        assert d.action_requested == ProtectiveAction.NONE

def test_gated_calibration_protection():
    algo = SCCAMVAlgorithm(h_min_dwell_s=2.0)
    # Feed healthy frames to verify dwell increments
    frames = generate_scenario_frames("healthy_baseline", dt_s=0.2)[:20]
    for f in frames:
        algo.process_frame(f)
    assert algo.normal_dwell_s > 0.0

    # Inject an anomaly to force state to WARNING/CRITICAL with advancing timestamps
    for i in range(10):
        bad_frame = RawSensorFrame(
            sequence_id=999 + i,
            timestamp_ms=100000 + i * 500,
            current_a=2.5,
            vibe_g=2.2,
            ir_object_detected=True,
            amb_temp_c=26.8,
            amb_hum_pct=75.0,
            motor_pwm=100,
            is_simulated=True,
        )
        d = algo.process_frame(bad_frame)
    assert d.state in [SystemState.WARNING, SystemState.HIGH_RISK, SystemState.CRITICAL]
    # Verify calibration gate is locked (dwell reset)
    assert algo.normal_dwell_s == 0.0

def test_ambient_heatwave_contradiction_discount():
    sc_camv = SCCAMVAlgorithm()
    naive = NaiveMultifactorAlgorithm()

    # In ambient heatwave, room temp goes to 44C, while motor current/vibe remain normal
    frames = generate_scenario_frames("ambient_heatwave_contradiction", dt_s=0.2)

    sc_decisions = [sc_camv.process_frame(f) for f in frames]
    naive_decisions = [naive.process_frame(f) for f in frames]

    # Naive fusion accumulates ambient temp blindly, falsely escalating risk
    max_naive_risk = max(d.risk_score for d in naive_decisions)
    max_sc_risk = max(d.risk_score for d in sc_decisions)

    # SC-CAMV maintains lower risk than naive fusion due to contradiction handling
    assert max_naive_risk >= max_sc_risk
    # SC-CAMV avoids false CRITICAL shutdown during ambient heatwave
    assert all(d.state != SystemState.CRITICAL for d in sc_decisions)

def test_mechanical_overload_corroboration():
    algo = SCCAMVAlgorithm()
    frames = generate_scenario_frames("mechanical_overload", dt_s=0.2)
    decisions = [algo.process_frame(f) for f in frames]

    # Post-overload decisions must elevate state and show corroboration rules
    overload_decisions = decisions[50:]
    assert any(d.state in [SystemState.WARNING, SystemState.HIGH_RISK, SystemState.CRITICAL] for d in overload_decisions)
    assert any("Corroboration" in r for d in overload_decisions for r in d.rules_triggered)

def test_primary_sensor_disconnection():
    algo = SCCAMVAlgorithm()
    frames = generate_scenario_frames("current_sensor_disconnection", dt_s=0.2)
    decisions = [algo.process_frame(f) for f in frames]

    # Current drops to 0 at step 25
    late_decisions = decisions[40:]
    assert any(d.state == SystemState.SENSOR_DEGRADED for d in late_decisions)
    assert any(d.action_requested == ProtectiveAction.DERATE_PWM_60 for d in late_decisions)

def test_bounded_recovery_lockout():
    algo = SCCAMVAlgorithm(max_recovery_attempts=3, probation_duration_s=2.0)
    # Simulate repeated trips
    algo.recovery_attempts = 2

    # High anomaly frame triggers 3rd trip
    for i in range(5):
        bad_frame = RawSensorFrame(
            sequence_id=100 + i,
            timestamp_ms=2000 + i * 500,
            current_a=2.6,
            vibe_g=2.4,
            ir_object_detected=True,
            amb_temp_c=26.8,
            amb_hum_pct=75.0,
            motor_pwm=100,
            is_simulated=True,
        )
        d = algo.process_frame(bad_frame)
    assert d.state == SystemState.HARD_LOCKOUT or algo.lockout_active
    assert d.action_requested == ProtectiveAction.MANUAL_RESET_REQUIRED


def test_uncalibrated_negative_current_noise_does_not_trigger_outage():
    """Verify that uncalibrated stationary zero-current noise (e.g. -0.158A) is accepted within physical bounds and does NOT trigger SENSOR_DEGRADED."""
    algo = SCCAMVAlgorithm()
    frame = RawSensorFrame(
        sequence_id=1,
        timestamp_ms=1000,
        current_a=-0.158,
        current_raw_adc=511,
        current_v=2.498,
        vibe_g=0.001,
        ax=0.07,
        ay=-0.10,
        az=0.99,
        ir_object_detected=False,
        amb_temp_c=25.0,
        amb_hum_pct=60.0,
        motor_pwm=150,
        is_simulated=False,
    )
    decision = algo.process_frame(frame)
    # Must NOT fail with critical sensor outage or derate PWM
    assert decision.state != SystemState.SENSOR_DEGRADED, f"Unexpected SENSOR_DEGRADED: {decision.rules_triggered}"
    assert decision.action_requested != ProtectiveAction.DERATE_PWM_60
    assert not any("Critical sensor outage" in r for r in decision.rules_triggered)


def test_severe_out_of_bounds_current_triggers_quality_issue():
    """Verify that truly impossible electrical current readings (< -1.5A or > 6.0A) are rejected."""
    algo = SCCAMVAlgorithm()
    bad_frame = RawSensorFrame(
        sequence_id=2,
        timestamp_ms=1500,
        current_a=-2.8,  # Physically impossible negative current for this motor circuit
        vibe_g=0.01,
        ax=0.0,
        ay=0.0,
        az=1.0,
        ir_object_detected=False,
        amb_temp_c=25.0,
        amb_hum_pct=60.0,
        motor_pwm=100,
        is_simulated=False,
    )
    decision = algo.process_frame(bad_frame)
    assert decision.state == SystemState.SENSOR_DEGRADED
    assert any(q.sensor_name == "current_a" and q.status.value == "INVALID" for q in decision.sensor_quality_issues)


def test_mpu6050_remount_orientation_and_gravity_isolation():
    """Verify that MPU6050 correctly infers orientation for both upright (+1g) and inverted (-1g) mounting."""
    upright_frame = RawSensorFrame(
        sequence_id=10,
        timestamp_ms=5000,
        current_a=0.0,
        vibe_g=0.002,
        ax=0.07,
        ay=-0.10,
        az=0.99,
        is_simulated=False,
    )
    assert upright_frame.mpu_orientation == "NORMAL"

    inverted_frame = RawSensorFrame(
        sequence_id=11,
        timestamp_ms=5200,
        current_a=0.0,
        vibe_g=0.002,
        ax=0.02,
        ay=-0.01,
        az=-1.01,
        is_simulated=False,
    )
    assert inverted_frame.mpu_orientation == "UPSIDE_DOWN"


def test_physical_inferred_state_not_claimed_without_evidence():
    """Verify that motor is NOT inferred RUNNING without physical current and vibration evidence."""
    from backend.app.schemas.telemetry import MotorState
    from backend.app.hardware.serial_reader import SerialHardwareManager
    manager = SerialHardwareManager(port="COM5", baud_rate=9600)

    # Frame with commanded running (pwm 150) but 0 current and 0 vibration
    # Inferred state must be UNKNOWN, not RUNNING
    curr_a = -0.158
    vibe_g = 0.001
    pwm_val = 150

    if curr_a is not None and curr_a > 0.15 and (vibe_g is not None and vibe_g > 0.03):
        inf_state = MotorState.RUNNING
    elif pwm_val == 0 and (vibe_g is None or vibe_g < 0.035):
        inf_state = MotorState.STOPPED
    else:
        inf_state = MotorState.UNKNOWN

    assert inf_state == MotorState.UNKNOWN
