#ifndef SC_CAMV_SENSORS_H
#define SC_CAMV_SENSORS_H

#include <Arduino.h>
#include "config.h"

struct SensorReadings {
  // ACS712 Current Sensor
  uint16_t curr_raw_adc;
  float curr_v;
  float curr_a;
  bool is_curr_valid;
  bool is_curr_calibrated;

  // MPU6050 Motion & Vibration (Mounted upside-down)
  float ax;
  float ay;
  float az;
  float gx;
  float gy;
  float gz;
  float vibe_rms;
  bool is_mpu_valid;
  uint8_t mpu_who_am_i;

  // IR Stationary Obstacle Sensor
  int ir_raw;
  bool ir_detected;
  bool is_ir_valid;

  // DHT11 Environmental Context Sensor
  float amb_temp_c;
  float amb_hum_pct;
  bool is_dht_valid;
};

void initSensors();
SensorReadings readAllSensors();
void setACS712ZeroOffset(float zeroV);
void setACS712Sensitivity(float sensVPerA);
void setIRActiveLow(bool activeLow);

#endif // SC_CAMV_SENSORS_H
