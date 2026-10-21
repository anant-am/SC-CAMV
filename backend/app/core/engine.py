import asyncio
import time
import logging
import random
from typing import Optional, Dict, Any, List

from backend.app.schemas.telemetry import (
    RawSensorFrame,
    DecisionExplanation,
    SystemState,
    ProtectiveAction,
    CalibrationProfile,
    MotorState,
    SensorDataSource,
)
from backend.app.algorithms.base import BaseHealthAlgorithm
from backend.app.algorithms.sc_camv import SCCAMVAlgorithm
from backend.app.algorithms.fixed_threshold import FixedThresholdAlgorithm
from backend.app.algorithms.naive_multifactor import NaiveMultifactorAlgorithm
from backend.app.simulation.motor_physics import DCMotorPhysicsSimulator
from backend.app.simulation.scenario_generator import SCENARIOS, generate_scenario_frames
from backend.app.hardware.serial_reader import serial_manager
from backend.app.storage.database import db_manager
from backend.app.core.websocket_manager import ws_hub

logger = logging.getLogger("MonitoringEngine")

# Supported 17 Fault Injection Modes
SUPPORTED_FAULTS = {
    "acs712_disconnected": {"name": "ACS712 Disconnection", "subsystem": "CURRENT", "desc": "Current sensor analog line severed (ADC=0)"},
    "acs712_noisy": {"name": "ACS712 Electrical Noise", "subsystem": "CURRENT", "desc": "High-variance Gaussian noise on current channel"},
    "acs712_out_of_range": {"name": "ACS712 Out-of-Range", "subsystem": "CURRENT", "desc": "Severe current surge reading (> 4.0A)"},
    "mpu6050_disconnected": {"name": "MPU6050 Disconnection", "subsystem": "VIBRATION", "desc": "I2C bus communication failure on A4/A5"},
    "excessive_vibration": {"name": "Excessive Vibration Surge", "subsystem": "VIBRATION", "desc": "Severe mechanical vibration (> 1.6g RMS)"},
    "mpu6050_noisy": {"name": "MPU6050 Erratic Samples", "subsystem": "VIBRATION", "desc": "Erratic accelerations with high variance"},
    "ir_object_detected": {"name": "IR Obstacle Detection", "subsystem": "IR", "desc": "Stationary object placed near fan blades (D2 LOW)"},
    "ir_stuck_low": {"name": "IR Stuck-LOW Failure", "subsystem": "IR", "desc": "IR sensor output frozen at LOW (false permanent obstacle)"},
    "ir_stuck_high": {"name": "IR Stuck-HIGH Failure", "subsystem": "IR", "desc": "IR sensor output frozen at HIGH (blind to obstacles)"},
    "dht11_disconnected": {"name": "DHT11 Disconnection", "subsystem": "DHT11", "desc": "Single-wire data line severed on D4"},
    "dht11_invalid": {"name": "DHT11 Out-of-Bounds", "subsystem": "DHT11", "desc": "Physical impossible readings (-99C / 150% RH)"},
    "serial_timeout": {"name": "Serial Stream Timeout", "subsystem": "SERIAL", "desc": "Simulated hardware freeze / telemetry stall"},
    "bluetooth_disconnected": {"name": "HC-05 Link Drop", "subsystem": "SERIAL", "desc": "Bluetooth RF connection packet drop"},
    "malformed_telemetry": {"name": "Malformed Telemetry Frame", "subsystem": "SERIAL", "desc": "Corrupted or partial JSON frames"},
    "stale_readings": {"name": "Stale Sensor Freezing", "subsystem": "ALGORITHM", "desc": "Values frozen with unchanging timestamp"},
    "multiple_simultaneous_faults": {"name": "Multi-Factor Failure", "subsystem": "SYSTEM", "desc": "Simultaneous obstacle, current surge, and vibration spike"},
    "recovery": {"name": "Fault Recovery Probation", "subsystem": "SYSTEM", "desc": "Clear faults and observe probation verification"},
}

# Compatibility aliases between UI definitions and internal engine keys
FAULT_KEY_ALIASES = {
    "ir_obstacle_detected": "ir_object_detected",
    "recovery_after_fault": "recovery",
    "acs712_disconnect": "acs712_disconnected",
    "mpu6050_disconnect": "mpu6050_disconnected",
    "dht11_disconnect": "dht11_disconnected",
    "bluetooth_disconnect": "bluetooth_disconnected",
}

