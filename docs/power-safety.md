# SC-CAMV Power Safety and Electrical Hazard Mitigation Guide

## 1. Fundamental Power Safety Rules

The SC-CAMV prototype integrates low-voltage logic (Arduino ATmega328P, 5V / 3.3V) with higher-current inductive motor drive circuits (L293D, 6–12V). Strict domain separation is required to prevent component destruction, thermal hazards, or power rail collapse.

### Rule 1: Never Connect Motor High-Voltage (12V) to Arduino 5V
- **CRITICAL:** The motor power terminal on the L293D board must NEVER be bridged, jumped, or connected to the Arduino 5V pin or 3.3V pin.
- Connecting external battery voltage (>5.5V) to the Arduino 5V rail bypasses the onboard linear regulator and will instantly destroy the ATmega328P microcontroller and all connected sensors.

### Rule 2: Never Drive the Motor Directly from Arduino GPIO Pins
- An Arduino ATmega328P GPIO pin can supply a maximum of 40 mA (recommended limit: 20 mA).
- A small DC motor with fan draws approximately **550 mA idle** and up to **1.81 A during stall**.
- Connecting the motor directly to an Arduino pin will permanently burn out the microcontroller output driver and trigger an immediate thermal failure.
- Always use the L293D H-bridge driver.

### Rule 3: Common Ground is Mandatory
- The external motor power supply GND MUST be bonded to Arduino GND.
- Without a common ground reference, the PWM control signal (D10) and direction lines (D9, D8) will float, causing unpredictable motor jerks, driver overheating, or high voltage transients backfeeding into the microcontroller.

### Rule 4: Verify Battery Polarity and Voltage Before Attachment
- The user has reported a 2-cell 18650 holder (approx. 2500 mAh cells, nominally 7.4V – 8.4V fully charged).
- **MANDATORY CHECK:** Measure the open-circuit output voltage with a digital multimeter before plugging in the battery:
  - Voltage must read between 6.0V and 8.4V.
  - Red lead MUST be positive (+); black lead MUST be negative (-).
  - Reverse polarity will destroy the L293D driver instantly.

### Rule 5: L293D Thermal and Current Limitations
- The L293D driver IC is rated for **600 mA continuous current per channel** and **1.2 A peak non-repetitive current**.
- Normal operation with the small fan at PWM 100 draws approximately **0.35 A – 0.55 A**, which is safely within the L293D continuous thermal envelope.
- Prolonged full stall (>1.5 A) will cause thermal shutdown or chip damage if sustained for more than 2–3 seconds.
- SC-CAMV implements an autonomous embedded failsafe trip at **2.60 A** in firmware to prevent thermal destruction.

---

## 2. Firmware Startup Safety & Operator Protocol

### Safe Stopped Startup Guarantee
- The firmware initializes with:
  ```cpp
  analogWrite(PIN_MOTOR_EN1, 0);
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  ```
- The motor is **strictly de-energized on reboot**. It will NEVER spin upon power-up or firmware reload.
- Starting the motor requires an explicit, deliberate operator command:
  - Web Dashboard: Click **Start Motor** (defaults to PWM 100).
  - REST API: `POST /api/v1/motor/start` with payload `{"pwm": 100}`.
  - Serial Terminal: Send `{"cmd":"START","pwm":100}`.

### Software Emergency Stop (ESTOP)
- An immediate hardware-decoupled ESTOP is accessible via:
  - Web Dashboard topbar / Overview page: **ESTOP button**.
  - REST API: `POST /api/v1/motor/estop`.
  - Serial Terminal: Send `{"cmd":"ESTOP"}`.
- Triggering ESTOP cuts PWM to 0, sets direction lines to LOW, illuminates the Red LED (D13), sounds the alarm buzzer (D6), and engages an algorithmic lockout.

---

## 3. Unverified Supply Fallback Policy

If the physical battery holder or motor power supply is unverified, untested, or unavailable:
1. **DO NOT connect the physical motor power leads.**
2. Run the SC-CAMV system in **Simulation Mode** or **Bench Telemetry Mode**.
3. In Bench Mode, the Arduino sensors (ACS712, MPU6050, IR, DHT11) and dashboard operate normally with zero electrical hazard.
4. Software-injected faults demonstrate overcurrent, vibration, and obstacle detection safely without requiring physical motor stall.
