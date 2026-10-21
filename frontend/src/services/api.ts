const API_BASE = '/api/v1';

/**
 * Robust JSON fetch helper that safely handles:
 * - Empty response bodies (204 or empty string)
 * - Non-200 HTTP statuses by extracting backend error detail
 * - Non-JSON / HTML error pages from proxies
 * - Network timeouts and disconnections
 */
async function safeFetchJson<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (netErr: any) {
    throw new Error(`Network error: ${netErr.message || 'Backend server is not reachable'}`);
  }

  const text = await res.text();
  let data: any = {};

  if (text && text.trim().length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (!res.ok) {
    const errorDetail =
      (data && (data.detail || data.message || data.error)) ||
      res.statusText ||
      `HTTP Error ${res.status}`;
    throw new Error(typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail));
  }

  return data as T;
}

export async function fetchHealth() {
  return safeFetchJson(`${API_BASE}/health`);
}

export async function fetchLatestTelemetry() {
  return safeFetchJson(`${API_BASE}/telemetry/latest`);
}

export async function fetchTelemetryHistory(limit = 100) {
  return safeFetchJson(`${API_BASE}/telemetry/history?limit=${limit}`);
}

export async function fetchAlgorithmInfo() {
  return safeFetchJson(`${API_BASE}/algorithm/info`);
}

export async function selectAlgorithm(name: string) {
  return safeFetchJson(`${API_BASE}/algorithm/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ algorithm_name: name }),
  });
}

export async function resetAlgorithm() {
  return safeFetchJson(`${API_BASE}/algorithm/reset`, { method: 'POST' });
}

export async function resetLockout() {
  return safeFetchJson(`${API_BASE}/algorithm/lockout-reset`, { method: 'POST' });
}

export async function fetchScenarios() {
  return safeFetchJson(`${API_BASE}/scenarios`);
}

export async function runScenario(scenarioKey: string) {
  return safeFetchJson(`${API_BASE}/scenarios/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario_key: scenarioKey }),
  });
}

export async function pauseScenario() {
  return safeFetchJson(`${API_BASE}/scenarios/pause`, { method: 'POST' });
}

export async function resetScenario() {
  return safeFetchJson(`${API_BASE}/scenarios/reset`, { method: 'POST' });
}

export async function setScenarioSpeed(multiplier: number) {
  return safeFetchJson(`${API_BASE}/scenarios/speed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ multiplier }),
  });
}

// -----------------------------------------------------------------------------
// Motor Actuation & Safety Controls
// -----------------------------------------------------------------------------
export async function startMotor(pwm = 150) {
  return safeFetchJson(`${API_BASE}/motor/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pwm }),
  });
}

export async function stopMotor() {
  return safeFetchJson(`${API_BASE}/motor/stop`, { method: 'POST' });
}

export async function setMotorPWM(pwm: number) {
  return safeFetchJson(`${API_BASE}/motor/pwm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pwm }),
  });
}

export async function emergencyStop() {
  return safeFetchJson(`${API_BASE}/motor/estop`, { method: 'POST' });
}

export async function resetMotor() {
  return safeFetchJson(`${API_BASE}/motor/reset`, { method: 'POST' });
}

export async function fetchMotorStatus() {
  return safeFetchJson(`${API_BASE}/motor/status`);
}

// -----------------------------------------------------------------------------
// Fault Injection Lab (17 Reversible Fault Conditions)
// -----------------------------------------------------------------------------
export async function fetchActiveFaults() {
  return safeFetchJson(`${API_BASE}/faults/active`);
}

export async function injectFault(faultKey: string, value: any = null) {
  return safeFetchJson(`${API_BASE}/faults/inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fault_key: faultKey, value }),
  });
}

export async function clearFault(faultKey: string) {
  return safeFetchJson(`${API_BASE}/faults/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fault_key: faultKey }),
  });
}

export async function clearAllFaults() {
  return safeFetchJson(`${API_BASE}/faults/clear-all`, { method: 'POST' });
}

// -----------------------------------------------------------------------------
// Calibration Guided Workflows
// -----------------------------------------------------------------------------
export async function fetchCalibrationCurrent() {
  return safeFetchJson(`${API_BASE}/calibration/current`);
}

export async function calibrateACS712(zeroCurrentV = 2.508, sensitivityVPerA = 0.066) {
  return safeFetchJson(`${API_BASE}/calibration/acs712`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      zero_current_v: zeroCurrentV,
      sensitivity_v_per_a: sensitivityVPerA,
    }),
  });
}

export async function calibrateMPU6050(stationaryGravityZ = -1.0) {
  return safeFetchJson(`${API_BASE}/calibration/mpu6050`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stationary_gravity_z: stationaryGravityZ,
    }),
  });
}

export async function triggerZeroDwell() {
  return safeFetchJson(`${API_BASE}/calibration/trigger-zero-dwell`, { method: 'POST' });
}

export const triggerCalibration = triggerZeroDwell;

export async function resetBaselines() {
  return safeFetchJson(`${API_BASE}/calibration/reset-baselines`, { method: 'POST' });
}

// -----------------------------------------------------------------------------
// Hardware Port Management
// -----------------------------------------------------------------------------
export async function fetchHardwarePorts() {
  return safeFetchJson(`${API_BASE}/hardware/ports`);
}

export async function connectHardware(port: string, baudRate = 9600, transport = 'USB') {
  return safeFetchJson(`${API_BASE}/hardware/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port, baud_rate: baudRate, transport }),
  });
}

export async function disconnectHardware() {
  return safeFetchJson(`${API_BASE}/hardware/disconnect`, { method: 'POST' });
}

export async function setEngineMode(mode: string) {
  return safeFetchJson(`${API_BASE}/hardware/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
}

export async function fetchHardwareStatus() {
  return safeFetchJson(`${API_BASE}/hardware/status`);
}

// -----------------------------------------------------------------------------
// History, Events & Evaluation
// -----------------------------------------------------------------------------
export async function fetchSystemEvents(limit = 100) {
  return safeFetchJson(`${API_BASE}/events/system?limit=${limit}`);
}

export async function fetchBenchmarkReport() {
  return safeFetchJson(`${API_BASE}/evaluation/benchmark`);
}

export async function fetchConfusionMatrix() {
  return safeFetchJson(`${API_BASE}/evaluation/confusion-matrix`);
}
