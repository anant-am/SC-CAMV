# Known Limitations, Uncertainty, and Engineering Boundaries

## SC-CAMV Educational Prototype Boundaries

### 1. Project Identity & Scope
This framework is an educational and university-level IoT diagnostics prototype designed to demonstrate multi-sensor baseline learning, contradiction-aware reasoning, and fault recovery.

**Explicit Scope Boundaries**:
- **Not a Certified Safety Controller:** This project is NOT an IEC 61508 or ISO 13849 SIL-rated industrial safety system.
- **No Guaranteed Predictive Maintenance:** It does NOT predict future remaining useful life (RUL) with certainty.
- **No Precise Bearing Micro-Spall Diagnosis:** High-frequency bearing fault diagnosis requires kHz-range piezoelectric accelerometers and envelope analysis; low-cost MEMS at 5–50 Hz can only identify gross mechanical imbalance, loose mounts, and severe rotor vibration.
- **Honest Statistical Bounds:** The system does not manufacture arbitrary percentages without clear mathematical derivation.

---

### 2. Specific Physical Sensing & Hardware Limitations

#### 2.1 ACS712 Current Sensor Resolution at Low Currents
- The installed module is nominally an ACS712 30A version ($66\text{ mV / A}$).
- On the Arduino UNO 10-bit ADC ($4.887\text{ mV / LSB}$), $1\text{ LSB} \approx 0.074\text{ A}$.
- At low currents ($< 0.20\text{ A}$), measurement uncertainty is significant due to ADC quantization and thermal noise.
- *Software Mitigation:* The firmware implements 16-sample oversampling and configurable zero-current offset calibration.

#### 2.2 MPU6050 Accelerometer Sampling & Upside-Down Mounting
- The MPU6050 is mounted upside down on the stationary motor bracket.
- The stationary gravity vector is aligned with $-Z$ ($a_z \approx -1.0\text{ g}$).
- The software isolates vibration RMS by subtracting the Earth's gravity vector.
- MEMS accelerometers suffer from thermal zero-g drift and loose header wire intermittent disconnects.

#### 2.3 IR Obstacle Sensor Non-Certified Guarding
- The IR sensor on pin D2 detects stationary obstructions near the motor housing.
- It operates via infrared reflection (Active LOW). Highly absorbent black surfaces or clear transparent materials may fail to reflect sufficient IR light.
- It cannot guarantee detection of every possible mechanical obstruction and must never replace physical finger guards.

#### 2.4 DHT11 Ambient Environmental Context
- The DHT11 on pin D4 measures ambient room air, NOT direct motor casing or internal coil temperature.
- The LM35 contact temperature sensor has been decommissioned.
- DHT11 update rate is paced at 1.5 seconds due to sensor physical response time.

#### 2.5 PWM Command vs. Physical RPM
- PWM (0–255) is an applied electrical duty cycle command, NOT measured rotational speed.
- In the absence of an optical encoder, physical movement is corroborated indirectly through armature current draw ($> 0.15\text{ A}$) and vibration RMS ($> 0.03\text{ g}$).
- The system explicitly reports `inferred_motor_state = UNKNOWN` when physical confirmation is unavailable.

#### 2.6 L293D Motor Driver Thermal Limits
- The L293D is rated for 600 mA continuous current per channel.
- Normal operation with the small fan at PWM 100 draws approximately 0.35A – 0.55A.
- Sustained motor stall can draw up to 1.81A, which will cause thermal shutdown if prolonged. Firmware limits stall duration with an immediate 2.60A failsafe trip.
