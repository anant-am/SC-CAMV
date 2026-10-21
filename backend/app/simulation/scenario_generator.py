from typing import Dict, List, Any
from backend.app.simulation.motor_physics import DCMotorPhysicsSimulator
from backend.app.schemas.telemetry import RawSensorFrame

class ScenarioDefinition:
    def __init__(self, key: str, title: str, description: str, duration_steps: int = 120, seed: int = 42):
        self.key = key
        self.title = title
        self.description = description
        self.duration_steps = duration_steps
        self.seed = seed

SCENARIOS: Dict[str, ScenarioDefinition] = {
    "healthy_baseline": ScenarioDefinition(
        key="healthy_baseline",
        title="1. Healthy Baseline Operation (PWM 100)",
        description="Normal operation under 12V supply at standard demonstration setting (PWM 100) with small fan load and nominal ambient conditions.",
        duration_steps=100,
    ),
    "ir_obstacle_detected": ScenarioDefinition(
        key="ir_obstacle_detected",
        title="2. Stationary Obstacle Detection (IR Sensor)",
        description="Stationary obstacle placed near fan. D2 transitions to LOW, flagging obstacle presence without stopping normal motor rotation unless prolonged.",
        duration_steps=100,
    ),
    "mechanical_overload": ScenarioDefinition(
        key="mechanical_overload",
        title="3. Mechanical Overload & Stalling",
        description="External friction applied to shaft/fan. Current surges from 0.5A to 1.9A, corroborating mechanical resistance with moderate vibration increase.",
        duration_steps=120,
    ),
    "eccentric_vibration": ScenarioDefinition(
        key="eccentric_vibration",
        title="4. Fan Blade Imbalance & Vibration Surge",
        description="Mass eccentricity on rotating fan induces severe high-frequency vibration spike (> 0.8g RMS) on MPU6050 housing.",
        duration_steps=120,
    ),
    "ambient_heatwave_contradiction": ScenarioDefinition(
        key="ambient_heatwave_contradiction",
        title="5. Ambient Heatwave (Contradiction Verification)",
        description="Room temperature rises from 26.8C to 44.0C. SC-CAMV recognizes this as environmental context, corroborating normal current/vibe to reject false alarms.",
        duration_steps=120,
    ),
    "current_sensor_disconnection": ScenarioDefinition(
        key="current_sensor_disconnection",
        title="6. ACS712 Current Sensor Disconnection",
        description="ACS712 current sensor signal wire drops out (ADC=0). System enters SENSOR_DEGRADED state with conservative speed derate.",
        duration_steps=100,
    ),
    "mpu6050_disconnection": ScenarioDefinition(
        key="mpu6050_disconnection",
        title="7. MPU6050 I2C Bus Dropout",
        description="Loose header wire causes MPU6050 I2C communication loss. Vibration marked STALE and sensor health degraded.",
        duration_steps=100,
    ),
    "sensor_noise_spikes": ScenarioDefinition(
        key="sensor_noise_spikes",
        title="8. Isolated Sensor Noise Spikes",
        description="Single-sample electrical noise spikes test the leaky persistence accumulator to prevent premature tripping.",
        duration_steps=100,
    ),
    "dht11_disconnection": ScenarioDefinition(
        key="dht11_disconnection",
        title="9. DHT11 Disconnection (Context Degradation)",
        description="DHT11 environmental sensor disconnected. Ambient context marked unavailable without shutting down healthy motor.",
        duration_steps=100,
    ),
    "catastrophic_combined": ScenarioDefinition(
        key="catastrophic_combined",
        title="10. Multi-Factor Catastrophic Overload",
        description="Simultaneous mechanical obstruction, severe current surge (>2.2A), and rotor imbalance triggering fast-track emergency trip.",
        duration_steps=120,
    ),
    "recovery_probation_lockout": ScenarioDefinition(
        key="recovery_probation_lockout",
        title="11. Post-Trip Recovery & 3-Strike Lockout",
        description="Repeated transient trips test probation ramp. 3 consecutive trip events trigger permanent HARD_LOCKOUT requiring manual operator reset.",
        duration_steps=150,
    ),
}

def generate_scenario_frames(scenario_key: str, dt_s: float = 0.2) -> List[RawSensorFrame]:
    """Generate deterministic sensor frames for a given scenario."""
    if scenario_key not in SCENARIOS:
        scenario_key = "healthy_baseline"

    scen = SCENARIOS[scenario_key]
    sim = DCMotorPhysicsSimulator(seed=scen.seed)
    frames: List[RawSensorFrame] = []
    pwm = 100  # Default intended demonstration setting

    for step_idx in range(scen.duration_steps):
        if scenario_key == "healthy_baseline":
            sim.load_torque = 0.001
            sim.obstacle_present = False

        elif scenario_key == "ir_obstacle_detected":
            # Obstacle enters optical path at step 25
            if step_idx >= 25:
                sim.obstacle_present = True
                sim.set_fault("ir_object_detected", True)

        elif scenario_key == "mechanical_overload":
            # High friction begins at step 30
            if step_idx >= 30:
                sim.load_torque = 0.038
            else:
                sim.load_torque = 0.001

        elif scenario_key == "eccentric_vibration":
            # Imbalance mass added at step 25
            if step_idx >= 25:
                sim.eccentricity_mass = 0.00035

        elif scenario_key == "ambient_heatwave_contradiction":
            # External room temp ramps from 26.8 to 44C
            if step_idx >= 15:
                progress = min(1.0, (step_idx - 15) / 45.0)
                sim.amb_temp_c = 26.8 + (progress * 17.2)
                sim.amb_hum_pct = 75.0 - (progress * 30.0)

        elif scenario_key == "current_sensor_disconnection":
            # ACS712 drops at step 25
            if step_idx >= 25:
                sim.set_fault("acs712_disconnected", True)

        elif scenario_key == "mpu6050_disconnection":
            # MPU6050 drops at step 25
            if step_idx >= 25:
                sim.set_fault("mpu6050_disconnected", True)

        elif scenario_key == "sensor_noise_spikes":
            # Occasional single-sample spikes
            if step_idx in [20, 50, 75]:
                sim.sensor_noise_scale = 7.5
            else:
                sim.sensor_noise_scale = 1.0

        elif scenario_key == "dht11_disconnection":
            # DHT11 drops at step 25
            if step_idx >= 25:
                sim.set_fault("dht11_disconnected", True)

        elif scenario_key == "catastrophic_combined":
            # Multi-factor failure at step 25
            if step_idx >= 25:
                sim.load_torque = 0.045
                sim.eccentricity_mass = 0.0004
                sim.obstacle_present = True
                sim.set_fault("ir_object_detected", True)
                sim.set_fault("excessive_vibration", True)

        elif scenario_key == "recovery_probation_lockout":
            # Repeated faults triggering 3-strike lockout
            is_fault = (20 <= step_idx < 40) or (65 <= step_idx < 85) or (110 <= step_idx < 130)
            if is_fault:
                sim.load_torque = 0.04
                sim.set_fault("excessive_vibration", True)
            else:
                sim.load_torque = 0.001
                sim.set_fault("excessive_vibration", False)

        frame = sim.step(pwm_duty=pwm, dt_s=dt_s)
        frames.append(frame)

    return frames
