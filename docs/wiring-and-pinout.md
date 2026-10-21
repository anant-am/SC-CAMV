# Hardware Wiring, Pinout, and Electrical Compatibility Guide

## SC-CAMV System: Arduino UNO Embedded Monitoring Rig

This document defines the final hardware pin assignments, electrical characteristics, wiring guidelines, and physical mounting rules for the SC-CAMV prototype.

---

### 1. Component Overview & Electrical Specifications

| Component | Part / Model | Operating Voltage | Current Consumption | Interface | Sensitivity / Scaling |
|---|---|---|---|---|---|
| **Microcontroller** | Arduino UNO R3 (ATmega328P) | 5.0 V (USB or 7–12V DC barrel) | ~45 mA | Digital / Analog / I²C | 10-bit ADC (4.887 mV/LSB) |
| **Motor Driver** | L293D Dual H-Bridge Board | 5.0 V Logic, 6–12V Motor Supply | ~600 mA cont / 1.2A peak | PWM (D10) + Dir (D9, D8) | Push-pull driver (V_sat ~ 1.3V) |
| **DC Motor & Fan** | Small Brushed DC Motor with Fan | 6.0 V – 12.0 V (Nominal) | ~0.55 A idle with fan, ~1.8 A stall | Two-wire armature leads | Connected to L293D M1/M2 terminals |
| **Current Sensor** | ACS712 (nominally 30A version) | 5.0 V VCC | ~10 mA | Analog (A1) | Nominally 66 mV / A (Vcc/2 offset ~2.51V) |
| **Motion Sensor** | MPU6050 6-DOF IMU | 5.0 V / 3.3 V (Onboard LDO) | ~3.8 mA | I²C (A4 SDA, A5 SCL) | ±2g range (16,384 LSB/g), Upside-Down |
| **Obstacle Sensor** | Active IR Proximity Sensor | 5.0 V VCC | ~15 mA | Digital Input (D2) | Active LOW (LOW = Object, HIGH = Clear) |
| **Ambient Context** | DHT11 Environmental Sensor | 5.0 V VCC | ~1.5 mA | Digital 1-Wire (D4) | Ambient Temp (°C) & Humidity (%RH) |
| **Status LEDs** | Green (D12), Red (D13) | 5.0 V Logic via 220–330 Ω | ~15 mA each | GPIO Outputs | Green: Normal/Healthy; Red: Warning/Trip |
| **Alarm Buzzer** | Piezo Buzzer | 5.0 V Logic | ~25 mA | GPIO Output (D6) | Non-blocking pulsed alarm |
| **Wireless Module** | HC-05 Bluetooth SPP Module | 5.0 V Module VCC | ~30 mA paired | UART (D11 RX, D7 TX) | 9600 baud, 8N1 (D7 TX level shifted) |

---

### 2. Complete Microcontroller Pin Mapping Table

```
   ========================================================================
                      ARDUINO UNO R3 FINAL PIN MAP
   ========================================================================
   PIN         SIGNAL         DIR     CONNECTED COMPONENT / FUNCTION
   ------------------------------------------------------------------------
   D10 (PWM)   PIN_MOTOR_EN1  OUT     L293D EN1 Speed Control (Timer 1 PWM)
   D9          PIN_MOTOR_IN1  OUT     L293D IN1 Direction Terminal 1
   D8          PIN_MOTOR_IN2  OUT     L293D IN2 Direction Terminal 2
   D2          PIN_IR_OBSTACLE IN     IR Stationary Obstacle (Active LOW)
   D4          PIN_DHT11      IN/OUT  DHT11 Single-Wire Ambient Context
   A1          PIN_ACS712     ANALOG  ACS712 Hall-Effect Armature Current
   A4          PIN_MPU_SDA    I2C     MPU6050 I²C SDA (Address 0x68)
   A5          PIN_MPU_SCL    I2C     MPU6050 I²C SCL (100 kHz Bus Clock)
   D12         PIN_LED_GREEN  OUT     Normal Monitoring & Healthy State LED
   D13         PIN_LED_RED    OUT     Warning / Failsafe Trip LED
   D6          PIN_BUZZER     OUT     Audible Hazard Annunciator Control
   D11         PIN_HC05_RX    IN      SoftwareSerial RX (Connected to HC-05 TXD)
   D7          PIN_HC05_TX    OUT     SoftwareSerial TX (to HC-05 RXD via divider)
   5V          VCC            PWR     Sensor & Driver Logic 5V Rail
   GND         GND            GND     Common System Ground
   ========================================================================
```

---

### 3. Decommissioning of LM35 Temperature Sensor
The LM35 contact temperature sensor has been permanently decommissioned and removed from the active SC-CAMV configuration.
- Analog pin A0 is disconnected and unused.
- Ambient room reference readings are provided solely by the DHT11 sensor on D4.
- The DHT11 strictly measures ambient air and is never misrepresented as direct motor casing or winding temperature.

---

### 4. Sensor Placement & Mounting Guidelines

#### 4.1 MPU6050 Motion Sensor (Upside Down Mounting)
- **Mounting location:** Mounted rigidly on the stationary motor housing or rigid motor bracket.
- **NEVER mount on fan blades or rotating shaft:** Rotating mounting destroys wiring and causes extreme centrifugal acceleration (>16g) that saturates the sensor.
- **Upside-Down Orientation:** Because the sensor board is mounted inverted, the stationary gravity vector is aligned with $-Z$:
  $$a_z \approx -1.0\text{ g (stationary)}$$
- The firmware and backend software calculate vibration RMS by subtracting the static $1.0\text{ g}$ gravity vector:
  $$\text{Vibration RMS} = |\sqrt{a_x^2 + a_y^2 + a_z^2} - 1.0\text{ g}|$$

#### 4.2 IR Obstacle Sensor
- **Mounting location:** Fixed rigidly on a stationary bracket positioned facing the motor and fan zone.
- **Purpose:** Stationary obstruction detection near rotating equipment.
- **Operation:** Active LOW. Moving a hand or object within 2–5 cm pulls D2 to LOW (`ir_raw = 0`, `ir_det = true`).
- **Safety notice:** The IR sensor is an educational proximity guard and not a certified safety interlock.

#### 4.3 ACS712 Current Sensor
- **Connection topology:** Wired strictly **in series** with the positive motor armature power supply lead between the battery/power supply and L293D motor terminal.
- **NEVER connect across supply terminals:** Connecting in parallel creates a short circuit that will destroy the sensor and power supply.
- **Zero-current calibration:** Must be performed only when the motor is stopped and de-energized.

#### 4.4 HC-05 Bluetooth Level Shifter
- The Arduino D7 digital output operates at 5V TTL.
- The HC-05 RXD pin requires 3.3V logic. Use a two-resistor voltage divider:
  ```
  Arduino D7 (TX, 5V) ----[ 1 kΩ ]----+----> HC-05 RXD (3.3V)
                                       |
                                    [ 2 kΩ ]
                                       |
                                      GND
  ```