class MonitoringEngine:
    def __init__(self):
        self.mode: str = "SIMULATION"  # SIMULATION, LIVE_HARDWARE, PAUSED
        self.active_algorithm_name: str = "SC-CAMV"
        self.algorithms: Dict[str, BaseHealthAlgorithm] = {
            "SC-CAMV": SCCAMVAlgorithm(),
            "FIXED_THRESHOLD": FixedThresholdAlgorithm(),
            "NAIVE_MULTIFACTOR": NaiveMultifactorAlgorithm(),
        }

        # Simulation state
        self.simulator: DCMotorPhysicsSimulator = DCMotorPhysicsSimulator()
        self.active_scenario_key: str = "healthy_baseline"
        self.scenario_step_idx: int = 0
        self.scenario_frames: List[RawSensorFrame] = []
        self.is_scenario_running: bool = False
        self.simulation_speed: float = 1.0

        # Motor Actuation State (Safe stopped default)
        self.commanded_motor_state: MotorState = MotorState.STOPPED
        self.target_pwm: int = 100      # Intended demonstration setting
        self.active_motor_pwm: int = 0  # Starts at 0 for safe stopped startup!

        # Latest states
        self.latest_frame: Optional[RawSensorFrame] = None
        self.latest_decision: Optional[DecisionExplanation] = None
        self.last_state: SystemState = SystemState.NORMAL

        # Active injected faults tracker & stale frame cache
        self.active_faults: Dict[str, bool] = {k: False for k in SUPPORTED_FAULTS}
        self._stale_frame_cache: Optional[RawSensorFrame] = None

        # Background task
        self.is_running: bool = False
        self.loop: Optional[asyncio.AbstractEventLoop] = None

        # Wire serial frame callback
        serial_manager.on_frame_callbacks.append(self._on_hardware_frame)

    @property
    def algorithm(self) -> BaseHealthAlgorithm:
        return self.algorithms.get(self.active_algorithm_name, self.algorithms["SC-CAMV"])

    def set_algorithm(self, name: str) -> bool:
        if name in self.algorithms:
            self.active_algorithm_name = name
            return True
        return False

    def set_mode(self, new_mode: str) -> bool:
        if new_mode in ["SIMULATION", "LIVE_HARDWARE", "PAUSED"]:
            self.mode = new_mode
            if new_mode == "LIVE_HARDWARE":
                # Only initiate connection if not already connected
                if serial_manager.connection_status not in ["CONNECTED", "LIVE", "CONNECTING", "CONNECTED_WAITING_FOR_TELEMETRY", "STALE"]:
                    # Look for recommended USB / Arduino port
                    ports = serial_manager.list_available_ports()
                    rec_port = next((p["port"] for p in ports if p.get("is_arduino")), None)
                    if not rec_port:
                        rec_port = next((p["port"] for p in ports if p.get("is_usb")), None)
                    serial_manager.connect(port=rec_port)
            else:
                serial_manager.disconnect()
            db_manager.log_event("INFO", "SYSTEM", f"Operating mode switched to {new_mode}", source="REAL" if new_mode == "LIVE_HARDWARE" else "SIMULATED")
            return True
        return False

    def start_motor(self, pwm: Optional[int] = None) -> bool:
        """Explicit operator command to start motor."""
        if pwm is not None:
            self.target_pwm = max(0, min(255, pwm))
        self.active_motor_pwm = self.target_pwm
        self.commanded_motor_state = MotorState.RUNNING
        
        if self.mode == "LIVE_HARDWARE":
            serial_manager.send_command({"cmd": "START", "pwm": self.active_motor_pwm})
        db_manager.log_event("INFO", "MOTOR", f"Motor started at commanded PWM {self.active_motor_pwm}", source="REAL" if self.mode == "LIVE_HARDWARE" else "SIMULATED")
        return True

    def stop_motor(self) -> bool:
        """Explicit operator command to stop motor."""
        self.active_motor_pwm = 0
        self.commanded_motor_state = MotorState.STOPPED
        if self.mode == "LIVE_HARDWARE":
            serial_manager.send_command({"cmd": "STOP"})
        db_manager.log_event("INFO", "MOTOR", "Motor stopped by operator", source="REAL" if self.mode == "LIVE_HARDWARE" else "SIMULATED")
        return True

    def set_pwm(self, pwm: int) -> bool:
        """Adjust motor PWM."""
        self.target_pwm = max(0, min(255, pwm))
        if self.commanded_motor_state == MotorState.RUNNING:
            self.active_motor_pwm = self.target_pwm
            if self.mode == "LIVE_HARDWARE":
                serial_manager.send_command({"cmd": "SET_PWM", "pwm": self.active_motor_pwm})
        return True

    def emergency_stop(self) -> bool:
        """Immediate software emergency stop."""
        self.active_motor_pwm = 0
        self.commanded_motor_state = MotorState.STOPPED
        if self.mode == "LIVE_HARDWARE":
            serial_manager.send_command({"cmd": "ESTOP"})
        db_manager.log_event("CRITICAL", "MOTOR", "EMERGENCY STOP EXECUTED", source="REAL" if self.mode == "LIVE_HARDWARE" else "SIMULATED")
        return True

    def manual_reset_lockout(self):
        algo = self.algorithms.get("SC-CAMV")
        if isinstance(algo, SCCAMVAlgorithm):
            algo.manual_reset_lockout()
        self.commanded_motor_state = MotorState.STOPPED
        self.active_motor_pwm = 0
        if self.mode == "LIVE_HARDWARE":
            serial_manager.send_command({"cmd": "RESET"})
        db_manager.log_event("RECOVERY", "ALGORITHM", "Operator manual reset of lockout confirmed", source="REAL" if self.mode == "LIVE_HARDWARE" else "SIMULATED")

    # Fault Injection Lab Methods
    def inject_fault(self, fault_key: str) -> bool:
        normalized_key = FAULT_KEY_ALIASES.get(fault_key, fault_key)

        if normalized_key not in SUPPORTED_FAULTS:
            return False

        if normalized_key == "recovery":
            self.clear_all_faults()
            self.manual_reset_lockout()
            return True

        self.active_faults[normalized_key] = True

        if normalized_key == "multiple_simultaneous_faults":
            self.simulator.set_fault("ir_object_detected", True)
            self.simulator.load_torque = 0.04
            self.simulator.set_fault("excessive_vibration", True)
        else:
            self.simulator.set_fault(normalized_key, True)

        info = SUPPORTED_FAULTS[normalized_key]
        db_manager.log_event(
            "FAULT",
            info["subsystem"],
            f"Fault Injected: {info['name']} ({info['desc']})",
            source="REAL" if self.mode == "LIVE_HARDWARE" else "SIMULATED",
            is_fault_active=True,
            metadata={"fault_key": normalized_key, "original_key": fault_key}
        )
        return True

    def clear_fault(self, fault_key: str) -> bool:
        normalized_key = FAULT_KEY_ALIASES.get(fault_key, fault_key)

        if normalized_key not in SUPPORTED_FAULTS:
            return False
        self.active_faults[normalized_key] = False

        if normalized_key == "multiple_simultaneous_faults":
            self.simulator.set_fault("ir_object_detected", False)
            self.simulator.load_torque = 0.001
            self.simulator.set_fault("excessive_vibration", False)
        else:
            self.simulator.set_fault(normalized_key, False)

        info = SUPPORTED_FAULTS[normalized_key]
        db_manager.log_event(
            "RECOVERY",
            info["subsystem"],
            f"Fault Cleared: {info['name']}",
            source="REAL" if self.mode == "LIVE_HARDWARE" else "SIMULATED",
            is_fault_active=False,
            metadata={"fault_key": normalized_key, "original_key": fault_key}
        )
        return True

    def clear_all_faults(self) -> bool:
        for k in self.active_faults:
            self.active_faults[k] = False
        self.simulator.clear_all_faults()
        self._stale_frame_cache = None
        db_manager.log_event("RECOVERY", "SYSTEM", "All simulated faults cleared by operator", source="REAL" if self.mode == "LIVE_HARDWARE" else "SIMULATED", is_fault_active=False)
        return True

    def get_active_faults(self) -> Dict[str, Any]:
        active_list = [k for k, v in self.active_faults.items() if v]
        # Include any matching alias keys for full frontend contract compatibility
        for alias, canon in FAULT_KEY_ALIASES.items():
            if self.active_faults.get(canon, False) and alias not in active_list:
                active_list.append(alias)

        return {
            "active_faults": active_list,
            "faults": [
                {
                    "key": k,
                    "name": meta["name"],
                    "subsystem": meta["subsystem"],
                    "description": meta["desc"],
                    "is_active": self.active_faults[k],
                }
                for k, meta in SUPPORTED_FAULTS.items()
            ],
            "any_active": any(self.active_faults.values()),
        }

    def _apply_active_fault_overlays(self, frame: RawSensorFrame) -> RawSensorFrame:
        """Applies active fault overlays to telemetry before health algorithmic evaluation."""
        if not any(self.active_faults.values()):
            return frame

        f = frame.model_copy(deep=True)
        active_keys = [k for k, v in self.active_faults.items() if v]
        f.active_faults = active_keys

        # 1. ACS712 Current Faults
        if self.active_faults.get("acs712_disconnected"):
            f.current_a = None
            f.current_raw_adc = 0
            f.current_v = 0.0
            f.sensor_statuses["acs712"] = "DISCONNECTED"
        elif self.active_faults.get("acs712_out_of_range"):
            f.current_a = 4.25
            f.current_raw_adc = 1023
            f.current_v = 5.0
        elif self.active_faults.get("acs712_noisy"):
            if f.current_a is not None:
                f.current_a = round(f.current_a + random.gauss(0.0, 0.40), 3)

        # 2. MPU6050 Vibration & Motion Faults
        if self.active_faults.get("mpu6050_disconnected"):
            f.vibe_g = None
            f.ax = None
            f.ay = None
            f.az = None
            f.gx = None
            f.gy = None
            f.gz = None
            f.sensor_statuses["mpu6050"] = "DISCONNECTED"
        elif self.active_faults.get("excessive_vibration"):
            base_vibe = f.vibe_g if (f.vibe_g is not None and f.vibe_g > 0) else 0.02
            f.vibe_g = round(base_vibe + 1.85, 3)
            if f.ax is not None:
                f.ax = round(f.ax + random.gauss(0.0, 0.5), 3)
            if f.ay is not None:
                f.ay = round(f.ay + random.gauss(0.0, 0.5), 3)
        elif self.active_faults.get("mpu6050_noisy"):
            if f.vibe_g is not None:
                f.vibe_g = round(max(0.005, f.vibe_g + random.gauss(0.0, 0.35)), 3)

        # 3. IR Obstacle Faults
        if self.active_faults.get("ir_object_detected") or self.active_faults.get("ir_stuck_low"):
            f.ir_object_detected = True
            f.ir_raw_state = 0
        elif self.active_faults.get("ir_stuck_high"):
            f.ir_object_detected = False
            f.ir_raw_state = 1

        # 4. DHT11 Ambient Sensor Faults
        if self.active_faults.get("dht11_disconnected"):
            f.amb_temp_c = None
            f.amb_hum_pct = None
            f.sensor_statuses["dht11"] = "DISCONNECTED"
        elif self.active_faults.get("dht11_invalid"):
            f.amb_temp_c = -99.0
            f.amb_hum_pct = 150.0

        # 5. Multi-Factor Failure Compound
        if self.active_faults.get("multiple_simultaneous_faults"):
            f.current_a = 3.65
            f.current_raw_adc = 920
            f.vibe_g = 1.95
            f.ir_object_detected = True
            f.ir_raw_state = 0

        # 6. Stale Readings
        if self.active_faults.get("stale_readings"):
            if getattr(self, "_stale_frame_cache", None) is not None:
                f.current_a = self._stale_frame_cache.current_a
                f.vibe_g = self._stale_frame_cache.vibe_g
                f.ir_object_detected = self._stale_frame_cache.ir_object_detected
                f.timestamp_ms = self._stale_frame_cache.timestamp_ms
                f.sequence_id = self._stale_frame_cache.sequence_id
            else:
                self._stale_frame_cache = f.model_copy()
        else:
            self._stale_frame_cache = None

        # 7. Communications / Transport Faults
        if self.active_faults.get("serial_timeout") or self.active_faults.get("bluetooth_disconnected"):
            f.source = SensorDataSource.FALLBACK
            f.sensor_statuses = {k: "STALE" for k in f.sensor_statuses}

        return f

    # Scenario Runner Methods
    def load_scenario(self, scenario_key: str):
        if scenario_key in SCENARIOS:
            self.active_scenario_key = scenario_key
            self.scenario_frames = generate_scenario_frames(scenario_key, dt_s=0.2)
            self.scenario_step_idx = 0
            self.algorithm.reset()

    def start_scenario(self, scenario_key: Optional[str] = None):
        if scenario_key:
            self.load_scenario(scenario_key)
        elif not self.scenario_frames:
            self.load_scenario(self.active_scenario_key)
        self.mode = "SIMULATION"
        self.is_scenario_running = True
        self.commanded_motor_state = MotorState.RUNNING
        self.active_motor_pwm = self.target_pwm

    def pause_scenario(self):
        self.is_scenario_running = False

    def reset_scenario(self):
        self.is_scenario_running = False
        self.scenario_step_idx = 0
        self.algorithm.reset()
        if self.active_scenario_key:
            self.load_scenario(self.active_scenario_key)

    def _on_hardware_frame(self, frame: RawSensorFrame):
        """Hardware callback from background serial reader."""
        if self.mode != "LIVE_HARDWARE":
            return
        if getattr(self, "_was_stale_logged", False):
            logger.info(f"[TELEMETRY-LIVE] Valid hardware telemetry resumed on {serial_manager.port} (seq={frame.sequence_id}). Recovered.")
            self._was_stale_logged = False
        self._process_single_frame(frame)

    def _process_single_frame(self, frame: RawSensorFrame):
        """Core telemetry processing pipeline."""
        frame = self._apply_active_fault_overlays(frame)
        decision = self.algorithm.process_frame(frame)

        self.latest_frame = frame
        self.latest_decision = decision

        # Protective action execution
        if decision.action_requested in [ProtectiveAction.EMERGENCY_SHUTDOWN, ProtectiveAction.MANUAL_RESET_REQUIRED]:
            self.active_motor_pwm = 0
            self.commanded_motor_state = MotorState.STOPPED
            if self.mode == "LIVE_HARDWARE":
                serial_manager.send_command({"cmd": "ESTOP"})
        elif decision.action_requested == ProtectiveAction.DERATE_PWM_30:
            self.active_motor_pwm = 76
            if self.mode == "LIVE_HARDWARE":
                serial_manager.send_command({"cmd": "SET_PWM", "pwm": 76})
        elif decision.action_requested == ProtectiveAction.DERATE_PWM_60:
            self.active_motor_pwm = 153
            if self.mode == "LIVE_HARDWARE":
                serial_manager.send_command({"cmd": "SET_PWM", "pwm": 153})

        # Save to SQLite database
        try:
            db_manager.insert_telemetry(frame)
            db_manager.insert_decision(decision)
        except Exception as e:
            logger.error(f"DB insert failed: {e}")

        # Broadcast state transitions
        if decision.state != self.last_state:
            severity = "CRITICAL" if decision.state in [SystemState.CRITICAL, SystemState.HARD_LOCKOUT] else ("WARNING" if decision.state in [SystemState.WARNING, SystemState.HIGH_RISK] else "INFO")
            db_manager.log_event(
                severity,
                "ALGORITHM",
                f"State transition: {self.last_state.value if hasattr(self.last_state, 'value') else self.last_state} -> {decision.state.value if hasattr(decision.state, 'value') else decision.state} (Risk: {decision.risk_score})",
                source=frame.source.value if hasattr(frame.source, "value") else str(frame.source),
            )
            self._dispatch_broadcast("state_transition", {
                "from_state": self.last_state.value if hasattr(self.last_state, "value") else str(self.last_state),
                "to_state": decision.state.value if hasattr(decision.state, "value") else str(decision.state),
                "risk_score": decision.risk_score,
                "action": decision.action_requested.value if hasattr(decision.action_requested, "value") else str(decision.action_requested),
                "timestamp_ms": decision.timestamp_ms,
            })
            self.last_state = decision.state

        # Broadcast live frame over WebSocket thread-safely
        self._dispatch_broadcast("live_update", {
            "telemetry": frame.model_dump(),
            "decision": decision.model_dump(),
            "engine": {
                "mode": self.mode,
                "algorithm": self.active_algorithm_name,
                "commanded_motor_state": self.commanded_motor_state.value if hasattr(self.commanded_motor_state, "value") else str(self.commanded_motor_state),
                "active_pwm": self.active_motor_pwm,
                "target_pwm": self.target_pwm,
                "scenario": self.active_scenario_key,
                "step": self.scenario_step_idx,
                "transport": serial_manager.transport_type if self.mode == "LIVE_HARDWARE" else "SIMULATED",
                "serial_port": serial_manager.port if self.mode == "LIVE_HARDWARE" else None,
                "serial_status": serial_manager.connection_status,
                "is_live": (self.mode == "LIVE_HARDWARE" and serial_manager.connection_status == "LIVE"),
                "any_fault_active": any(self.active_faults.values()),
            }
        })

    def _dispatch_broadcast(self, event: str, data: dict):
        """Thread-safe WebSocket dispatch from either asyncio main loop or worker threads."""
        coro = ws_hub.broadcast(event, data)
        if self.loop and self.loop.is_running():
            try:
                asyncio.run_coroutine_threadsafe(coro, self.loop)
                return
            except Exception as e:
                logger.debug(f"Broadcast threadsafe dispatch warning: {e}")
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            pass

    async def start_loop(self):
        """Asynchronous execution loop for simulation and continuous background updates."""
        self.loop = asyncio.get_running_loop()
        self.is_running = True
        logger.info("Starting monitoring engine loop...")

        # Initialize simulation physics model
        self.simulator.clear_all_faults()
        self.commanded_motor_state = MotorState.STOPPED
        self.active_motor_pwm = 0

        while self.is_running:
            try:
                if self.mode == "SIMULATION":
                    if self.is_scenario_running and self.scenario_frames:
                        if self.scenario_step_idx < len(self.scenario_frames):
                            frame = self.scenario_frames[self.scenario_step_idx]
                            self.scenario_step_idx += 1
                            self._process_single_frame(frame)
                        else:
                            self.scenario_step_idx = 0
                    else:
                        # Free simulation continuous stepping with current motor state
                        frame = self.simulator.step(pwm_duty=self.active_motor_pwm, dt_s=0.2)
                        self._process_single_frame(frame)

                elif self.mode == "LIVE_HARDWARE":
                    # Check for genuine stale connection or disconnected serial link
                    is_stale = serial_manager.is_stale(timeout_seconds=2.5)
                    is_dead = serial_manager.connection_status in ["DISCONNECTED", "ERROR"]

                    if (is_stale or is_dead) and self.latest_frame:
                        now_mono = time.time()
                        # Rate-limit stale status broadcasts to once per second (avoids flooding DB & WebSocket)
                        if now_mono - getattr(self, "_last_stale_broadcast_time", 0.0) >= 1.0:
                            self._last_stale_broadcast_time = now_mono
                            stale_frame = self.latest_frame.model_copy()
                            # Maintain TRUE provenance: do NOT claim FALLBACK/SIMULATED for hardware frame
                            # Keep source as REAL; truthfully mark individual sensor channels as STALE or DISCONNECTED
                            status_label = "DISCONNECTED" if is_dead else "STALE"
                            stale_frame.sensor_statuses = {k: status_label for k in stale_frame.sensor_statuses}
                            self.latest_frame = stale_frame

                            if not getattr(self, "_was_stale_logged", False):
                                logger.warning(
                                    f"[TELEMETRY-STALE] Hardware telemetry inactive on {serial_manager.port} "
                                    f"(Status: {serial_manager.connection_status}, is_stale={is_stale}). Reporting {status_label}."
                                )
                                self._was_stale_logged = True

                            # Broadcast stale / disconnected status without running motor-shutdown or falsifying data
                            self._dispatch_broadcast("live_update", {
                                "telemetry": stale_frame.model_dump(),
                                "decision": self.latest_decision.model_dump() if self.latest_decision else None,
                                "engine": {
                                    "mode": self.mode,
                                    "algorithm": self.active_algorithm_name,
                                    "commanded_motor_state": self.commanded_motor_state.value if hasattr(self.commanded_motor_state, "value") else str(self.commanded_motor_state),
                                    "active_pwm": self.active_motor_pwm,
                                    "target_pwm": self.target_pwm,
                                    "scenario": self.active_scenario_key,
                                    "step": self.scenario_step_idx,
                                    "transport": serial_manager.transport_type,
                                    "serial_port": serial_manager.port,
                                    "serial_status": "STALE" if is_stale else serial_manager.connection_status,
                                    "is_live": False,
                                    "any_fault_active": any(self.active_faults.values()),
                                }
                            })

                sleep_time = max(0.05, 0.2 / max(0.1, self.simulation_speed))
                await asyncio.sleep(sleep_time)

            except Exception as e:
                logger.error(f"Error in engine loop: {e}", exc_info=True)
                await asyncio.sleep(0.5)

    def stop_loop(self):
        self.is_running = False
        serial_manager.disconnect()

engine = MonitoringEngine()
