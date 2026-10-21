#include "sensors.h"
#include <Wire.h>

// Calibration and operational parameters
static float s_acs712ZeroV = 2.508f;       // Zero-current offset voltage (nominally ~2.5V, ADC ~514)
static float s_acs712Sens = 0.066f;        // Volts per Ampere (0.066 V/A for 30A module, 0.185 for 5A)
static bool s_acs712Calibrated = false;
static bool s_irActiveLow = true;          // Active LOW: LOW = object detected, HIGH = path clear

// Cached MPU6050 state
static bool s_mpuDetected = false;
static uint8_t s_mpuWhoAmI = 0x00;
static float s_gyroBiasX = 0.0f;
static float s_gyroBiasY = 0.0f;
static float s_gyroBiasZ = 0.0f;

// Cached DHT11 state & timing
static uint32_t s_lastDhtReadMs = 0;
static float s_cachedAmbTemp = 26.5f;
static float s_cachedAmbHum = 65.0f;
static bool s_cachedDhtValid = false;

// -----------------------------------------------------------------------------
// Bitbang DHT11 driver (Zero external library dependencies for lightweight UNO footprint)
// -----------------------------------------------------------------------------
static bool readDHT11Raw(uint8_t pin, float& outTemp, float& outHum) {
  uint8_t data[5] = {0, 0, 0, 0, 0};

  // Host start signal: pull low for at least 18ms
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  delay(20);
  digitalWrite(pin, HIGH);
  delayMicroseconds(30);
  pinMode(pin, INPUT);

  // Wait for sensor response: 80us LOW then 80us HIGH
  uint16_t timeout = 10000;
  while (digitalRead(pin) == HIGH) {
    if (--timeout == 0) return false;
  }
  timeout = 10000;
  while (digitalRead(pin) == LOW) {
    if (--timeout == 0) return false;
  }
  timeout = 10000;
  while (digitalRead(pin) == HIGH) {
    if (--timeout == 0) return false;
  }

  // Read 40 bits (5 bytes)
  for (int i = 0; i < 40; i++) {
    timeout = 10000;
    while (digitalRead(pin) == LOW) {
      if (--timeout == 0) return false;
    }
    // High pulse width determines bit: 26-28us = '0', 70us = '1'
    uint32_t tStart = micros();
    timeout = 10000;
    while (digitalRead(pin) == HIGH) {
      if (--timeout == 0) return false;
    }
    uint32_t pulseLen = micros() - tStart;
    if (pulseLen > 40) {
      data[i / 8] |= (1 << (7 - (i % 8)));
    }
  }

  // Verify checksum: byte 4 == (byte 0 + byte 1 + byte 2 + byte 3) & 0xFF
  uint8_t sum = (data[0] + data[1] + data[2] + data[3]) & 0xFF;
  if (data[4] != sum) {
    return false;
  }

  outHum = (float)data[0] + (float)data[1] * 0.1f;
  outTemp = (float)data[2] + (float)data[3] * 0.1f;
  return (outHum >= 10.0f && outHum <= 95.0f && outTemp >= 0.0f && outTemp <= 60.0f);
}

void initSensors() {
  // Configure analog pins
  pinMode(PIN_ACS712, INPUT);

  // Configure digital inputs
  pinMode(PIN_IR_OBSTACLE, INPUT);
  pinMode(PIN_DHT11, INPUT);

  // Initialize I2C bus for MPU6050
  Wire.begin();
  Wire.setClock(100000); // 100 kHz standard I2C for noise immunity
#if defined(WIRE_HAS_TIMEOUT)
  Wire.setWireTimeout(25000, true); // 25ms timeout with automatic TWI bus reset on noise
#endif

  // Probe MPU6050 WHO_AM_I (reg 0x75)
  Wire.beginTransmission(MPU6050_I2C_ADDR);
  Wire.write(0x75);
  if (Wire.endTransmission(false) == 0) {
    if (Wire.requestFrom((uint8_t)MPU6050_I2C_ADDR, (uint8_t)1) == 1) {
      s_mpuWhoAmI = Wire.read();
      s_mpuDetected = (s_mpuWhoAmI == 0x68 || s_mpuWhoAmI == 0x70 || s_mpuWhoAmI == 0x72);
    }
  }

  if (s_mpuDetected) {
    // Wake up MPU6050: write 0 to PWR_MGMT_1 (reg 0x6B)
    Wire.beginTransmission(MPU6050_I2C_ADDR);
    Wire.write(0x6B);
    Wire.write(0x00);
    Wire.endTransmission(true);

    // Accel config: ±2g (16384 LSB/g) (reg 0x1C)
    Wire.beginTransmission(MPU6050_I2C_ADDR);
    Wire.write(0x1C);
    Wire.write(0x00);
    Wire.endTransmission(true);

    // Gyro config: ±250 deg/s (131 LSB/deg/s) (reg 0x1B)
    Wire.beginTransmission(MPU6050_I2C_ADDR);
    Wire.write(0x1B);
    Wire.write(0x00);
    Wire.endTransmission(true);
  }
}

void setACS712ZeroOffset(float zeroV) {
  s_acs712ZeroV = zeroV;
  s_acs712Calibrated = true;
}

void setACS712Sensitivity(float sensVPerA) {
  if (sensVPerA > 0.01f) {
    s_acs712Sens = sensVPerA;
  }
}

