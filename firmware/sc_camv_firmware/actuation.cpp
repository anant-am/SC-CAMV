#include "actuation.h"

static uint8_t s_currentPwm = 0;       // Strictly defaults to 0 on boot!
static bool s_motorRunning = false;
static uint32_t s_lastBuzzerToggleMs = 0;
static bool s_buzzerState = false;

void initActuation() {
  // L293D motor driver pins
  pinMode(PIN_MOTOR_EN1, OUTPUT);
  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);

  // Status indicator LEDs & Buzzer
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // Mandatory Safety Rule: Motor starts in a completely de-energized, stopped state
  analogWrite(PIN_MOTOR_EN1, 0);
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  s_currentPwm = 0;
  s_motorRunning = false;

  // Indicators: Green on (system initialized and monitoring, motor stopped)
  digitalWrite(PIN_LED_GREEN, HIGH);
  digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  // Short 40ms boot confirmation chirp
  digitalWrite(PIN_BUZZER, HIGH);
  delay(40);
  digitalWrite(PIN_BUZZER, LOW);
}

void startMotor(uint8_t pwm) {
  if (pwm == 0) pwm = DEFAULT_DEMO_PWM; // Default to PWM 100 if unspecified
  s_currentPwm = pwm;
  s_motorRunning = true;

  // Forward direction on L293D: IN1=HIGH, IN2=LOW
  digitalWrite(PIN_MOTOR_IN1, HIGH);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  analogWrite(PIN_MOTOR_EN1, s_currentPwm);
}

void setMotorPWM(uint8_t pwm) {
  s_currentPwm = pwm;
  if (s_currentPwm > 0 && s_motorRunning) {
    digitalWrite(PIN_MOTOR_IN1, HIGH);
    digitalWrite(PIN_MOTOR_IN2, LOW);
    analogWrite(PIN_MOTOR_EN1, s_currentPwm);
  } else {
    stopMotor();
  }
}

void stopMotor() {
  s_currentPwm = 0;
  s_motorRunning = false;
  analogWrite(PIN_MOTOR_EN1, 0);
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);
}

void emergencyStop() {
  stopMotor();
  // Force RED warning LED and alert buzzer
  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_RED, HIGH);
  digitalWrite(PIN_BUZZER, HIGH);
}

void setSystemStatusLeds(EmbeddedState state) {
  switch (state) {
    case EMB_STOPPED:
    case EMB_NORMAL:
      digitalWrite(PIN_LED_GREEN, HIGH);
      digitalWrite(PIN_LED_RED, LOW);
      digitalWrite(PIN_BUZZER, LOW);
      break;

    case EMB_WARNING:
      // Warning: Red LED on, Green LED off, buzzer pulsed non-blocking
      digitalWrite(PIN_LED_GREEN, LOW);
      digitalWrite(PIN_LED_RED, HIGH);
      if (millis() - s_lastBuzzerToggleMs > 250) {
        s_lastBuzzerToggleMs = millis();
        s_buzzerState = !s_buzzerState;
        digitalWrite(PIN_BUZZER, s_buzzerState ? HIGH : LOW);
      }
      break;

    case EMB_CRITICAL:
    case EMB_LOCKOUT:
      digitalWrite(PIN_LED_GREEN, LOW);
      digitalWrite(PIN_LED_RED, HIGH);
      digitalWrite(PIN_BUZZER, HIGH);
      break;
  }
}

void soundAlarmBuzzer(bool enable) {
  digitalWrite(PIN_BUZZER, enable ? HIGH : LOW);
}

uint8_t getActivePWM() {
  return s_currentPwm;
}

bool isMotorRunning() {
  return s_motorRunning;
}
