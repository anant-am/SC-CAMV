#include "protocol.h"
#include <SoftwareSerial.h>

// HC-05 Bluetooth SoftwareSerial instance
static SoftwareSerial s_btSerial(PIN_HC05_RX, PIN_HC05_TX);

void initBluetooth() {
  s_btSerial.begin(HC05_BAUD_RATE);
}

void sendTelemetryFrame(
  uint32_t seq,
  uint32_t timestampMs,
  const SensorReadings& r,
  uint8_t activePwm,
  const char* motorStateStr,
  EmbeddedState state
) {
  const char* stateStr = "NORMAL";
  switch (state) {
    case EMB_STOPPED:  stateStr = "STOPPED"; break;
    case EMB_NORMAL:   stateStr = "NORMAL"; break;
    case EMB_WARNING:  stateStr = "WARNING"; break;
    case EMB_CRITICAL: stateStr = "CRITICAL"; break;
    case EMB_LOCKOUT:  stateStr = "HARD_LOCKOUT"; break;
  }

  // Print serialized JSON directly to Serial stream (avoids heap allocation)
  Serial.print(F("{\"seq\":"));
  Serial.print(seq);
  Serial.print(F(",\"ms\":"));
  Serial.print(timestampMs);

  // ACS712 Current measurements
  Serial.print(F(",\"curr_raw\":"));
  Serial.print(r.curr_raw_adc);
  Serial.print(F(",\"curr_v\":"));
  Serial.print(r.curr_v, 3);
  Serial.print(F(",\"curr_a\":"));
  if (r.is_curr_valid) {
    Serial.print(r.curr_a, 3);
  } else {
    Serial.print(F("null"));
  }

  // MPU6050 Motion & Vibration measurements
  Serial.print(F(",\"ax\":"));
  Serial.print(r.ax, 3);
  Serial.print(F(",\"ay\":"));
  Serial.print(r.ay, 3);
  Serial.print(F(",\"az\":"));
  Serial.print(r.az, 3);
  Serial.print(F(",\"gx\":"));
  Serial.print(r.gx, 2);
  Serial.print(F(",\"gy\":"));
  Serial.print(r.gy, 2);
  Serial.print(F(",\"gz\":"));
  Serial.print(r.gz, 2);
  Serial.print(F(",\"vibe_rms\":"));
  Serial.print(r.vibe_rms, 3);
  Serial.print(F(",\"mpu_ok\":"));
  Serial.print(r.is_mpu_valid ? F("true") : F("false"));

  // IR Stationary Obstacle measurements
  Serial.print(F(",\"ir_raw\":"));
  Serial.print(r.ir_raw);
  Serial.print(F(",\"ir_det\":"));
  Serial.print(r.ir_detected ? F("true") : F("false"));

  // DHT11 Environmental Context measurements
  Serial.print(F(",\"amb_t\":"));
  if (r.is_dht_valid) {
    Serial.print(r.amb_temp_c, 1);
  } else {
    Serial.print(F("null"));
  }
  Serial.print(F(",\"amb_h\":"));
  if (r.is_dht_valid) {
    Serial.print(r.amb_hum_pct, 1);
  } else {
    Serial.print(F("null"));
  }
  Serial.print(F(",\"dht_ok\":"));
  Serial.print(r.is_dht_valid ? F("true") : F("false"));

  // LM35 Contact Surface Temperature & Temperature Fusion measurements
  Serial.print(F(",\"lm35_c\":"));
  if (r.is_lm35_valid) {
    Serial.print(r.lm35_c, 1);
  } else {
    Serial.print(F("null"));
  }
  Serial.print(F(",\"lm35_ok\":"));
  Serial.print(r.is_lm35_valid ? F("true") : F("false"));
  Serial.print(F(",\"temp_c\":"));
  if (r.is_temp_valid) {
    Serial.print(r.fused_temp_c, 1);
  } else {
    Serial.print(F("null"));
  }
  Serial.print(F(",\"temp_valid\":"));
  Serial.print(r.is_temp_valid ? F("true") : F("false"));
  Serial.print(F(",\"temp_src\":\""));
  Serial.print(r.temp_source_str);
  Serial.print(F("\""));

  // Actuation & Health state
  Serial.print(F(",\"pwm\":"));
  Serial.print(activePwm);
  Serial.print(F(",\"motor\":\""));
  Serial.print(motorStateStr);
  Serial.print(F("\",\"st\":\""));
  Serial.print(stateStr);
  Serial.println(F("\"}"));
}

