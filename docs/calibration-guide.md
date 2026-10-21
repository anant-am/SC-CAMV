# SC-CAMV Sensor Calibration and Uncertainty Guide

## 1. Overview & Honest Engineering Disclaimers

The SC-CAMV framework prioritizes honest instrumentation:
- Low-cost educational sensors (ACS712, MPU6050, DHT11) possess inherent analog noise, thermal drift, and quantization errors.
- Never claim laboratory-grade or certified precision without NIST-traceable calibrated test equipment.
- Calibration establishes operating baselines and zero-offsets for anomaly detection relative to steady-state normal conditions.

---

## 2. ACS712 Current Sensor Calibration

### 2.1 Theoretical Operating Principle
- The ACS712 Hall-effect current sensor outputs an analog voltage centered at $V_{CC} / 2$ (nominally 2.500 V) at zero current.
- Sensitivity is nominally:
  - 30A module: $66\text{ mV / A}$ ($0.066\text{ V/A}$)
  - 20A module: $100\text{ mV / A}$ ($0.100\text{ V/A}$)
  - 5A module: $185\text{ mV / A}$ ($0.185\text{ V/A}$)
- The motor armature current is calculated as:
  $$I = \frac{V_{out} - V_{zero}}{S}$$

### 2.2 Mandatory Calibration Protocol
1. **Safety Precondition:** The DC motor MUST be completely de-energized and stationary ($I = 0.00\text{ A}$). Never calibrate while the motor is running.
2. **Sample Acquisition:** The system oversamples the analog input pin (A1) across 200 consecutive readings over a 1.0-second period.
3. **Offset Calculation:**
   $$V_{zero} = \frac{1}{N} \sum_{i=1}^N V_{A1, i}$$
   $$\sigma_{noise} = \sqrt{\frac{1}{N-1} \sum_{i=1}^N (V_{A1, i} - V_{zero})^2}$$
4. **Validation Check:**
   - If $V_{zero} < 2.30\text{ V}$ or $V_{zero} > 2.70\text{ V}$, the sensor is unpowered, floating, or damaged. Calibration is rejected.
   - If $\sigma_{noise} > 0.05\text{ V}$, excessive electrical coupling is present. Calibration is rejected.
5. **State Transition:** Upon acceptance, the calibration metadata is persisted to the SQLite database and transmitted to firmware (`CMD_CAL_ACS`).

---

## 3. MPU6050 Motion Sensor & Upside-Down Gravity Alignment

### 3.1 Mechanical Mounting Context
- The MPU6050 is mounted **upside down** on the motor housing bracket.
- In this fixed physical orientation:
  - When stationary, the Earth's gravity vector points in the $-Z$ direction: $a_z \approx -1.0\text{ g}$.
  - $a_x \approx 0.0\text{ g}$ and $a_y \approx 0.0\text{ g}$.

### 3.2 Calibration Workflow
1. **Stationary Precondition:** The motor must be at rest with no vibration present.
2. **Gyroscope Bias Neutralization:**
   - Acquire 100 samples of raw $g_x, g_y, g_z$.
   - Calculate zero-rate biases: $b_{gx}, b_{gy}, b_{gz}$.
   - Subtract these biases from all subsequent gyro samples.
3. **Gravity Vector Alignment:**
   - Confirm measured total magnitude $|a| = \sqrt{a_x^2 + a_y^2 + a_z^2} \approx 1.0\text{ g} \pm 0.08\text{ g}$.
   - Confirm $a_z < -0.80\text{ g}$ (verifying upside-down orientation).
4. **Vibration Metric Derivation:**
   - Vibration RMS isolates dynamic oscillations by subtracting the static gravity vector:
     $$\text{Vibration RMS} = |\sqrt{a_x^2 + a_y^2 + a_z^2} - 1.0\text{ g}|$$

---

## 4. IR Stationary Obstacle Sensor Verification

1. **Polarity Configuration:**
   - Default: Active LOW (photodiode blocked pulls signal LOW).
   - Test Clear State: With no obstruction in front of the sensor, pin D2 reads `HIGH` (Raw = 1, Detected = false).
   - Test Obstructed State: Place a card or hand 3 cm from the sensor; pin D2 reads `LOW` (Raw = 0, Detected = true).
2. **Diagnostics:**
   - If the pin remains permanently LOW, a stuck-LOW fault or short circuit is diagnosed.
   - If the pin never transitions LOW when an object is presented, a stuck-HIGH or open-circuit fault is diagnosed.

---

## 5. DHT11 Environmental Context Sensor Verification

1. **Sample Pacing:**
   - The DHT11 requires a minimum recovery time of **1.0 to 1.5 seconds** between readings.
   - Firmware paces requests at 1500 ms intervals.
2. **Plausibility Bounds:**
   - Ambient Temperature: $0.0^\circ\text{C} \le T \le 55.0^\circ\text{C}$.
   - Relative Humidity: $15\% \le RH \le 95\%$.
   - Checksum validation: 40-bit transmission must satisfy byte checksum parity.
