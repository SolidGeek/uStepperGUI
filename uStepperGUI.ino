#include <uStepperS.h>
#include "uStepperWiFi/gcode.cpp"
#include "uStepperWifi/constants.h"

#define DEBUGPORT Serial
#define UARTPORT Serial1

uStepperS stepper;
GCode comm;

void setup() {
  DEBUGPORT.begin(115200);
  UARTPORT.begin(115200);
  
  stepper.setup();

  comm.setPort(&DEBUGPORT);
  comm.setDebugPort(&DEBUGPORT);
  comm.enableCRC(false);

  // Add GCode commands
  comm.addCommand( GCODE_MOVE,            &g_move ); 
  comm.addCommand( GCODE_MOVE_CC,         &g_move ); 
  comm.addCommand( GCODE_CONTINUOUS,      &g_setRPM ); 
  comm.addCommand( GCODE_CONTINUOUS_CC,   &g_setRPM ); 
  comm.addCommand( GCODE_BRAKE,           &g_setRPM ); 
  comm.addCommand( GCODE_HOME,            &g_home );

  comm.addCommand( GCODE_STOP,            &g_stop );
  comm.addCommand( GCODE_SET_SPEED,       &g_config );
  comm.addCommand( GCODE_SET_ACCEL,       &g_config );
  comm.addCommand( GCODE_SET_UNIT_ANGLE,  &g_setUnit );
  comm.addCommand( GCODE_SET_UNIT_STEP,   &g_setUnit );
  comm.addCommand( GCODE_SET_BRAKE_FREE,  &g_setbrake );
  comm.addCommand( GCODE_SET_BRAKE_FREE,  &g_setbrake );
  comm.addCommand( GCODE_SET_BRAKE_COOL,  &g_setbrake );
  comm.addCommand( GCODE_SET_BRAKE_HARD,  &g_setbrake );
  comm.addCommand( GCODE_SET_CL_ENABLE,   &g_config );
  comm.addCommand( GCODE_SET_CL_DISABLE,  &g_config );
  comm.addCommand( GCODE_REQUEST_DATA,    &g_sendData );
  
  comm.addCommand( GCODE_RECORD_START,  &g_record );
  comm.addCommand( GCODE_RECORD_STOP,   &g_record );
  comm.addCommand( GCODE_RECORD_ADD,    &g_record );
  comm.addCommand( GCODE_RECORD_PLAY,   &g_record );
  comm.addCommand( GCODE_RECORD_PAUSE,  &g_record );

  // Called if the packet and checksum is ok, but the command is unsupported
  comm.addCommand( NULL, g_default ); 

  // Show list off all commands
  comm.listCommands();
  DEBUGPORT.println("Ready");
}

void loop() {
  comm.listen();
}

/* 
 * --- GCode function handlers ---
 * Used by the GCode class to handle the different commands
 */

void g_default(char * cmd, char *data){
  Serial.println("Unsupported command");  
}

void g_move(char *cmd, char *data){
  int steps = 0;
  comm.value("A", &steps);
  
  if( !strcmp(cmd, GCODE_MOVE ))
    stepper.moveSteps(steps); 
  else if( !strcmp(cmd, GCODE_MOVE_CC ))
    stepper.moveSteps(-steps); 
}

void g_setRPM(char *cmd, char *data){
  float velocity = 0.0;
  comm.value("A", &velocity);

  if( !strcmp(cmd, GCODE_CONTINUOUS ))
    stepper.setRPM(velocity);
  else if( !strcmp(cmd, GCODE_CONTINUOUS_CC ))
    stepper.setRPM(-velocity);
}

void g_home(char *cmd, char *data){ stepper.moveToEnd( CW ); }

void g_stop(char *cmd, char *data){ stepper.stop(); }

void g_setbrake(char *cmd, char *data){
  if( !strcmp(cmd, GCODE_SET_BRAKE_FREE ))
    stepper.setBrakeMode(FREEWHEELBRAKE);
  else if( !strcmp(cmd, GCODE_SET_BRAKE_COOL ))
    stepper.setBrakeMode(COOLBRAKE);
  else if( !strcmp(cmd, GCODE_SET_BRAKE_HARD ))
    stepper.setBrakeMode(HARDBRAKE);
}

void g_config(char *cmd, char *data){
}

void g_setUnit(char *cmd, char *data){
}

void g_sendData(char *cmd, char *data){
  float angle = stepper.angleMoved();
  int32_t velocity = stepper.driver.getVelocity();
  
  char buf[50] = {'\0'};
  char tempAngle[10] = {'\0'};

  dtostrf(angle, 4, 2, tempAngle);
  
  strcat(buf, "DATA ");
  sprintf(buf + strlen(buf), "A%s V%d", tempAngle, velocity);

  comm.send(buf);
}

/** Implemented on the WiFi shield */
void g_record(char *cmd, char *data){}