void sendBluetoothTelemetryFrame(
  uint32_t seq,
  uint32_t timestampMs,
  const SensorReadings& r,
  uint8_t activePwm,
  const char* motorStateStr,
  EmbeddedState state,
  bool isEmergencyStopped
) {
  const char* stateStr = "NORMAL";
  switch (state) {
    case EMB_STOPPED:  stateStr = "STOPPED"; break;
    case EMB_NORMAL:   stateStr = "NORMAL"; break;
    case EMB_WARNING:  stateStr = "WARNING"; break;
    case EMB_CRITICAL: stateStr = "CRITICAL"; break;
    case EMB_LOCKOUT:  stateStr = "HARD_LOCKOUT"; break;
  }

  // Transmit compact, readable, newline-delimited JSON line for Bluetooth terminal
  s_btSerial.print(F("{\"seq\":"));
  s_btSerial.print(seq);
  s_btSerial.print(F(",\"ms\":"));
  s_btSerial.print(timestampMs);

  // LM35, DHT11 and Fused Temperature
  s_btSerial.print(F(",\"lm35_c\":"));
  if (r.is_lm35_valid) {
    s_btSerial.print(r.lm35_c, 1);
  } else {
    s_btSerial.print(F("null"));
  }
  s_btSerial.print(F(",\"dht_c\":"));
  if (r.is_dht_valid) {
    s_btSerial.print(r.amb_temp_c, 1);
  } else {
    s_btSerial.print(F("null"));
  }
  s_btSerial.print(F(",\"temp_c\":"));
  if (r.is_temp_valid) {
    s_btSerial.print(r.fused_temp_c, 1);
  } else {
    s_btSerial.print(F("null"));
  }
  s_btSerial.print(F(",\"dht_h\":"));
  if (r.is_dht_valid) {
    s_btSerial.print(r.amb_hum_pct, 1);
  } else {
    s_btSerial.print(F("null"));
  }

  // Current & Vibration
  s_btSerial.print(F(",\"current_a\":"));
  if (r.is_curr_valid) {
    s_btSerial.print(r.curr_a, 2);
  } else {
    s_btSerial.print(F("null"));
  }
  s_btSerial.print(F(",\"curr_raw\":"));
  s_btSerial.print(r.curr_raw_adc);
  s_btSerial.print(F(",\"vibration\":"));
  if (r.is_mpu_valid) {
    s_btSerial.print(r.vibe_rms, 2);
  } else {
    s_btSerial.print(F("null"));
  }

  // Accelerometer axes
  s_btSerial.print(F(",\"ax\":"));
  s_btSerial.print(r.ax, 2);
  s_btSerial.print(F(",\"ay\":"));
  s_btSerial.print(r.ay, 2);
  s_btSerial.print(F(",\"az\":"));
  s_btSerial.print(r.az, 2);

  // IR Obstacle & Actuation
  s_btSerial.print(F(",\"ir_detected\":"));
  s_btSerial.print(r.ir_detected ? F("true") : F("false"));
  s_btSerial.print(F(",\"ir_raw\":"));
  s_btSerial.print(r.ir_raw);
  s_btSerial.print(F(",\"motor\":\""));
  s_btSerial.print(motorStateStr);
  s_btSerial.print(F("\",\"pwm\":"));
  s_btSerial.print(activePwm);
  s_btSerial.print(F(",\"machine_state\":\""));
  s_btSerial.print(stateStr);
  s_btSerial.print(F("\""));

  // Sensor validity flags & temperature source
  s_btSerial.print(F(",\"lm35_ok\":"));
  s_btSerial.print(r.is_lm35_valid ? F("true") : F("false"));
  s_btSerial.print(F(",\"dht_ok\":"));
  s_btSerial.print(r.is_dht_valid ? F("true") : F("false"));
  s_btSerial.print(F(",\"mpu_ok\":"));
  s_btSerial.print(r.is_mpu_valid ? F("true") : F("false"));
  s_btSerial.print(F(",\"temp_valid\":"));
  s_btSerial.print(r.is_temp_valid ? F("true") : F("false"));
  s_btSerial.print(F(",\"temp_src\":\""));
  s_btSerial.print(r.temp_source_str);
  s_btSerial.print(F("\""));
  s_btSerial.print(F(",\"estop\":"));
  s_btSerial.print(isEmergencyStopped ? F("true") : F("false"));
  s_btSerial.println(F("}"));
}

