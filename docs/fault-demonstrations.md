# SC-CAMV Fault Demonstration and Verification Guide

## 1. Fault Injection Philosophy

The SC-CAMV Fault Injection Lab provides 17 safe, reversible software-injected fault scenarios:
- **No Physical Destruction:** Never requires seizing the physical motor shaft with bare hands or short-circuiting power lines.
- **Explicit Provenance:** All simulated faults are clearly marked with `source: SIMULATED` and visual badges in the UI.
- **Deterministic Evaluation:** Every scenario allows objective comparison between fixed-threshold monitoring and SC-CAMV's contradiction-aware adaptive framework.

---

## 2. Directory of 17 Supported Fault Conditions

| ID | Fault Name | Category | Injected Condition | Expected System Response |
|---|---|---|---|---|
| 1 | `acs712_disconnect` | ACS712 | Floating ADC (0 or 1023) | Current marked `DISCONNECTED`; confidence reduced; degraded mode. |
| 2 | `acs712_noisy` | ACS712 | Gaussian spikes $\pm 0.45\text{ A}$ | Leaky persistence accumulator dampens noise; zero false alarm trips. |
| 3 | `acs712_out_of_range` | ACS712 | Constant surge $3.85\text{ A}$ | Immediate overcurrent warning; derate or protective trip asserted. |
| 4 | `mpu6050_disconnect` | MPU6050 | I²C NACK / missing WHO_AM_I | MPU marked `ERROR`; baseline updates freeze; system alerts operator. |
| 5 | `excessive_vibration` | MPU6050 | Vibration RMS surges to $1.85\text{ g}$ | Persistent elevated Z-score triggers warning state and derate. |
| 6 | `mpu6050_noisy` | MPU6050 | Random accelerometer bitflips | Outlier gating rejects jerks; prevents baseline parameter contamination. |
| 7 | `ir_obstacle_detected` | IR Sensor | Pin D2 pulled LOW | Stationary obstacle alert; proximity warning shown on dashboard. |
| 8 | `ir_stuck_low` | IR Sensor | Permanent LOW logic level | Sensor failure diagnosed; persistent proximity alarm. |
| 9 | `ir_stuck_high` | IR Sensor | Permanent HIGH logic level | Blinded sensor diagnosed during testing. |
| 10 | `dht11_disconnect` | DHT11 | Handshake timeout | Ambient context marked `DEGRADED`; conservative thresholds applied. |
| 11 | `dht11_invalid` | DHT11 | Corrupted checksum bytes | Parity filter drops packet; last known valid room context retained. |
| 12 | `serial_timeout` | COMMS | Buffer stalled $>1.5\text{ s}$ | Telemetry age counter increments; connection flagged `STALE`. |
| 13 | `bluetooth_disconnect` | COMMS | RF link severed | Transport status drops to `DISCONNECTED`; safe idle maintained. |
| 14 | `malformed_telemetry` | COMMS | Incomplete JSON lines | Framing parser drops fragment, increments corrupted frame counter. |
| 15 | `stale_readings` | COMMS | Frozen sequence number | Stale detector flags frozen readings after 1000 ms. |
| 16 | `multiple_simultaneous_faults` | SYSTEM | ACS712 loss + MPU6050 bus drop | Pairwise Contradiction Matrix detects dual failure; locks to safe state. |
| 17 | `recovery_after_fault` | SYSTEM | Clears all faults | Monitors consecutive valid samples; confidence steadily restores. |

---

## 3. Step-by-Step Live Demonstration Script

For a university review or live hardware presentation, execute this 8-step script:

### Step 1: Safe Power-Up & Dashboard Verification
1. Launch the backend:
   ```powershell
   python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
   ```
2. Launch the frontend:
   ```powershell
   cd frontend
   npm run dev
   ```
3. Open `http://localhost:5173`.
4. Observe the Overview page:
   - System state starts in `NORMAL` (or `STOPPED`).
   - Commanded PWM displays `0` (Safe Stopped Startup).
   - Motor status reads `STOPPED`.

### Step 2: Establish Serial or Simulation Telemetry
1. In the sidebar, select **System Diagnostics**.
2. Select your Arduino COM port (e.g., `COM3`) at `9600` baud.
3. Click **Connect to Serial Port**.
4. Observe live packet reception: frames counter incrementing at 5 Hz.

### Step 3: Zero-Current and MPU6050 Calibration
1. Navigate to **Calibration**.
2. Verify motor is stationary ($I = 0.00\text{ A}$).
3. Click **Apply ACS712 Calibration** (sets zero-current voltage offset ~2.508V).
4. Click **Apply MPU6050 Orientation Calibration** (confirms upside-down Az ≈ -1.0g).
5. Observe the Dwell Gate progress bar fill to 100% as $H_{min}$ stability passes.

### Step 4: Safe Motor Start at Demonstration PWM 100
1. Return to the **Overview** page.
2. Confirm PWM slider is at **100** (default demonstration setting).
3. Click **Start Motor**.
4. Observe:
   - Commanded state transitions to `RUNNING`.
   - Current reading stabilizes around `0.45 A – 0.55 A`.
   - Vibration RMS registers normal fan rotation (~`0.08 g`).

### Step 5: Test Stationary Obstacle Detection
1. Present a hand or card 3 cm in front of the IR sensor on pin D2.
2. Observe immediate transition on the dashboard:
   - IR Obstacle card changes from green `CLEAR` to red `OBSTACLE DETECTED`.
   - Raw pin state displays `0` (Active LOW).
3. Remove the object: status returns to green `CLEAR`.

### Step 6: Inject Simulated Excessive Vibration
1. Open the **Fault Injection Lab** in the sidebar.
2. Click **Inject Fault** on **Excessive Mechanical Vibration**.
3. Observe:
   - Vibration RMS jumps to `1.85 g`.
   - System state transitions: `NORMAL` $\to$ `WATCH` $\to$ `WARNING`.
   - Leaky persistence accumulator ramps up.
   - Protective action: System recommends `DERATE_PWM_60`.
4. Click **Clear Fault**: observe graceful recovery back to `NORMAL`.

### Step 7: Inject Current Sensor Disconnection & Multi-Fault
1. In the Fault Lab, activate **ACS712 Disconnection**.
2. Notice the current reading transitions to `null` with a `DISCONNECTED` badge.
3. System status changes to `SENSOR_DEGRADED` rather than falsely tripping overcurrent.
4. Activate **MPU6050 I²C Disconnection** simultaneously.
5. Pairwise Contradiction Matrix detects dual sensor failure and forces safe shutdown.

### Step 8: Clear All Faults & Clean Shutdown
1. Click **Clear All Faults**.
2. Click **Stop Motor** on the Overview page.
3. Motor coasts to a stop; PWM returns to 0.
