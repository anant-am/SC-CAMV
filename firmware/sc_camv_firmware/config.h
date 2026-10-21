#ifndef SC_CAMV_CONFIG_H
#define SC_CAMV_CONFIG_H

#include <Arduino.h>

// ==============================================================================
// FINAL HARDWARE PIN MAPPING (Arduino UNO R3 / ATmega328P)
// Strictly follows Section 4 of SC-CAMV System Specification
// ==============================================================================

// L293D DC Motor Driver
#define PIN_MOTOR_EN1       10    // D10: PWM Output (Timer 1) - Motor Speed (0-255)
#define PIN_MOTOR_IN1       9     // D9:  Direction IN1
#define PIN_MOTOR_IN2       8     // D8:  Direction IN2

// IR Stationary Obstacle Sensor
#define PIN_IR_OBSTACLE     2     // D2:  Digital in: Stationary Obstruction (Active LOW)

// DHT11 Environmental Context Sensor
#define PIN_DHT11           4     // D4:  Single-Wire Digital: Ambient Temp & Humidity

// ACS712 Motor Armature Current Sensor
#define PIN_ACS712          A1    // A1:  Analog in: Hall-effect current (nominally ~514 at 0A)

// MPU6050 6-DOF Motion Sensor (Mounted UPSIDE DOWN on motor housing)
#define PIN_MPU_SDA         A4    // A4:  I2C SDA
#define PIN_MPU_SCL         A5    // A5:  I2C SCL
#define MPU6050_I2C_ADDR    0x68

// System Status Indicator LEDs
#define PIN_LED_GREEN       12    // D12: Green LED (Normal monitoring & healthy sensors)
#define PIN_LED_RED         13    // D13: Red LED (Confirmed warning or protective trip)

// Piezo Buzzer
#define PIN_BUZZER          6     // D6:  Audible alarm pulse control

// HC-05 Bluetooth Transport (Optional Alternate to USB UART)
#define PIN_HC05_RX         11    // D11: SoftwareSerial RX (connected to HC-05 TXD)
#define PIN_HC05_TX         7     // D7:  SoftwareSerial TX (via 1k/2k divider to HC-05 RXD)

// ==============================================================================
// PROTOCOL & TIMING PARAMETERS
// ==============================================================================
#define SERIAL_BAUD_RATE    9600
#define SAMPLE_INTERVAL_MS  200   // 5 Hz Telemetry Broadcast
#define DEFAULT_DEMO_PWM    150   // Default intended demonstration setting after explicit start
#define PROTOCOL_VERSION    "1.0"
#define FIRMWARE_VERSION    "SC-CAMV_v1.0"

// Embedded Autonomous Failsafe Thresholds
#define FAILSAFE_MAX_CURRENT_A   2.60f   // Immediate stall/overload trip (Amperes)
#define FAILSAFE_MAX_VIBE_G      2.40f   // Immediate excessive vibration trip (g RMS)

#endif // SC_CAMV_CONFIG_H
