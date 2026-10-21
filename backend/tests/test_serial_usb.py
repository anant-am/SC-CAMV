import pytest
import json
import time
from unittest.mock import MagicMock, patch
import serial

from backend.app.hardware.serial_reader import SerialHardwareManager
from backend.app.schemas.telemetry import RawSensorFrame, MotorState, SensorDataSource
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

class MockSerialPort:
    """Mock serial port for simulating hardware telemetry and error states."""
    def __init__(self, port="COM5", baudrate=9600, **kwargs):
        self.port = port
        self.baudrate = baudrate
        self.is_open = True
        self.written_data = bytearray()
        self.read_buffer = bytearray()
        self.in_waiting_count = 0

    def write(self, data: bytes):
        if not self.is_open:
            raise serial.SerialException("Port closed")
        self.written_data.extend(data)
        return len(data)

    def flush(self):
        pass

    def reset_input_buffer(self):
        self.read_buffer.clear()

    def reset_output_buffer(self):
        self.written_data.clear()

    def read(self, size=1):
        if not self.is_open:
            raise serial.SerialException("Port closed")
        chunk = self.read_buffer[:size]
        self.read_buffer = self.read_buffer[size:]
        return bytes(chunk)

    @property
    def in_waiting(self):
        return len(self.read_buffer)

    def close(self):
        self.is_open = False


def test_serial_port_discovery():
    """Verify dynamic discovery of USB COM ports and Arduino identification."""
    with patch("serial.tools.list_ports.comports") as mock_comports:
        mock_p1 = MagicMock()
        mock_p1.device = "COM5"
        mock_p1.description = "Arduino Uno (COM5)"
        mock_p1.hwid = "USB VID:PID=2341:0043"

        mock_p2 = MagicMock()
        mock_p2.device = "COM3"
        mock_p2.description = "Standard Serial over Bluetooth link (COM3)"
        mock_p2.hwid = "BTHENUM"

        mock_comports.return_value = [mock_p1, mock_p2]

        ports = SerialHardwareManager.list_available_ports()
        assert len(ports) == 2
        # Arduino Uno should be sorted first
        assert ports[0]["port"] == "COM5"
        assert ports[0]["is_arduino"] is True
        assert ports[0]["is_usb"] is True
        assert ports[0]["is_bluetooth"] is False

        assert ports[1]["port"] == "COM3"
        assert ports[1]["is_bluetooth"] is True


def test_serial_connect_and_disconnect_lifecycle():
    """Test connecting, opening background reader, and clean resource disconnect."""
    manager = SerialHardwareManager(port="COM5", baud_rate=9600)
    mock_port = MockSerialPort("COM5", 9600)

    with patch("serial.Serial", return_value=mock_port):
        with patch.object(manager, "list_available_ports", return_value=[{"port": "COM5", "is_arduino": True, "is_bluetooth": False}]):
            assert manager.connect(port="COM5", baud_rate=9600) is True
            assert manager.connection_status in ["CONNECTING", "CONNECTED", "CONNECTED_WAITING_FOR_TELEMETRY"]
            assert manager.is_running is True
            assert manager.thread is not None
            assert manager.thread.is_alive()

            # Disconnect cleanly
            manager.disconnect()
            assert manager.connection_status == "DISCONNECTED"
            assert manager.is_running is False
            assert manager.serial_conn is None


def test_serial_port_already_in_use_error():
    """Verify actionable error detail when Windows returns PermissionError on COM port."""
    manager = SerialHardwareManager(port="COM5", baud_rate=9600)

    with patch("serial.Serial", side_effect=PermissionError(13, "Access is denied.")):
        with patch.object(manager, "list_available_ports", return_value=[{"port": "COM5", "is_arduino": True, "is_bluetooth": False}]):
            success = manager.connect("COM5", 9600)
            assert success is False
            assert manager.connection_status == "ERROR"
            assert "Access denied" in manager.last_error
            assert "Serial Monitor" in manager.last_error


def test_serial_port_not_found():
    """Verify validation when requested COM port does not exist."""
    manager = SerialHardwareManager(port="COM99", baud_rate=9600)
    with patch.object(manager, "list_available_ports", return_value=[{"port": "COM5", "is_arduino": True, "is_bluetooth": False}]):
        success = manager.connect("COM99", 9600)
        assert success is False
        assert manager.connection_status == "ERROR"
        assert "not found" in manager.last_error


