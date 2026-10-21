# Experimental Validation Protocol (Experiments A through J)

## SC-CAMV System: Controlled Hardware-in-the-Loop & Bench Test Procedures

This document provides standardized, repeatable execution protocols for the 10 core validation experiments described in Section 11 of the master specification.

---

### Experiment A: Healthy Baseline Equilibrium
- **Objective**: Verify that the motor runs at normal steady-state equilibrium without triggering false alarms.
- **Physical Setup**: Motor uncoupled, bench supply at nominal 12.0 V DC.
- **Procedure**:
  1. Set operating mode to `SIMULATION` or `LIVE_HARDWARE`.
  2. Run the `healthy_baseline` scenario for 60 seconds (300 steps).
  3. Observe steady-state measurements: $T_{\text{casing}} \approx 47.0^\circ\text{C}$, $I \approx 1.08\text{ A}$, $\text{RPM} \approx 1360$, $\text{Vibration} \approx 0.08\text{ g}$.
- **Acceptance Criteria**: Risk score $R(t) < 20.0$, state remains strictly `NORMAL`, 0 false alarms.

---

### Experiment B: Isolated Thermal Disturbance
- **Objective**: Test system response when casing temperature rises without corroborating current or vibration increase.
- **Procedure**:
  1. Trigger scenario `gradual_thermal_rise` (injected casing temperature rise up to 58°C).
  2. Verify that evidence persistence $P_{\text{temp}}$ increases.
  3. Check the pairwise interaction: current and vibration remain neutral ($P_{\text{curr}} \approx 0, P_{\text{vibe}} \approx 0$).
- **Acceptance Criteria**: System enters `WARNING` state; triggers proportional derate to PWM 153 (60% duty cycle). System does NOT escalate to catastrophic emergency stop because of lack of corroborating electrical/mechanical evidence.

---

### Experiment C: Mechanical Disturbance (Eccentric Vibration)
- **Objective**: Test response to mechanical rotor unbalance.
- **Procedure**:
  1. Run scenario `eccentric_vibration`.
  2. MPU6050 vibration metric surges from nominal $0.08\text{ g}$ to $0.45\text{ g}$.
- **Acceptance Criteria**: Risk score escalates to `WARNING` ($50 \le R < 70$). System initiates PWM derate to relieve mechanical stress.

---

### Experiment D: Increased Mechanical Load & Stalling
- **Objective**: Test coupled electromechanical evidence ($I \uparrow$ while $\text{RPM} \downarrow$).
- **Procedure**:
  1. Run scenario `mechanical_overload`.
  2. Armature current surges to $2.20\text{ A}$ while shaft speed collapses from $1360\text{ RPM}$ to $350\text{ RPM}$.
- **Acceptance Criteria**: Positive cross-sensor coupling $C(\text{current}, \text{rpm}) = +0.85$ triggers rapid risk escalation ($R \ge 85.0$). State transitions to `CRITICAL` within 1.2 seconds, triggering `EMERGENCY_SHUTDOWN` (PWM 0).

---

### Experiment E: Conflicting Evidence (Ambient Heatwave Contradiction)
- **Objective**: Demonstrate that ambient temperature rise discounts motor casing temperature rise, eliminating false trips.
- **Procedure**:
  1. Run scenario `ambient_heatwave_contradiction`.
  2. Ambient temperature increases from $25^\circ\text{C}$ to $42^\circ\text{C}$. Motor casing temperature passively rises to $54^\circ\text{C}$.
  3. Fixed-threshold benchmark trips at 50°C (FALSE ALARM).
  4. SC-CAMV evaluates $C(\text{temp\_c}, \text{amb\_temp}) = -0.95$.
- **Acceptance Criteria**: Contradiction score $S_{\text{contradict}}$ actively subtracts from the risk score. State remains in `NORMAL` or `WATCH` ($R < 35.0$). **ZERO FALSE SHUTDOWN**.

---

### Experiment F: Atmospheric Pressure Variation Rejection
- **Objective**: Verify that barometric pressure fluctuations (BMP180) are treated as context and rejected as mechanical fault indicators.
- **Procedure**:
  1. Run scenario `context_pressure_change` (pressure drops from 1013 hPa to 975 hPa).
- **Acceptance Criteria**: Pressure weight $w_{\text{pressure}} = 0.0$. Motor health risk remains $R < 15.0$.

---

### Experiment G: Sensor Dropout & Stale Signal
- **Objective**: Verify graceful degradation when a sensor disconnects.
- **Procedure**:
  1. Run scenario `sensor_dropout` (ACS712 signal drops to `null`).
- **Acceptance Criteria**: System reports `SENSOR_DEGRADED` with rule `"Data quality degradation: missing ACS712"`. System does NOT fabricate an alarm.

---

### Experiment H: Telemetry Communication Loss
- **Objective**: Verify that loss of host serial link does not compromise local physical protection.
- **Procedure**:
  1. Disconnect Bluetooth serial link while motor is running.
  2. Inject thermal or current overload into Arduino hardware.
- **Acceptance Criteria**: Arduino ATmega328P autonomous failsafe detects $T > 68^\circ\text{C}$ or $I > 2.8\text{ A}$ and independently cuts PWM to 0 within 200 ms.

---

### Experiment I: Multi-Modal Combined Overload
- **Objective**: Confirm rapid emergency stop under multi-sensor corroboration.
- **Procedure**:
  1. Run scenario `catastrophic_combined` (concurrent surge in temperature, current, vibration with RPM collapse).
- **Acceptance Criteria**: Escalates from `NORMAL` to `CRITICAL` in under 1.0 second. Emergency dynamic braking verified.

---

### Experiment J: 3-Strike Lockout & Recovery Probation
- **Objective**: Verify that repeated fault tripping triggers permanent operator lockout.
- **Procedure**:
  1. Run scenario `recovery_bounce` (fault triggers, clears briefly, and re-trips 3 times).
- **Acceptance Criteria**: On the 3rd critical trip, state transitions to `HARD_LOCKOUT`. The system refuses autonomous restart until the operator clicks **Clear Lockout** on the dashboard.
