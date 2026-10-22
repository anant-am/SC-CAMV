import serial
import serial.tools.list_ports
import json
import threading
import time
import queue
import logging
from typing import List, Dict, Optional, Callable, Any

from backend.app.schemas.telemetry import (
    RawSensorFrame,
    MotorState,
    SensorDataSource,
)

logger = logging.getLogger("SerialManager")

class SerialHardwareManager:
    """
    Authoritative hardware communication manager for Arduino UNO (USB) and HC-05 (Bluetooth).
    Guarantees:
    - Single threaded reader per serial port (prevents port contention)
    - Robust newline framing and partial-message buffer management
    - Real-time timestamp tracking and stale-data detection
    - Non-blocking asynchronous distribution via callbacks and queues
    - Clean distinction between USB, Bluetooth, Disconnected, and Stale states
    """

    def __init__(self, port: str = "COM3", baud_rate: int = 9600, timeout_s: float = 1.0):
        self.port = port
        self.baud_rate = baud_rate
        self.timeout_s = timeout_s

        self.serial_conn: Optional[serial.Serial] = None
        self.is_running: bool = False
        self.thread: Optional[threading.Thread] = None
        self.frame_queue: queue.Queue = queue.Queue(maxsize=1000)

        # Explicit separated connection & telemetry states:
        # DISCONNECTED, CONNECTING, CONNECTED_WAITING_FOR_TELEMETRY, LIVE, STALE, RECONNECTING, ERROR
        self.connection_status: str = "DISCONNECTED"
        self.status_reason: str = "Hardware port is closed."
        self.transport_type: str = "USB"  # USB or BLUETOOTH
        self.last_error: Optional[str] = None

        # Diagnostics & counters
        self.bytes_received: int = 0
        self.frames_parsed: int = 0
        self.corrupted_frames: int = 0
        self.last_sequence_id: int = 0
        self.last_frame_time_ms: Optional[int] = None

        # Distinct timestamps (truthful provenance - never conflate byte arrivals with valid telemetry!)
        self.last_byte_time: float = 0.0
        self.last_valid_frame_time: float = 0.0
        self.last_connect_time: float = 0.0
        self.last_system_time: float = 0.0  # Kept for backward compatibility

        # Error & watchdog counters
        self.consecutive_read_errors: int = 0
        self.consecutive_parse_errors: int = 0
        self.reconnect_attempts: int = 0
        self.max_watchdog_restarts: int = 3

        self._lock = threading.Lock()
        self._write_lock = threading.Lock()

        # High-level callback hooks
        self.on_frame_callbacks: List[Callable[[RawSensorFrame], None]] = []

    @staticmethod
    def list_available_ports() -> List[Dict[str, Any]]:
        """Scan and list all physical and virtual COM ports on Windows, prioritizing USB hardware."""
        ports = serial.tools.list_ports.comports()
        result = []
        for p in ports:
            desc = p.description or ""
            hwid = p.hwid or ""
            is_bt = "bluetooth" in desc.lower() or "bth" in hwid.lower() or "standard serial over bluetooth" in desc.lower()
            is_arduino = "arduino" in desc.lower() or "2341:" in hwid.lower() or "ch340" in desc.lower() or "cp210" in desc.lower()
            is_usb = not is_bt
            result.append({
                "port": p.device,
                "description": desc,
                "hwid": hwid,
                "is_bluetooth": is_bt,
                "is_usb": is_usb,
                "is_arduino": is_arduino,
                "is_recommended": is_arduino or is_usb,
            })
        # Sort so Arduino / USB ports appear first
        result.sort(key=lambda x: (not x["is_arduino"], not x["is_usb"], x["port"]))
        return result

    def connect(self, port: Optional[str] = None, baud_rate: Optional[int] = None, transport: Optional[str] = None) -> bool:
        """Safely connect to the specified COM port with validation and actionable errors."""
        with self._lock:
            target_port = port or self.port
            target_baud = baud_rate or self.baud_rate

            # Idempotent check: if already connected to this port and open, do not disrupt
            if (
                self.serial_conn
                and getattr(self.serial_conn, "is_open", False)
                and self.port.upper() == target_port.upper()
                and self.is_running
                and self.thread
                and self.thread.is_alive()
                and self.connection_status in ["LIVE", "CONNECTED", "CONNECTING", "CONNECTED_WAITING_FOR_TELEMETRY"]
            ):
                logger.info(f"[SERIAL-CONNECT] Port {target_port} is already actively connected and running. Reusing existing connection.")
                return True

            # Check if port exists on system
            available_ports = self.list_available_ports()
            port_match = next((p for p in available_ports if p["port"].upper() == target_port.upper()), None)
            if not port_match and not target_port.startswith("MOCK"):
                self.connection_status = "ERROR"
                self.last_error = f"Port '{target_port}' not found on this system. Please check your Arduino USB connection."
                self.status_reason = self.last_error
                logger.warning(f"[SERIAL-CONNECT] {self.last_error}")
                return False

            self.port = target_port
            self.baud_rate = target_baud
            if transport:
                self.transport_type = transport
            elif port_match and port_match.get("is_bluetooth"):
                self.transport_type = "BLUETOOTH"
            else:
                self.transport_type = "USB"

            self._disconnect_internal()
            time.sleep(0.2)  # Give Windows driver time to release COM port handle

            opened_conn = None
            last_open_exc = None
            self.connection_status = "CONNECTING"
            self.status_reason = f"Opening serial port {self.port} at {self.baud_rate} baud..."
            for attempt in range(1, 4):
                try:
                    logger.info(f"[SERIAL-CONNECT] Opening {self.port} at {self.baud_rate} baud (attempt {attempt}/3, Transport: {self.transport_type})...")
                    opened_conn = serial.Serial(
                        port=self.port,
                        baudrate=self.baud_rate,
                        timeout=self.timeout_s,
                        write_timeout=self.timeout_s,
                    )
                    break
                except (PermissionError, serial.SerialException, OSError) as exc:
                    last_open_exc = exc
                    if attempt < 3:
                        logger.warning(f"[SERIAL-CONNECT] Port {self.port} busy or releasing handle ({exc}). Retrying in 0.3s...")
                        time.sleep(0.3)

            if not opened_conn:
                err_str = str(last_open_exc)
                self.connection_status = "ERROR"
                if "Access is denied" in err_str or "PermissionError" in err_str or (hasattr(last_open_exc, 'errno') and last_open_exc.errno == 13):
                    self.last_error = (
                        f"Access denied to {self.port}. The Arduino IDE Serial Monitor, Serial Plotter, or another application "
                        f"is holding the port open. Please close Arduino IDE's Serial Monitor and click Connect again."
                    )
                elif "FileNotFoundError" in err_str or "could not open port" in err_str:
                    self.last_error = f"Device on {self.port} was disconnected or is unavailable."
                else:
                    self.last_error = f"Failed to open {self.port}: {err_str}"
                self.status_reason = self.last_error
                logger.warning(f"[SERIAL-CONNECT] {self.last_error}")
                return False

            self.serial_conn = opened_conn
            try:
                self.serial_conn.reset_input_buffer()
                self.serial_conn.reset_output_buffer()
            except Exception:
                pass

            now = time.time()
            self.is_running = True
            # Transition to CONNECTED_WAITING_FOR_TELEMETRY upon port open; LIVE requires verified telemetry!
            self.connection_status = "CONNECTED_WAITING_FOR_TELEMETRY"
            self.status_reason = f"Connected to {self.port}. Background reader active; awaiting initial telemetry stream."
            self.last_error = None
            self.last_connect_time = now
            self.consecutive_read_errors = 0
            self.consecutive_parse_errors = 0
            self.reconnect_attempts = 0

            self.thread = threading.Thread(target=self._reader_loop, daemon=True)
            self.thread.start()
            logger.info(f"[SERIAL-CONNECT] Port {self.port} opened successfully. Background serial reader started. State: {self.connection_status}")
            return True

    def disconnect(self):
        """Cleanly terminate serial thread and close the OS port handle."""
        with self._lock:
            self._disconnect_internal()

    def _disconnect_internal(self):
        self.is_running = False
        old_thread = self.thread
        old_conn = self.serial_conn
        self.thread = None
        self.serial_conn = None

        if old_conn:
            try:
                if getattr(old_conn, "is_open", False):
                    old_conn.close()
            except Exception as e:
                logger.debug(f"[SERIAL-DISCONNECT] Error closing port: {e}")

        if old_thread and old_thread.is_alive():
            if threading.current_thread() != old_thread:
                try:
                    old_thread.join(timeout=1.5)
                except Exception as e:
                    logger.debug(f"[SERIAL-DISCONNECT] Error joining thread: {e}")

        self.connection_status = "DISCONNECTED"
        self.status_reason = f"Port {self.port} disconnected and handle released."
        logger.info(f"[SERIAL-DISCONNECT] Port {self.port} disconnected and handle released.")

    def send_command(self, cmd_dict: Dict[str, Any]) -> bool:
        """Send formatted JSON command string to Arduino over USB serial thread-safely."""
        with self._write_lock:
            if not self.serial_conn or not getattr(self.serial_conn, "is_open", False):
                return False
            try:
                line = json.dumps(cmd_dict) + "\n"
                self.serial_conn.write(line.encode("utf-8"))
                try:
                    self.serial_conn.flush()
                except Exception:
                    pass
                return True
            except Exception as e:
                self.last_error = f"Serial write warning: {str(e)}"
                logger.warning(f"[SERIAL-CMD] Failed to write command on {self.port}: {e}")
                return False

    def is_stale(self, timeout_seconds: float = 2.5) -> bool:
        """Returns True if connected and waiting or previously receiving, but no telemetry for timeout_seconds."""
        if self.connection_status not in ["CONNECTED_WAITING_FOR_TELEMETRY", "LIVE", "STALE", "CONNECTED", "CONNECTING"]:
            return False
        now = time.time()
        if self.last_valid_frame_time > 0.0:
            return (now - self.last_valid_frame_time) > timeout_seconds
        if self.last_system_time > 0.0:
            return (now - self.last_system_time) > timeout_seconds
        if self.last_connect_time > 0.0:
            return (now - self.last_connect_time) > timeout_seconds
        return False

    def _reader_loop(self):
        """Dedicated background reader loop with line buffering and robust JSON framing."""
        conn = self.serial_conn
        buffer = ""
        consecutive_read_errors = 0
        MAX_TRANSIENT_ERRORS = 10

        while self.is_running and conn and getattr(conn, "is_open", False):
            try:
                try:
                    bytes_to_read = conn.in_waiting or 1
                except Exception:
                    bytes_to_read = 1
                raw_bytes = conn.read(bytes_to_read)
                if not raw_bytes:
                    time.sleep(0.01)
                    continue

                if consecutive_read_errors > 0:
                    logger.info(f"[SERIAL-RECOVERY] Resumed reading on {self.port} after {consecutive_read_errors} transient errors.")
                    consecutive_read_errors = 0

                now = time.time()
                self.bytes_received += len(raw_bytes)
                self.last_byte_time = now
                text = raw_bytes.decode("utf-8", errors="ignore")
                buffer += text

                # Bounded buffer to prevent memory leakage if newlines are missing
                if len(buffer) > 4096:
                    buffer = buffer[-2048:]

                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    if not (line.startswith("{") and line.endswith("}")):
                        # Count incomplete or malformed JSON lines as corrupted
                        if line.startswith("{") or line.endswith("}") or ":" in line:
                            self.corrupted_frames += 1
                            self.consecutive_parse_errors += 1
                            self.last_error = f"Malformed/incomplete frame: {line[:50]}"
                            logger.warning(f"[SERIAL-FRAME] Incomplete line on {self.port}: {line[:60]}")
                        continue

                    try:
                        data = json.loads(line)
                        if "type" in data and data["type"] == "BOOT_READY":
                            fw_str = data.get("firmware", "SC-CAMV")
                            proto_str = data.get("proto", "1.0")
                            logger.info(f"[SERIAL-BOOT] Arduino boot announced on {self.port}: FW {fw_str}, Proto {proto_str}")
                            self.status_reason = f"Arduino boot announced ({fw_str}). Awaiting sensor telemetry."
                            continue

                        # Parse hardware telemetry packet
                        seq_id = int(data.get("seq", self.frames_parsed + 1))
                        ms_val = int(data.get("ms", data.get("time_ms", int(time.time() * 1000))))
                        
                        # ACS712 current readings
                        curr_adc = data.get("curr_raw")
                        curr_v = data.get("curr_v")
                        curr_a = data.get("curr_a", data.get("current"))

                        # MPU6050 vibration & acceleration
                        vibe_g = data.get("vibe_rms", data.get("vibe", 0.0))
                        ax = data.get("ax")
                        ay = data.get("ay")
                        az = data.get("az")
                        gx = data.get("gx")
                        gy = data.get("gy")
                        gz = data.get("gz")

                        # IR stationary obstacle
                        ir_raw = data.get("ir_raw", 1)
                        ir_det = bool(data.get("ir_det", ir_raw == 0))

                        # DHT11 environmental readings
                        amb_t = data.get("amb_t", data.get("amb_temp", data.get("dht_c")))
                        amb_h = data.get("amb_h", data.get("amb_hum", data.get("dht_h")))
                        dht_ok = bool(data.get("dht_ok", amb_t is not None and (0.0 <= amb_t <= 60.0)))

                        # LM35 contact surface readings
                        lm35_c = data.get("lm35_c")
                        lm35_ok = bool(data.get("lm35_ok", lm35_c is not None and (0.0 <= lm35_c <= 120.0)))

                        # Temperature Fusion: LM35 + DHT11 (Section 3)
                        if data.get("temp_c") is not None and data.get("temp_valid") is not None:
                            fused_temp = float(data["temp_c"]) if data.get("temp_valid") else None
                            temp_valid = bool(data.get("temp_valid"))
                            temp_src = str(data.get("temp_src", "FUSED" if (lm35_ok and dht_ok) else ("LM35" if lm35_ok else ("DHT11" if dht_ok else "NONE"))))
                        else:
                            # 4-case temperature fusion
                            if lm35_ok and dht_ok:
                                fused_temp = round((float(lm35_c) + float(amb_t)) / 2.0, 2)
                                temp_valid = True
                                temp_src = "FUSED"
                            elif lm35_ok:
                                fused_temp = round(float(lm35_c), 2)
                                temp_valid = True
                                temp_src = "LM35"
                            elif dht_ok:
                                fused_temp = round(float(amb_t), 2)
                                temp_valid = True
                                temp_src = "DHT11"
                            else:
                                fused_temp = None
                                temp_valid = False
                                temp_src = "NONE"

                        # Motor actuation feedback
                        pwm_val = int(data.get("pwm", 0))
                        motor_str = str(data.get("motor", "STOPPED")).upper()
                        if motor_str == "RUNNING":
                            cmd_state = MotorState.RUNNING
                        elif motor_str == "STARTING":
                            cmd_state = MotorState.STARTING
                        elif motor_str == "FAULT":
                            cmd_state = MotorState.FAULT
                        else:
                            cmd_state = MotorState.STOPPED

                        # Inferred physical state: Requires actual current or vibration evidence
                        if curr_a is not None and curr_a > 0.15 and (vibe_g is not None and vibe_g > 0.03):
                            inf_state = MotorState.RUNNING
                        elif pwm_val == 0 and (vibe_g is None or vibe_g < 0.035):
                            inf_state = MotorState.STOPPED
                        else:
                            inf_state = MotorState.UNKNOWN

                        frame = RawSensorFrame(
                            sequence_id=seq_id,
                            timestamp_ms=ms_val,
                            current_a=curr_a,
                            current_raw_adc=curr_adc,
                            current_v=curr_v,
                            vibe_g=vibe_g,
                            ax=ax,
                            ay=ay,
                            az=az,
                            gx=gx,
                            gy=gy,
                            gz=gz,
                            ir_object_detected=ir_det,
                            ir_raw_state=ir_raw,
                            amb_temp_c=amb_t,
                            amb_hum_pct=amb_h,
                            lm35_temp_c=lm35_c,
                            fused_temp_c=fused_temp,
                            temp_source=temp_src,
                            temp_valid=temp_valid,
                            motor_pwm=pwm_val,
                            commanded_motor_state=cmd_state,
                            inferred_motor_state=inf_state,
                            source=SensorDataSource.REAL,
                            is_simulated=False,
                            sensor_statuses={
                                "acs712": "OK" if curr_a is not None else "DEGRADED",
                                "mpu6050": "OK" if data.get("mpu_ok", True) else "ERROR",
                                "ir_obstacle": "OK",
                                "dht11": "OK" if dht_ok else "DEGRADED",
                                "lm35": "OK" if lm35_ok else "DEGRADED",
                            }
                        )

                        self.frames_parsed += 1
                        self.last_sequence_id = seq_id
                        self.last_frame_time_ms = ms_val
                        now_frame = time.time()
                        self.last_valid_frame_time = now_frame
                        self.last_system_time = now_frame
                        self.consecutive_parse_errors = 0

                        if self.connection_status != "LIVE":
                            self.connection_status = "LIVE"
                            self.status_reason = f"Receiving live telemetry on {self.port} (seq #{seq_id})."
                            logger.info(f"[SERIAL-LIVE] Telemetry stream active on {self.port} (seq={seq_id}, frames={self.frames_parsed}). Dashboard LIVE.")

                        if not self.frame_queue.full():
                            self.frame_queue.put(frame)

                        for cb in self.on_frame_callbacks:
                            try:
                                cb(frame)
                            except Exception as ex:
                                logger.error(f"[SERIAL-CALLBACK] Callback error: {ex}")

                    except Exception as parse_err:
                        self.corrupted_frames += 1
                        self.consecutive_parse_errors += 1
                        self.last_error = f"Malformed/corrupted frame: {parse_err}"
                        logger.warning(f"[SERIAL-FRAME] Dropped corrupted frame on {self.port}: {parse_err} | line: {line[:70]}")

            except (serial.SerialException, PermissionError, OSError) as se:
                if not self.is_running:
                    break
                consecutive_read_errors += 1
                self.consecutive_read_errors = consecutive_read_errors
                if consecutive_read_errors <= MAX_TRANSIENT_ERRORS:
                    logger.warning(
                        f"[SERIAL-ERROR] Transient read error on {self.port} ({consecutive_read_errors}/{MAX_TRANSIENT_ERRORS}): {se}"
                    )
                    time.sleep(0.05)
                    continue
                else:
                    self.connection_status = "DISCONNECTED"
                    self.last_error = f"Serial port {self.port} disconnected (unresponsive after {consecutive_read_errors} attempts): {se}"
                    self.status_reason = self.last_error
                    logger.error(f"[SERIAL-ERROR] Fatal serial error on {self.port}: {self.last_error}")
                    break
            except Exception as e:
                if not self.is_running:
                    break
                logger.warning(f"[SERIAL-ERROR] Unexpected reader loop error on {self.port}: {e}")
                time.sleep(0.05)
                continue

        # Worker thread clean exit: close its local conn reference without touching self.serial_conn
        try:
            if conn and getattr(conn, "is_open", False):
                conn.close()
        except Exception:
            pass
        with self._lock:
            if not self.is_running or self.serial_conn is None or self.serial_conn == conn:
                self.is_running = False
                self.serial_conn = None
                if self.connection_status not in ["ERROR", "DISCONNECTED"]:
                    self.connection_status = "DISCONNECTED"
                logger.info(f"[SERIAL-DISCONNECT] Serial reader thread for {self.port} cleanly exited.")

    def get_status(self) -> Dict[str, Any]:
        """Query connection status, packet counts, transport type, and freshness with thread watchdog check."""
        now = time.time()
        port_open = bool(self.serial_conn and getattr(self.serial_conn, "is_open", False))
        reader_alive = bool(self.thread and self.thread.is_alive())

        # Watchdog: Check if reader thread died unexpectedly while is_running is True
        if self.is_running and port_open and self.thread is not None and not reader_alive:
            if self.reconnect_attempts < self.max_watchdog_restarts:
                self.reconnect_attempts += 1
                self.connection_status = "RECONNECTING"
                self.status_reason = f"Reader thread exited unexpectedly. Watchdog restarting reader (attempt {self.reconnect_attempts}/{self.max_watchdog_restarts})..."
                logger.warning(f"[SERIAL-WATCHDOG] {self.status_reason}")
                self.thread = threading.Thread(target=self._reader_loop, daemon=True)
                self.thread.start()
                reader_alive = True
            else:
                self.connection_status = "ERROR"
                self.last_error = "Serial reader thread terminated unexpectedly (max watchdog restarts exceeded)."
                self.status_reason = self.last_error
                self.is_running = False

        stale = self.is_stale()
        if self.connection_status in ["LIVE", "CONNECTED_WAITING_FOR_TELEMETRY", "CONNECTED", "CONNECTING"] and stale:
            effective_status = "STALE"
            if self.last_valid_frame_time > 0:
                frame_age = round(now - self.last_valid_frame_time, 2)
                self.status_reason = f"Stream stale: no valid telemetry frames for {frame_age}s (last seq #{self.last_sequence_id})."
            else:
                conn_age = round(now - self.last_connect_time, 2) if self.last_connect_time > 0 else 0.0
                self.status_reason = f"Stream waiting: port open for {conn_age}s, but no valid telemetry received."
        elif self.connection_status == "STALE" and not stale:
            effective_status = "LIVE"
            self.connection_status = "LIVE"
        else:
            effective_status = self.connection_status

        last_frame_age = round(now - self.last_valid_frame_time, 2) if self.last_valid_frame_time > 0 else (
            round(now - self.last_system_time, 2) if self.last_system_time > 0 else None
        )
        last_byte_age = round(now - self.last_byte_time, 2) if self.last_byte_time > 0 else None

        return {
            "port": self.port,
            "baud_rate": self.baud_rate,
            "status": effective_status,
            "is_live": effective_status == "LIVE",
            "transport_type": self.transport_type,
            "port_open": port_open,
            "reader_alive": reader_alive,
            "last_error": self.last_error,
            "reason": self.status_reason,
            # Dual-keyed for full backend-frontend compatibility
            "bytes_received": self.bytes_received,
            "total_bytes_received": self.bytes_received,
            "frames_parsed": self.frames_parsed,
            "total_frames_parsed": self.frames_parsed,
            "corrupted_frames": self.corrupted_frames,
            "total_corrupted_frames": self.corrupted_frames,
            "last_sequence_id": self.last_sequence_id,
            "last_frame_time_ms": self.last_frame_time_ms,
            "last_frame_age_s": last_frame_age,
            "last_byte_age_s": last_byte_age,
            "consecutive_read_errors": self.consecutive_read_errors,
            "consecutive_parse_errors": self.consecutive_parse_errors,
            "reconnect_attempts": self.reconnect_attempts,
            "is_stale": stale,
        }

serial_manager = SerialHardwareManager()
