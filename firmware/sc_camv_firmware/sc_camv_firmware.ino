/**
 * SC-CAMV: Self-Calibrating Multifactor Health and Adaptive Protection Framework
 * Embedded Firmware for Arduino UNO R3 (ATmega328P)
 *
 * Implements:
 * - Safe Stopped Startup (Motor completely de-energized on boot; PWM 0)
 * - Explicit start/stop/PWM commands via USB Serial & HC-05 Bluetooth
 * - Non-blocking sensor acquisition:
 *     * ACS712 Current Sensor (A1)
 *     * MPU6050 Motion & Vibration Sensor (A4/A5, Upside Down Orientation)
 *     * IR Stationary Obstacle Sensor (D2, Active LOW)
 *     * DHT11 Environmental Context Sensor (D4)
 * - Autonomous embedded failsafe protection (independent of PC connection)
 * - LED indicators (D12 Green, D13 Red) & Alarm Buzzer (D6)
 * - Standardized JSON telemetry protocol at 5 Hz (200 ms interval)
 */

#include "config.h"
#include "sensors.h"
#include "actuation.h"
#include "protocol.h"

static uint32_t s_sequenceId = 0;
static uint32_t s_lastSampleMs = 0;
static EmbeddedState s_currentState = EMB_STOPPED;
static bool s_isEmergencyStopped = false;

void setup() {
  // Initialize Serial port (accessible by USB or HC-05 Bluetooth)
  Serial.begin(SERIAL_BAUD_RATE);
  while (!Serial && millis() < 1000); // Brief wait for USB enumeration

  // Initialize sensors and hardware actuation
  initSensors();
  initActuation(); // Motor starts in safe STOPPED state (PWM 0)

  // Announce startup
  Serial.println(F("{\"type\":\"BOOT_READY\",\"firmware\":\"" FIRMWARE_VERSION "\",\"proto\":\"" PROTOCOL_VERSION "\",\"motor\":\"STOPPED\",\"pwm\":0}"));
}

void loop() {
  uint32_t now = millis();

  // ---------------------------------------------------------------------------
  // 1. Process Incoming Commands from Host (PC / Dashboard / Fault Lab)
  // ---------------------------------------------------------------------------
  CommandType cmd;
  uint8_t targetPwm = 0;
  float cmdParam = 0.0f;

  if (checkForIncomingCommand(cmd, targetPwm, cmdParam)) {
    switch (cmd) {
      case CMD_ESTOP:
        s_isEmergencyStopped = true;
        s_currentState = EMB_CRITICAL;
        emergencyStop();
        break;

      case CMD_RESET:
        s_isEmergencyStopped = false;
        s_currentState = EMB_STOPPED;
        stopMotor();
        setSystemStatusLeds(s_currentState);
        break;

      case CMD_START:
        if (!s_isEmergencyStopped) {
          s_currentState = EMB_NORMAL;
          startMotor(targetPwm > 0 ? targetPwm : DEFAULT_DEMO_PWM);
          setSystemStatusLeds(s_currentState);
        }
        break;

      case CMD_STOP:
        s_currentState = EMB_STOPPED;
        stopMotor();
        setSystemStatusLeds(s_currentState);
        break;

      case CMD_SET_PWM:
        if (!s_isEmergencyStopped) {
          setMotorPWM(targetPwm);
          if (targetPwm == 0) {
            s_currentState = EMB_STOPPED;
          } else {
            s_currentState = EMB_NORMAL;
          }
          setSystemStatusLeds(s_currentState);
        }
        break;

      case CMD_CAL_ACS:
        setACS712ZeroOffset(cmdParam);
        break;

      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Periodic Sampling & Telemetry Transmission (5 Hz = 200 ms)
  // ---------------------------------------------------------------------------
  if ((uint32_t)(now - s_lastSampleMs) >= SAMPLE_INTERVAL_MS) {
    s_lastSampleMs = now;

    // Acquire all physical sensors
    SensorReadings readings = readAllSensors();

    // -------------------------------------------------------------------------
    // 3. Autonomous Embedded Local Safety Evaluation
    // Ensures hardware safety even if PC backend or communication link fails
    // -------------------------------------------------------------------------
    if (!s_isEmergencyStopped && isMotorRunning()) {
      bool criticalTrip = false;
      bool warningTrip = false;

      // Overcurrent protection (Stall / Jam condition)
      if (readings.is_curr_valid && readings.curr_a >= FAILSAFE_MAX_CURRENT_A) {
        criticalTrip = true;
      }
      // Severe vibration protection (Mechanical imbalance / Loose mount)
      if (readings.is_mpu_valid && readings.vibe_rms >= FAILSAFE_MAX_VIBE_G) {
        criticalTrip = true;
      }

      // Early warning thresholds
      if (readings.is_curr_valid && readings.curr_a >= 1.60f) {
        warningTrip = true;
      }
      if (readings.is_mpu_valid && readings.vibe_rms >= 1.10f) {
        warningTrip = true;
      }

      if (criticalTrip) {
        s_currentState = EMB_CRITICAL;
        s_isEmergencyStopped = true;
        emergencyStop();
      } else if (warningTrip) {
        s_currentState = EMB_WARNING;
        setSystemStatusLeds(s_currentState);
      } else {
        s_currentState = EMB_NORMAL;
        setSystemStatusLeds(s_currentState);
      }
    } else if (!s_isEmergencyStopped && !isMotorRunning()) {
      s_currentState = EMB_STOPPED;
      setSystemStatusLeds(s_currentState);
    }

    // Determine current motor status string
    const char* motorStr = "STOPPED";
    if (s_isEmergencyStopped) {
      motorStr = "FAULT";
    } else if (isMotorRunning()) {
      motorStr = "RUNNING";
    }

    // -------------------------------------------------------------------------
    // 4. Send Framed Telemetry JSON to Host
    // -------------------------------------------------------------------------
    sendTelemetryFrame(
      s_sequenceId++,
      now,
      readings,
      getActivePWM(),
      motorStr,
      s_currentState
    );
  }
}