void setIRActiveLow(bool activeLow) {
  s_irActiveLow = activeLow;
}

SensorReadings readAllSensors() {
  SensorReadings r;
  uint32_t now = millis();

  // ---------------------------------------------------------------------------
  // 1. ACS712 Current Sensor (A1)
  // ---------------------------------------------------------------------------
  uint32_t rawSum = 0;
  for (int i = 0; i < 16; i++) {
    rawSum += analogRead(PIN_ACS712);
    delayMicroseconds(25);
  }
  r.curr_raw_adc = rawSum / 16;
  r.curr_v = (r.curr_raw_adc * 5.0f) / 1023.0f;

  // Validity check: Disconnected/floating analog lines read near 0 or 1023
  if (r.curr_raw_adc < 40 || r.curr_raw_adc > 980) {
    r.is_curr_valid = false;
    r.curr_a = 0.0f;
  } else {
    r.is_curr_valid = true;
    float currentCalc = (r.curr_v - s_acs712ZeroV) / s_acs712Sens;
    // Suppress tiny negative noise around calibrated zero
    if (currentCalc < 0.0f && currentCalc > -0.06f) currentCalc = 0.0f;
    r.curr_a = currentCalc;
  }
  r.is_curr_calibrated = s_acs712Calibrated;

  // ---------------------------------------------------------------------------
  // 2. MPU6050 6-DOF Motion & Vibration Sensor (A4/A5, Mounted UPSIDE DOWN)
  // ---------------------------------------------------------------------------
  r.mpu_who_am_i = s_mpuWhoAmI;
  if (!s_mpuDetected) {
    // Attempt re-detection if connection was loose
    Wire.beginTransmission(MPU6050_I2C_ADDR);
    Wire.write(0x75);
    if (Wire.endTransmission(false) == 0 && Wire.requestFrom((uint8_t)MPU6050_I2C_ADDR, (uint8_t)1) == 1) {
      s_mpuWhoAmI = Wire.read();
      s_mpuDetected = true;
    }
  }

  if (s_mpuDetected) {
    Wire.beginTransmission(MPU6050_I2C_ADDR);
    Wire.write(0x3B); // ACCEL_XOUT_H
    uint8_t err = Wire.endTransmission(false);

    if (err == 0 && Wire.requestFrom((uint8_t)MPU6050_I2C_ADDR, (uint8_t)14, (uint8_t)true) == 14) {
      int16_t rawAx = (Wire.read() << 8) | Wire.read();
      int16_t rawAy = (Wire.read() << 8) | Wire.read();
      int16_t rawAz = (Wire.read() << 8) | Wire.read();
      (void)((Wire.read() << 8) | Wire.read()); // Internal temp register skipped
      int16_t rawGx = (Wire.read() << 8) | Wire.read();
      int16_t rawGy = (Wire.read() << 8) | Wire.read();
      int16_t rawGz = (Wire.read() << 8) | Wire.read();

      r.ax = rawAx / 16384.0f;
      r.ay = rawAy / 16384.0f;
      r.az = rawAz / 16384.0f; // Note: In upside-down mounting, stationary az is approx -1.0g

      r.gx = (rawGx / 131.0f) - s_gyroBiasX;
      r.gy = (rawGy / 131.0f) - s_gyroBiasY;
      r.gz = (rawGz / 131.0f) - s_gyroBiasZ;

      // Vibration RMS: compute deviation from static 1g gravity vector
      float totalG = sqrt(r.ax * r.ax + r.ay * r.ay + r.az * r.az);
      r.vibe_rms = fabs(totalG - 1.0f);
      r.is_mpu_valid = true;
    } else {
      r.ax = 0.0f; r.ay = 0.0f; r.az = -1.0f;
      r.gx = 0.0f; r.gy = 0.0f; r.gz = 0.0f;
      r.vibe_rms = 0.0f;
      r.is_mpu_valid = false;
    }
  } else {
    r.ax = 0.0f; r.ay = 0.0f; r.az = 0.0f;
    r.gx = 0.0f; r.gy = 0.0f; r.gz = 0.0f;
    r.vibe_rms = 0.0f;
    r.is_mpu_valid = false;
  }

  // ---------------------------------------------------------------------------
  // 3. IR Stationary Obstacle Sensor (D2)
  // ---------------------------------------------------------------------------
  r.ir_raw = digitalRead(PIN_IR_OBSTACLE);
  r.ir_detected = s_irActiveLow ? (r.ir_raw == LOW) : (r.ir_raw == HIGH);
  r.is_ir_valid = true;

  // ---------------------------------------------------------------------------
  // 4. DHT11 Environmental Context Sensor (D4)
  // Sampled every 1500 ms to respect DHT11 recovery cycle
  // ---------------------------------------------------------------------------
  if ((uint32_t)(now - s_lastDhtReadMs) >= 1500) {
    s_lastDhtReadMs = now;
    float readT, readH;
    if (readDHT11Raw(PIN_DHT11, readT, readH)) {
      s_cachedAmbTemp = readT;
      s_cachedAmbHum = readH;
      s_cachedDhtValid = true;
    } else {
      s_cachedDhtValid = false;
    }
  }
  r.amb_temp_c = s_cachedAmbTemp;
  r.amb_hum_pct = s_cachedAmbHum;
  r.is_dht_valid = s_cachedDhtValid;

  return r;
}
