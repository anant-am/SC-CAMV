import math
import random
from typing import Optional, Dict, Any, List
from backend.app.schemas.telemetry import (
    RawSensorFrame,
    MotorState,
    SensorDataSource,
)

class DCMotorPhysicsSimulator:
    """
    First-principles lumped-parameter physics model of a DC motor with fan blade assembly.
    Simulates:
    - Electromechanical dynamics (armature resistance R=2.5 ohm, back-EMF, torque, inertia, damping)
    - Fan aerodynamic drag (torque proportional to omega^2)
    - ACS712 Hall-effect current sensor (raw ADC, voltage, amperes, zero-current offset)
    - MPU6050 motion sensor mounted upside down (Az approx -1.0g, vibration RMS after gravity removal)
    - IR obstacle sensor on D2 (stationary obstruction detection, configurable polarity)
    - DHT11 environmental sensor on D4 (ambient room temperature and relative humidity)
    """

    def __init__(
        self,
        v_supply: float = 12.0,
        r_armature: float = 2.5,
        k_torque: float = 0.035,
        k_backemf: float = 0.035,
        inertia_j: float = 0.00022,
        damping_b: float = 0.00018,
        fan_drag_coeff: float = 0.0000015,
        acs_zero_adc: int = 514,
        acs_sensitivity_v_per_a: float = 0.066,
        seed: int = 42,
    ):
        self.v_supply = v_supply
        self.r_arm = r_armature
        self.k_t = k_torque
        self.k_e = k_backemf
        self.j = inertia_j
        self.b = damping_b
        self.fan_drag = fan_drag_coeff
        self.acs_zero_adc = acs_zero_adc
        self.acs_sensitivity = acs_sensitivity_v_per_a

        # Dynamic physical states
        self.omega_rad_s: float = 0.0
        self.current_a: float = 0.0
        self.vibe_g: float = 0.02
        self.time_ms: int = 0
        self.sequence_id: int = 0

        # Environmental room context (DHT11)
        self.amb_temp_c: float = 26.8
        self.amb_hum_pct: float = 75.0

        # Mechanical disturbance variables
        self.load_torque: float = 0.0
        self.eccentricity_mass: float = 0.0
        self.obstacle_present: bool = False
        self.sensor_noise_scale: float = 1.0

        # Active software-injected sensor faults
        self.faults: Dict[str, Any] = {
            "acs712_disconnected": False,
            "acs712_noisy": False,
            "acs712_out_of_range": False,
            "mpu6050_disconnected": False,
            "mpu6050_noisy": False,
            "excessive_vibration": False,
            "ir_object_detected": False,
            "ir_stuck_low": False,
            "ir_stuck_high": False,
            "dht11_disconnected": False,
            "dht11_invalid": False,
        }

        self.rng = random.Random(seed)

    def set_fault(self, fault_key: str, active: bool = True):
        self.faults[fault_key] = active

    def clear_all_faults(self):
        for k in self.faults:
            self.faults[k] = False
        self.load_torque = 0.0
        self.eccentricity_mass = 0.0
        self.obstacle_present = False
        self.sensor_noise_scale = 1.0
        self.amb_temp_c = 26.8
        self.amb_hum_pct = 75.0

    def step(self, pwm_duty: int, dt_s: float = 0.2) -> RawSensorFrame:
        """Step the continuous physics simulation forward by dt_s seconds."""
        self.time_ms += int(dt_s * 1000)
        self.sequence_id += 1

        pwm_clamped = max(0, min(255, pwm_duty))
        v_applied = self.v_supply * (pwm_clamped / 255.0)

        # Mechanical obstruction effect: obstacle near fan creates blade air turbulence and frictional drag
        extra_drag = 0.0
        if self.obstacle_present or self.faults.get("ir_object_detected"):
            extra_drag = 0.012

        # 1. Electrical dynamics: I = (V - Ke * omega) / R
        back_emf = self.k_e * self.omega_rad_s
        if v_applied > back_emf:
            target_current = (v_applied - back_emf) / self.r_arm
        else:
            target_current = 0.0

        # Rapid electrical transient response
        self.current_a += (target_current - self.current_a) * min(1.0, dt_s / 0.04)
        if pwm_clamped == 0 and self.omega_rad_s < 2.0:
            self.current_a = 0.0

        # 2. Mechanical dynamics: J * domega/dt = Kt * I - B * omega - T_fan_drag - T_load - T_extra
        motor_torque = self.k_t * self.current_a
        aerodynamic_drag = self.fan_drag * (self.omega_rad_s ** 2)
        total_retarding_torque = (self.b * self.omega_rad_s) + aerodynamic_drag + self.load_torque + extra_drag
        d_omega = (motor_torque - total_retarding_torque) / self.j
        self.omega_rad_s = max(0.0, self.omega_rad_s + d_omega * dt_s)
        if pwm_clamped == 0 and self.omega_rad_s < 1.0:
            self.omega_rad_s = 0.0

        # 3. Vibration dynamics (MPU6050 on motor housing)
        centrifugal_force = self.eccentricity_mass * ((self.omega_rad_s / 25.0) ** 2)
        load_chatter = max(0.0, (self.load_torque - 0.015) * 25.0) if self.load_torque > 0.015 else 0.0
        
        if self.omega_rad_s > 5.0 or self.load_torque > 0.015:
            base_vibe = 0.045 + (0.00035 * self.omega_rad_s) + centrifugal_force + load_chatter
        else:
            base_vibe = 0.015  # Stationary bench noise floor

        if self.faults.get("excessive_vibration"):
            base_vibe += 1.65

        vibe_noise = self.rng.gauss(0.0, 0.008 * self.sensor_noise_scale)
        if self.faults.get("mpu6050_noisy"):
            vibe_noise += self.rng.gauss(0.0, 0.45)
        self.vibe_g = max(0.01, base_vibe + vibe_noise)

        # 3-Axis Accelerations (MPU6050 mounted upside-down: Az approx -1.0g when stationary)
        ax_val = self.rng.gauss(0.02, 0.01)
        ay_val = self.rng.gauss(-0.01, 0.01)
        az_val = -0.985 + self.rng.gauss(0.0, 0.015)
        gx_val = self.rng.gauss(0.8, 0.4)
        gy_val = self.rng.gauss(-1.2, 0.4)
        gz_val = self.rng.gauss(0.2, 0.3)

        if self.omega_rad_s > 5.0:
            ax_val += math.sin(self.time_ms / 50.0) * (self.vibe_g * 0.8)
            ay_val += math.cos(self.time_ms / 50.0) * (self.vibe_g * 0.8)
            az_val += math.sin(self.time_ms / 40.0) * (self.vibe_g * 0.3)

        # 4. Synthesize Sensor Measurements with realistic ADC characteristics
        sim_current = self.current_a
        if self.faults.get("acs712_noisy"):
            sim_current += self.rng.gauss(0.0, 0.35)
        if self.faults.get("acs712_out_of_range"):
            sim_current = 4.25

        # Raw ADC calculation: ADC = Zero_ADC + (Current * Sensitivity * 1023 / 5.0)
        adc_delta = (sim_current * self.acs_sensitivity * 1023.0) / 5.0
        meas_adc = int(round(self.acs_zero_adc + adc_delta + self.rng.gauss(0.0, 0.8 * self.sensor_noise_scale)))
        meas_adc = max(0, min(1023, meas_adc))
        meas_voltage = round((meas_adc * 5.0) / 1023.0, 3)
        meas_current = round(((meas_adc - self.acs_zero_adc) * 5.0) / (1023.0 * self.acs_sensitivity), 3)

        if self.faults.get("acs712_disconnected"):
            meas_adc = 0
            meas_voltage = 0.0
            meas_current = None

        # MPU6050
        if self.faults.get("mpu6050_disconnected"):
            meas_vibe = None
            ax_val = None
            ay_val = None
            az_val = None
            gx_val = None
            gy_val = None
            gz_val = None
        else:
            meas_vibe = round(self.vibe_g, 3)
            ax_val = round(ax_val, 3)
            ay_val = round(ay_val, 3)
            az_val = round(az_val, 3)
            gx_val = round(gx_val, 2)
            gy_val = round(gy_val, 2)
            gz_val = round(gz_val, 2)

        # IR Obstacle Sensor (Stationary object near motor)
        ir_det = self.obstacle_present or self.faults.get("ir_object_detected", False)
        ir_raw = 0 if ir_det else 1

        if self.faults.get("ir_stuck_low"):
            ir_raw = 0
            ir_det = True
        elif self.faults.get("ir_stuck_high"):
            ir_raw = 1
            ir_det = False

        # DHT11 Environmental Context
        if self.faults.get("dht11_disconnected"):
            meas_amb_t = None
            meas_amb_h = None
        elif self.faults.get("dht11_invalid"):
            meas_amb_t = -99.0
            meas_amb_h = 150.0
        else:
            meas_amb_t = round(self.amb_temp_c + self.rng.gauss(0.0, 0.05 * self.sensor_noise_scale), 1)
            meas_amb_h = round(self.amb_hum_pct + self.rng.gauss(0.0, 0.15 * self.sensor_noise_scale), 1)

        # Motor commanded vs inferred states
        if pwm_clamped == 0:
            cmd_state = MotorState.STOPPED
        else:
            cmd_state = MotorState.RUNNING

        if meas_current is not None and meas_current > 0.15 and (meas_vibe is not None and meas_vibe > 0.03):
            inf_state = MotorState.RUNNING
        elif pwm_clamped == 0 and (meas_vibe is None or meas_vibe < 0.035):
            inf_state = MotorState.STOPPED
        else:
            inf_state = MotorState.UNKNOWN

        active_f_keys = [k for k, v in self.faults.items() if v]

        return RawSensorFrame(
            sequence_id=self.sequence_id,
            timestamp_ms=self.time_ms,
            current_a=meas_current,
            current_raw_adc=meas_adc if not self.faults.get("acs712_disconnected") else None,
            current_v=meas_voltage if not self.faults.get("acs712_disconnected") else None,
            vibe_g=meas_vibe,
            ax=ax_val,
            ay=ay_val,
            az=az_val,
            gx=gx_val,
            gy=gy_val,
            gz=gz_val,
            ir_object_detected=ir_det,
            ir_raw_state=ir_raw,
            amb_temp_c=meas_amb_t,
            amb_hum_pct=meas_amb_h,
            motor_pwm=pwm_clamped,
            commanded_motor_state=cmd_state,
            inferred_motor_state=inf_state,
            source=SensorDataSource.SIMULATED,
            is_simulated=True,
            active_faults=active_f_keys,
        )