def test_command_encoding_and_newline_termination():
    """Verify outgoing commands are JSON formatted with newline termination."""
    manager = SerialHardwareManager(port="COM5", baud_rate=9600)
    mock_port = MockSerialPort("COM5", 9600)
    manager.serial_conn = mock_port

    cmd = {"cmd": "START", "pwm": 150}
    res = manager.send_command(cmd)
    assert res is True

    written_str = mock_port.written_data.decode("utf-8")
    assert written_str.endswith("\n")
    parsed_written = json.loads(written_str.strip())
    assert parsed_written == cmd


def test_telemetry_stream_parsing_and_metrics():
    """Verify full packet parsing, partial frame handling, corrupted frame counting, and metric tracking."""
    manager = SerialHardwareManager(port="COM5", baud_rate=9600)
    mock_port = MockSerialPort("COM5", 9600)
    manager.serial_conn = mock_port

    frames_received = []
    manager.on_frame_callbacks.append(lambda f: frames_received.append(f))

    # Send Boot frame + valid telemetry frame + malformed frame + partial frame split
    boot_line = '{"type":"BOOT_READY","firmware":"SC-CAMV_v1.0","proto":"1.0","motor":"STOPPED","pwm":0}\n'
    valid_frame = '{"seq":101,"ms":20500,"curr_raw":514,"curr_v":2.512,"curr_a":0.085,"ax":0.01,"ay":-0.02,"az":-1.02,"gx":0.1,"gy":-0.1,"gz":0.0,"vibe_rms":0.025,"mpu_ok":true,"ir_raw":1,"ir_det":false,"amb_t":25.4,"amb_h":58.0,"dht_ok":true,"pwm":0,"motor":"STOPPED","st":"NORMAL"}\n'
    malformed_line = '{"seq":102,"curr_raw":invalid_json\n'
    partial_part1 = '{"seq":103,"ms":20700,"curr_raw":515,'
    partial_part2 = '"curr_v":2.515,"curr_a":0.11,"ax":0.0,"ay":0.0,"az":-1.0,"gx":0.0,"gy":0.0,"gz":0.0,"vibe_rms":0.03,"mpu_ok":true,"ir_raw":1,"ir_det":false,"amb_t":25.5,"amb_h":58.0,"dht_ok":true,"pwm":0,"motor":"STOPPED","st":"NORMAL"}\n'

    # Feed bytes sequentially
    mock_port.read_buffer.extend(boot_line.encode("utf-8"))
    mock_port.read_buffer.extend(valid_frame.encode("utf-8"))
    mock_port.read_buffer.extend(malformed_line.encode("utf-8"))
    mock_port.read_buffer.extend(partial_part1.encode("utf-8"))

    manager.is_running = True
    reader_thread = manager._reader_loop

    # Run reader step in background thread briefly
    import threading
    t = threading.Thread(target=reader_thread, daemon=True)
    manager.thread = t
    t.start()
    time.sleep(0.08)

    # Deliver partial part 2
    mock_port.read_buffer.extend(partial_part2.encode("utf-8"))
    time.sleep(0.08)

    status_live = manager.get_status()
    assert status_live["status"] == "LIVE"
    assert status_live["is_live"] is True

    manager.is_running = False
    mock_port.is_open = False
    t.join(timeout=0.5)

    status = manager.get_status()
    assert status["frames_parsed"] >= 2
    assert status["total_frames_parsed"] >= 2
    assert status["last_sequence_id"] == 103
    assert status["corrupted_frames"] >= 1

    assert len(frames_received) >= 2
    f1 = frames_received[0]
    assert f1.sequence_id == 101
    assert f1.current_a == 0.085
    assert f1.az == -1.02
    assert f1.ir_object_detected is False
    assert f1.source == SensorDataSource.REAL


def test_stale_telemetry_detection():
    """Verify is_stale returns True when frames stop arriving after timeout."""
    manager = SerialHardwareManager(port="COM5", baud_rate=9600)
    manager.connection_status = "LIVE"
    manager.last_system_time = time.time() - 3.5  # 3.5 seconds ago

    assert manager.is_stale(timeout_seconds=2.5) is True
    status = manager.get_status()
    assert status["status"] == "STALE"
    assert status["is_stale"] is True


