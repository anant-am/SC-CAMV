# Arduino Firmware Dependencies & Upload Guide

## Target Board Configuration
- **Board:** Arduino Uno
- **Microcontroller:** ATmega328P
- **Processor:** ATmega328P (Old Bootloader or Standard)
- **Clock Speed:** 16 MHz
- **Operating Voltage:** 5.0 V

## Standard Libraries Required
The firmware is written using standard, built-in Arduino core libraries to ensure zero build incompatibilities:

1. **`Wire.h`** (Built-in standard library):
   - Used for I²C communication with the MPU6050 accelerometer/gyroscope module on pins A4 (SDA) and A5 (SCL).
2. **`Arduino.h`** (Built-in standard core):
   - Provides hardware timers, GPIO controls, and `attachInterrupt()` for pin 3 optical tachometer pulse counts.

## Wiring & Pinout Summary
| Arduino Pin | Component | Role | Logic Level |
|---|---|---|---|
| **A0** | LM35 Temperature Sensor | Motor Casing Surface Temp | 5V Analog (10mV/°C) |
| **A1** | ACS712-05B Current Sensor | Motor Armature Current | 5V Analog (185mV/A, 2.5V zero) |
| **A4** | MPU6050 SDA | 6-DoF IMU Vibration Data | 5V / 3.3V I²C |
| **A5** | MPU6050 SCL | 6-DoF IMU Clock | 5V / 3.3V I²C (400 kHz) |
| **D2** | DHT11 Sensor | Ambient Reference Context | 5V Digital |
| **D3** | IR Optical Sensor | Slotted Tachometer Pulse (INT1) | 5V Digital (Rising Edge) |
| **D4** | HC-05 TX | Software/Hardware Serial RX | 5V Tolerant |
| **D5** | L298N ENA (PWM) | Motor Speed Duty Cycle | 5V PWM (Timer 0, 0-255) |
| **D6** | HC-05 RX | Software/Hardware Serial TX | **3.3V Logic (Use 1k/2k Divider)** |
| **D7** | L298N IN1 | Motor Direction A | 5V Digital |
| **D8** | L298N IN2 | Motor Direction B | 5V Digital |
| **D9** | Green LED | Normal Status Indicator | 5V Digital (220Ω Resistor) |
| **D10** | Yellow LED | Warning / Derate Indicator | 5V Digital (220Ω Resistor) |
| **D11** | Red LED | Critical Shutdown Indicator | 5V Digital (220Ω Resistor) |
| **D12** | Piezo Buzzer | Acoustic Alarm Annunciator | 5V Digital |

## How to Flash Firmware using Arduino IDE
1. Open the Arduino IDE.
2. Navigate to `File` → `Open` and select `IOT_PROJECT/firmware/sc_camv_firmware/sc_camv_firmware.ino`.
3. In `Tools` → `Board`, select **Arduino Uno**.
4. In `Tools` → `Port`, select the USB COM port of your connected Arduino.
5. Click **Upload** (Ctrl + U).
6. Open the **Serial Monitor** at **9600 baud** to verify the startup message:
   ```json
   {"status":"BOOT_READY","firmware":"SC-CAMV_v1.0","board":"Arduino_UNO_ATmega328P"}
   ```
7. Close the Serial Monitor before connecting the Python backend or Bluetooth link.
