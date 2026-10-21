#ifndef SC_CAMV_PROTOCOL_H
#define SC_CAMV_PROTOCOL_H

#include <Arduino.h>
#include "sensors.h"
#include "actuation.h"

void sendTelemetryFrame(
  uint32_t seq,
  uint32_t timestampMs,
  const SensorReadings& r,
  uint8_t activePwm,
  const char* motorStateStr,
  EmbeddedState state
);

enum CommandType {
  CMD_NONE = 0,
  CMD_START,
  CMD_STOP,
  CMD_SET_PWM,
  CMD_ESTOP,
  CMD_RESET,
  CMD_CAL_ACS,
  CMD_SET_IR_POL
};

bool checkForIncomingCommand(CommandType& outCmd, uint8_t& outPwm, float& outParam);

#endif // SC_CAMV_PROTOCOL_H