def test_hardware_api_endpoints():
    """Verify REST API contracts for port discovery, status, connect, and disconnect."""
    # 1. Ports endpoint
    res = client.get("/api/v1/hardware/ports")
    assert res.status_code == 200
    data = res.json()
    assert "ports" in data
    assert "status" in data

    # 2. Status endpoint
    res = client.get("/api/v1/hardware/status")
    assert res.status_code == 200
    data = res.json()
    assert "engine_mode" in data
    assert "serial" in data
    assert "frames_parsed" in data["serial"]
    assert "total_frames_parsed" in data["serial"]
    assert "last_sequence_id" in data["serial"]

    # 3. Disconnect endpoint
    res = client.post("/api/v1/hardware/disconnect")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "DISCONNECTED"
    assert data["fallback_mode"] == "SIMULATION"

    # 4. Connect endpoint failure handling (e.g. invalid port)
    res = client.post("/api/v1/hardware/connect", json={"port": "INVALID_PORT_XYZ", "baud_rate": 9600})
    assert res.status_code == 503
    data = res.json()
    assert "detail" in data
    assert "not found" in data["detail"].lower() or "could not open" in data["detail"].lower()


def test_transient_clearcommerror_does_not_kill_reader_loop():
    """Verify that transient Windows ClearCommError / PermissionError does not kill reader loop."""
    import threading
    manager = SerialHardwareManager(port="COM5", baud_rate=9600)
    mock_port = MockSerialPort("COM5", 9600)
    manager.serial_conn = mock_port

    # Inject a transient ClearCommError on the first read call, followed by valid frame
    read_count = 0
    orig_read = mock_port.read

    def transient_flaky_read(size=1):
        nonlocal read_count
        read_count += 1
        if read_count == 1:
            raise serial.SerialException("ClearCommError failed (PermissionError(13, 'The device does not recognize the command.', None, 22))")
        return orig_read(size)

    mock_port.read = transient_flaky_read

    valid_frame = '{"seq":201,"ms":5000,"curr_raw":512,"curr_v":2.5,"curr_a":0.0,"ax":0.0,"ay":0.0,"az":-1.0,"gx":0.0,"gy":0.0,"gz":0.0,"vibe_rms":0.0,"mpu_ok":true,"ir_raw":1,"ir_det":false,"amb_t":25.0,"amb_h":50.0,"dht_ok":true,"pwm":0,"motor":"STOPPED","st":"NORMAL"}\n'
    mock_port.read_buffer.extend(valid_frame.encode("utf-8"))

    manager.is_running = True
    t = threading.Thread(target=manager._reader_loop, daemon=True)
    t.start()
    time.sleep(0.15)

    manager.is_running = False
    mock_port.is_open = False
    t.join(timeout=0.5)

    status = manager.get_status()
    # The reader survived the transient ClearCommError and successfully parsed the frame
    assert status["frames_parsed"] >= 1
    assert status["last_sequence_id"] == 201


def test_live_hardware_stale_mode_preserves_real_provenance():
    """Verify that in LIVE_HARDWARE mode, stale telemetry retains REAL provenance and is not overwritten with FALLBACK."""
    from backend.app.core.engine import engine
    from backend.app.hardware.serial_reader import serial_manager

    engine.mode = "LIVE_HARDWARE"
    # Seed latest_frame with genuine hardware frame
    engine.latest_frame = RawSensorFrame(
        sequence_id=500,
        timestamp_ms=12345,
        source=SensorDataSource.REAL,
        is_simulated=False,
        sensor_statuses={"acs712": "OK", "mpu6050": "OK", "ir_obstacle": "OK", "dht11": "OK"}
    )

    # Simulate stale condition
    serial_manager.connection_status = "LIVE"
    serial_manager.last_system_time = time.time() - 4.0  # 4 seconds ago

    assert serial_manager.is_stale(timeout_seconds=2.5) is True

    # Check status
    st = serial_manager.get_status()
    assert st["status"] == "STALE"
    assert st["is_stale"] is True

    # Telemetry frame source must strictly remain REAL
    assert engine.latest_frame.source == SensorDataSource.REAL


def test_port_opens_waiting_for_telemetry_state():
    """Verify that port opening transitions to CONNECTED_WAITING_FOR_TELEMETRY, not LIVE."""
    manager = SerialHardwareManager(port="COM5", baud_rate=9600)
    mock_port = MockSerialPort("COM5", 9600)
    with patch("serial.Serial", return_value=mock_port):
        with patch.object(manager, "list_available_ports", return_value=[{"port": "COM5", "is_arduino": True, "is_bluetooth": False}]):
            assert manager.connect("COM5", 9600) is True
            assert manager.connection_status == "CONNECTED_WAITING_FOR_TELEMETRY"
            st = manager.get_status()
            assert st["status"] == "CONNECTED_WAITING_FOR_TELEMETRY"
            assert st["is_live"] is False
            assert st["frames_parsed"] == 0
            manager.disconnect()


