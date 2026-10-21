import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "HEALTHY"
    assert "version" in data

def test_telemetry_latest_endpoint():
    response = client.get("/api/v1/telemetry/latest")
    assert response.status_code == 200
    data = response.json()
    assert "telemetry" in data
    assert "decision" in data
    assert "active_pwm" in data

def test_motor_controls_endpoint():
    # Start motor at PWM 100
    res_start = client.post("/api/v1/motor/start", json={"pwm": 100})
    assert res_start.status_code == 200
    assert res_start.json()["active_pwm"] == 100
    assert res_start.json()["commanded_state"] == "RUNNING"

    # Adjust PWM to 150
    res_pwm = client.post("/api/v1/motor/pwm", json={"pwm": 150})
    assert res_pwm.status_code == 200
    assert res_pwm.json()["active_pwm"] == 150

    # Emergency stop
    res_estop = client.post("/api/v1/motor/estop")
    assert res_estop.status_code == 200
    assert res_estop.json()["active_pwm"] == 0
    assert res_estop.json()["commanded_state"] == "STOPPED"

    # Reset
    res_reset = client.post("/api/v1/motor/reset")
    assert res_reset.status_code == 200
    assert res_reset.json()["commanded_state"] == "STOPPED"

def test_fault_injection_endpoints():
    # List all 17 supported faults
    res_list = client.get("/api/v1/faults")
    assert res_list.status_code == 200
    data = res_list.json()
    assert len(data["faults"]) == 17
    assert "active_faults" in data

    # Verify /api/v1/faults/active polling endpoint
    res_active = client.get("/api/v1/faults/active")
    assert res_active.status_code == 200
    assert "active_faults" in res_active.json()

    # Inject ACS712 disconnection
    res_inj = client.post("/api/v1/faults/inject", json={"fault_key": "acs712_disconnected", "value": None})
    assert res_inj.status_code == 200
    assert res_inj.json()["is_active"] is True

    # Inject using frontend alias (ir_obstacle_detected)
    res_ir = client.post("/api/v1/faults/inject", json={"fault_key": "ir_obstacle_detected"})
    assert res_ir.status_code == 200
    assert "ir_obstacle_detected" in client.get("/api/v1/faults/active").json()["active_faults"]

    # Clear ACS712 disconnection
    res_clr = client.post("/api/v1/faults/clear", json={"fault_key": "acs712_disconnected"})
    assert res_clr.status_code == 200
    assert res_clr.json()["is_active"] is False

    # Inject recovery_after_fault scenario
    res_rec = client.post("/api/v1/faults/inject", json={"fault_key": "recovery_after_fault"})
    assert res_rec.status_code == 200

    # Clear all faults
    res_all = client.post("/api/v1/faults/clear-all")
    assert res_all.status_code == 200
    assert len(client.get("/api/v1/faults/active").json()["active_faults"]) == 0

def test_calibration_endpoints():
    # Query current calibration status
    res_cur = client.get("/api/v1/calibration/current")
    assert res_cur.status_code == 200
    assert "is_calibrated" in res_cur.json()

    # Stop motor and calibrate ACS712 zero offset
    client.post("/api/v1/motor/stop")
    res_acs = client.post("/api/v1/calibration/acs712", json={"sensitivity_mv_per_a": 66.0})
    assert res_acs.status_code == 200
    assert res_acs.json()["sensor"] == "ACS712"
    assert "zero_current_adc" in res_acs.json()

    # Calibrate MPU6050
    res_mpu = client.post("/api/v1/calibration/mpu6050", json={"upside_down": True})
    assert res_mpu.status_code == 200
    assert res_mpu.json()["sensor"] == "MPU6050"
    assert res_mpu.json()["upside_down_mounting"] is True

def test_scenarios_endpoints():
    res_list = client.get("/api/v1/scenarios")
    assert res_list.status_code == 200
    data = res_list.json()
    assert len(data["scenarios"]) == 11

    res_run = client.post("/api/v1/scenarios/run", json={"scenario_key": "mechanical_overload"})
    assert res_run.status_code == 200
    assert res_run.json()["status"] == "RUNNING"

def test_algorithm_endpoints():
    res_info = client.get("/api/v1/algorithm/info")
    assert res_info.status_code == 200
    data = res_info.json()
    assert data["active_algorithm"] in ["SC-CAMV", "FIXED_THRESHOLD", "NAIVE_MULTIFACTOR"]

    res_select = client.post("/api/v1/algorithm/select", json={"algorithm_name": "FIXED_THRESHOLD"})
    assert res_select.status_code == 200
    assert res_select.json()["active_algorithm"] == "FIXED_THRESHOLD"

    client.post("/api/v1/algorithm/select", json={"algorithm_name": "SC-CAMV"})

def test_hardware_ports_endpoint():
    response = client.get("/api/v1/hardware/ports")
    assert response.status_code == 200
    data = response.json()
    assert "ports" in data
    assert isinstance(data["ports"], list)

def test_evaluation_benchmark_endpoint():
    response = client.get("/api/v1/evaluation/benchmark")
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert "SC-CAMV (Proposed GC-PWCE)" in data["results"]
    assert "Fixed Threshold" in data["results"]

def test_events_endpoint():
    response = client.get("/api/v1/events?limit=20")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert "events" in data

def test_export_endpoints():
    res_tel = client.get("/api/v1/export/telemetry.csv")
    assert res_tel.status_code == 200
    assert "text/csv" in res_tel.headers["content-type"]

    res_dec = client.get("/api/v1/export/decisions.csv")
    assert res_dec.status_code == 200
    assert "text/csv" in res_dec.headers["content-type"]

    res_evt = client.get("/api/v1/export/events.csv")
    assert res_evt.status_code == 200
    assert "text/csv" in res_evt.headers["content-type"]
