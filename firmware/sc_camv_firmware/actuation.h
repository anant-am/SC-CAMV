#ifndef SC_CAMV_ACTUATION_H
#define SC_CAMV_ACTUATION_H

#include <Arduino.h>
#include "config.h"

enum EmbeddedState {
  EMB_STOPPED = 0,
  EMB_NORMAL = 1,
  EMB_WARNING = 2,
  EMB_CRITICAL = 3,
  EMB_LOCKOUT = 4
};

void initActuation();
void startMotor(uint8_t pwm);
void setMotorPWM(uint8_t pwm);
void stopMotor();
void emergencyStop();
void setSystemStatusLeds(EmbeddedState state);
void soundAlarmBuzzer(bool enable);
uint8_t getActivePWM();
bool isMotorRunning();

#endif // SC_CAMV_ACTUATION_H