def test_boot_ready_does_not_advance_frames_or_mark_live():
    """Verify that BOOT_READY frames update byte time and status_reason without marking LIVE."""
    manager = SerialHardwareManager(port="COM5", baud_rate=9600)
    mock_port = MockSerialPort("COM5", 9600)
    manager.serial_conn = mock_port
    manager.is_running = True
    manager.connection_status = "CONNECTED_WAITING_FOR_TELEMETRY"

    boot_line = '{"type":"BOOT_READY","firmware":"SC-CAMV_v1.0","proto":"1.0","motor":"STOPPED","pwm":0}\n'
    mock_port.read_buffer.extend(boot_line.encode("utf-8"))

    import threading
    t = threading.Thread(target=manager._reader_loop, daemon=True)
    manager.thread = t
    t.start()
    time.sleep(0.08)

    st = manager.get_status()
    assert st["frames_parsed"] == 0
    assert st["is_live"] is False
    assert "boot announced" in manager.status_reason.lower()

    manager.is_running = False
    mock_port.is_open = False
    t.join(timeout=0.5)


def test_telemetry_resumes_after_stale_switches_back_to_live():
    """Verify stream switches from STALE back to LIVE only after receiving real valid telemetry."""
    manager = SerialHardwareManager(port="COM5", baud_rate=9600)
    mock_port = MockSerialPort("COM5", 9600)
    manager.serial_conn = mock_port
    manager.is_running = True
    manager.connection_status = "LIVE"
    manager.last_valid_frame_time = time.time() - 5.0  # 5s in past -> STALE

    assert manager.is_stale(timeout_seconds=2.5) is True
    st_stale = manager.get_status()
    assert st_stale["status"] == "STALE"
    assert st_stale["is_live"] is False

    # Now deliver valid frame
    new_frame = '{"seq":625,"ms":35000,"curr_raw":512,"curr_v":2.5,"curr_a":0.15,"ax":0.0,"ay":0.0,"az":-1.0,"gx":0.0,"gy":0.0,"gz":0.0,"vibe_rms":0.02,"mpu_ok":true,"ir_raw":1,"ir_det":false,"amb_t":26.0,"amb_h":55.0,"dht_ok":true,"pwm":100,"motor":"RUNNING","st":"NORMAL"}\n'
    mock_port.read_buffer.extend(new_frame.encode("utf-8"))

    import threading
    t = threading.Thread(target=manager._reader_loop, daemon=True)
    manager.thread = t
    t.start()
    time.sleep(0.08)

    st_live = manager.get_status()
    assert st_live["status"] == "LIVE"
    assert st_live["is_live"] is True
    assert st_live["last_sequence_id"] == 625

    manager.is_running = False
    mock_port.is_open = False
    t.join(timeout=0.5)


def test_idempotent_connection_no_duplicate_readers():
    """Verify multiple connect calls on an active port reuse existing connection without spawning duplicate threads."""
    manager = SerialHardwareManager(port="COM5", baud_rate=9600)
    mock_port = MockSerialPort("COM5", 9600)
    with patch("serial.Serial", return_value=mock_port):
        with patch.object(manager, "list_available_ports", return_value=[{"port": "COM5", "is_arduino": True, "is_bluetooth": False}]):
            assert manager.connect("COM5", 9600) is True
            orig_thread = manager.thread
            # Connect again with same port
            assert manager.connect("COM5", 9600) is True
            assert manager.thread == orig_thread
            manager.disconnect()


def test_reader_watchdog_detects_and_restarts_dead_thread():
    """Verify watchdog detects unexpectedly terminated thread and restarts it."""
    manager = SerialHardwareManager(port="COM5", baud_rate=9600)
    mock_port = MockSerialPort("COM5", 9600)
    manager.serial_conn = mock_port
    manager.is_running = True
    manager.connection_status = "LIVE"

    # Simulate a dead thread
    import threading
    dead_thread = threading.Thread(target=lambda: None)
    dead_thread.start()
    dead_thread.join()
    manager.thread = dead_thread
    assert not dead_thread.is_alive()

    # get_status triggers watchdog recovery
    st = manager.get_status()
    assert manager.reconnect_attempts == 1
    assert manager.thread != dead_thread
    assert manager.thread.is_alive()
    manager.disconnect()