static char s_cmdBuffer[80];
static uint8_t s_cmdBufferIdx = 0;

static bool processIncomingChar(char c, CommandType& outCmd, uint8_t& outPwm, float& outParam) {
  if (c == '\n' || c == '\r') {
    if (s_cmdBufferIdx > 0) {
      s_cmdBuffer[s_cmdBufferIdx] = '\0';
      s_cmdBufferIdx = 0;

      // Parse command token
      if (strstr(s_cmdBuffer, "ESTOP") != NULL) {
        outCmd = CMD_ESTOP;
        return true;
      } else if (strstr(s_cmdBuffer, "RESET") != NULL) {
        outCmd = CMD_RESET;
        return true;
      } else if (strstr(s_cmdBuffer, "START") != NULL) {
        outCmd = CMD_START;
        char* pPwm = strstr(s_cmdBuffer, "pwm");
        if (pPwm != NULL) {
          char* num = pPwm + 3;
          while (*num && (*num < '0' || *num > '9')) num++;
          int val = atoi(num);
          outPwm = (val > 0 && val <= 255) ? (uint8_t)val : DEFAULT_DEMO_PWM;
        } else {
          outPwm = DEFAULT_DEMO_PWM;
        }
        return true;
      } else if (strstr(s_cmdBuffer, "STOP") != NULL) {
        outCmd = CMD_STOP;
        return true;
      } else if (strstr(s_cmdBuffer, "SET_PWM") != NULL || strstr(s_cmdBuffer, "PWM") != NULL) {
        outCmd = CMD_SET_PWM;
        char* pPwm = strstr(s_cmdBuffer, "pwm");
        if (pPwm == NULL) pPwm = strstr(s_cmdBuffer, "PWM");
        if (pPwm != NULL) {
          char* num = pPwm + 3;
          while (*num && (*num < '0' || *num > '9')) num++;
          int val = atoi(num);
          outPwm = (val >= 0 && val <= 255) ? (uint8_t)val : 0;
        }
        return true;
      } else if (strstr(s_cmdBuffer, "CAL_ACS") != NULL) {
        outCmd = CMD_CAL_ACS;
        char* pVal = strstr(s_cmdBuffer, "val");
        if (pVal != NULL) {
          char* num = pVal + 3;
          while (*num && (*num < '0' || *num > '9') && *num != '.') num++;
          outParam = atof(num);
        }
        return true;
      }
    }
  } else if (s_cmdBufferIdx < sizeof(s_cmdBuffer) - 1) {
    s_cmdBuffer[s_cmdBufferIdx++] = c;
  }
  return false;
}

bool checkForIncomingCommand(CommandType& outCmd, uint8_t& outPwm, float& outParam) {
  outCmd = CMD_NONE;
  outPwm = 0;
  outParam = 0.0f;

  // 1. Check USB Serial input
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (processIncomingChar(c, outCmd, outPwm, outParam)) {
      return true;
    }
  }

  // 2. Check Bluetooth Serial input (enables control via mobile phone app)
  while (s_btSerial.available() > 0) {
    char c = (char)s_btSerial.read();
    if (processIncomingChar(c, outCmd, outPwm, outParam)) {
      return true;
    }
  }

  return false;
}
