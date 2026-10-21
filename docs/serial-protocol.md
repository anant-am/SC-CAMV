# Serial Communication & Telemetry Protocol Specification

## SC-CAMV UART Protocol (Version 1.0)

This document specifies the bidirectional communication protocol between the Arduino UNO R3 (or HC-05 Bluetooth module) and the host PC backend.

---

### 1. Physical Layer Configuration
- **Interface**: Asynchronous Serial (UART via USB CDC or HC-05 Bluetooth SPP)
- **Baud Rate**: 9600 bps
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **Flow Control**: None
- **Frame Delimiter**: ASCII Linefeed (`\n`, `0x0A`) with optional Carriage Return (`\r`, `0x0D`)
- **Transport Identification**: Auto-detected via Windows COM port hardware description (USB vs Bluetooth)

---

### 2. Upstream Telemetry Frame (Arduino UNO $\to$ Host Backend)

The embedded firmware broadcasts a newline-delimited JSON string every **200 ms (5 Hz)**.

#### Sample Telemetry Frame:
```json
{"seq":105,"ms":21000,"curr_raw":514,"curr_v":2.512,"curr_a":0.061,"ax":0.02,"ay":-0.01,"az":-1.01,"gx":0.4,"gy":-0.2,"gz":0.1,"vibe_rms":0.018,"mpu_ok":true,"ir_raw":1,"ir_det":false,"amb_t":26.5,"amb_h":65.0,"dht_ok":true,"pwm":100,"motor":"RUNNING","st":"NORMAL"}
```

#### Field Schema Definitions:
| Field | Type | Description | Plausible Units / Range |
|---|---|---|---|
| `seq` | `uint32` | Monotonically increasing sequence ID | `0` to `4,294,967,295` |
| `ms` | `uint32` | Microcontroller elapsed time via `millis()` | `0` to rollover (~49.7 days) |
| `curr_raw` | `uint16` | Raw 10-bit ADC reading from ACS712 on pin A1 | `0` to `1023` (nominally ~514 at 0A) |
| `curr_v` | `float` | Output voltage from ACS712 | `0.000` to `5.000 V` |
| `curr_a` | `float \| null` | Calibrated armature current | `0.000` to `5.000 A` (`null` if out-of-bounds/uncalibrated) |
| `ax, ay, az` | `float` | 3-axis accelerometer readings in g units | `±2.000 g` (Note: $a_z \approx -1.0\text{g}$ due to upside-down mounting) |
| `gx, gy, gz` | `float` | 3-axis gyroscope angular rate in deg/s | `±250.00 deg/s` (Stationary bias compensated) |
| `vibe_rms` | `float` | Vibration RMS acceleration after gravity subtraction | `0.000` to `4.000 g RMS` |
| `mpu_ok` | `bool` | MPU6050 I²C bus health & WHO_AM_I status | `true` if I²C ACK and WHO_AM_I valid; `false` on bus error |
| `ir_raw` | `uint8` | Raw digital level from IR sensor on pin D2 | `0` (LOW) or `1` (HIGH) |
| `ir_det` | `bool` | Stationary obstacle proximity status | `true` if object detected (Active LOW); `false` if clear |
| `amb_t` | `float \| null` | Ambient room temperature from DHT11 on pin D4 | `0.0` to `55.0 °C` (`null` if checksum error) |
| `amb_h` | `float \| null` | Ambient relative humidity from DHT11 on pin D4 | `15.0` to `95.0 %RH` (`null` if checksum error) |
| `dht_ok` | `bool` | DHT11 40-bit handshake & parity validity | `true` if valid packet; `false` on timeout/checksum mismatch |
| `pwm` | `uint8` | Active confirmed motor driver PWM command | `0` (stopped) to `255` (100% duty) |
| `motor` | `string` | Firmware motor command state | `"STOPPED"`, `"RUNNING"`, `"FAULT"` |
| `st` | `string` | Autonomous embedded safety state | `"STOPPED"`, `"NORMAL"`, `"WARNING"`, `"CRITICAL"` |

---

### 3. Downstream Host Command Protocol (Host Backend $\to$ Arduino UNO)

The host backend sends newline-terminated JSON command objects to control motor actuation or assert safety states.

#### 3.1 Start Motor Command:
```json
{"cmd":"START","pwm":100}
```
- Sets L293D direction pins (IN1=HIGH, IN2=LOW) and applies PWM 100 on pin D10.
- Motor transitions from `STOPPED` to `RUNNING`.

#### 3.2 Stop Motor Command:
```json
{"cmd":"STOP"}
```
- Pulls direction pins LOW and sets PWM to 0. Motor safely coasts to a stop.

#### 3.3 Set PWM Speed Command:
```json
{"cmd":"SET_PWM","pwm":150}
```
- Adjusts active PWM duty cycle on pin D10 (0–255).

#### 3.4 Emergency Stop Command (ESTOP):
```json
{"cmd":"ESTOP"}
```
- Immediately forces PWM to 0, pulls direction lines LOW, illuminates Red LED (D13), and activates alarm buzzer (D6).

#### 3.5 Operator Reset Command:
```json
{"cmd":"RESET"}
```
- Clears the emergency stop lockout latch, restores normal indicator states, and resets motor to safe `STOPPED` state.

#### 3.6 Zero-Current Calibration Command:
```json
{"cmd":"CAL_ACS","val":2.512}
```
- Updates the firmware zero-offset parameter for the ACS712 current calculation.

---

### 4. Robust Framing & Stale-Data Recovery

1. **Partial Frame Recovery**: If a communication drop creates a fragmented line, the backend framing state machine discards incomplete fragments until a complete `{...}\n` frame is verified.
2. **Missing Sensor Representation**: When an analog reading is out of physical bounds (e.g. wire disconnected), the firmware emits JSON `null`. The backend interprets this explicitly as `SENSOR_DEGRADED` rather than an artificial zero measurement.
3. **Stale Telemetry Detection**: If no valid packet is received for $>1500\text{ ms}$, the backend automatically flags connection status as `STALE`, transitions sensor values to last-known-value with age tracking, and marks health decisions accordingly.
