#include <uStepperS.h>
#include "uStepperWiFi/gcode.cpp"
#include "uStepperWifi/constants.h"

#define DEBUGPORT Serial
#define UARTPORT Serial1

uStepperS stepper;
GCode comm;

void setup() {

  // DEBUGPORT.begin(115200);
  UARTPORT.begin(115200);
  
  stepper.setup();

  comm.setSendFunc(&uart_send);
  
  // Add GCode commands
  comm.addCommand( GCODE_MOVE,            &uart_move ); 
  comm.addCommand( GCODE_MOVE_CC,         &uart_move ); 
  comm.addCommand( GCODE_CONTINUOUS,      &uart_setRPM ); 
  comm.addCommand( GCODE_CONTINUOUS_CC,   &uart_setRPM ); 
  comm.addCommand( GCODE_BRAKE,           &uart_setRPM ); 
  comm.addCommand( GCODE_HOME,            &uart_home );

  comm.addCommand( GCODE_STOP,            &uart_stop );
  comm.addCommand( GCODE_SET_SPEED,       &uart_config );
  comm.addCommand( GCODE_SET_ACCEL,       &uart_config );
  comm.addCommand( GCODE_SET_BRAKE_FREE,  &uart_setbrake );
  comm.addCommand( GCODE_SET_BRAKE_COOL,  &uart_setbrake );
  comm.addCommand( GCODE_SET_BRAKE_HARD,  &uart_setbrake );
  comm.addCommand( GCODE_SET_CL_ENABLE,   &uart_config );
  comm.addCommand( GCODE_SET_CL_DISABLE,  &uart_config );
  
  comm.addCommand( GCODE_RECORD_START,  &uart_record );
  comm.addCommand( GCODE_RECORD_STOP,   &uart_record );
  comm.addCommand( GCODE_RECORD_ADD,    &uart_record );
  comm.addCommand( GCODE_RECORD_PLAY,   &uart_record );
  comm.addCommand( GCODE_RECORD_PAUSE,  &uart_record );
  
  comm.addCommand( GCODE_REQUEST_DATA,    &uart_sendData );

  // Called if the packet and checksum is ok, but the command is unsupported
  comm.addCommand( NULL, uart_default );

  // Show list off all commands
  // comm.printCommands();
}

void loop() {
  // Process serial data, and call functions if any commands if received.
  comm.run();

  // Feed the gcode handler serial data
  if( UARTPORT.available() > 0 )
    comm.insert( UARTPORT.read() );
}


/* 
 * --- GCode functions ---
 * Used by the GCode class to handle the different commands and send data
 */
 
void uart_send( char * data ){
  UARTPORT.print(data);  
}

void uart_default(char * cmd, char *data){
  comm.send("Unknown");  
}

void uart_move(char *cmd, char *data){
  int steps = 0;
  comm.value("A", &steps);
  
  if( !strcmp(cmd, GCODE_MOVE ))
    stepper.moveSteps(steps); 
  else if( !strcmp(cmd, GCODE_MOVE_CC ))
    stepper.moveSteps(-steps); 

  comm.send("OK");
}

void uart_setRPM(char *cmd, char *data){
  float velocity = 0.0;
  comm.value("A", &velocity);

  if( !strcmp(cmd, GCODE_CONTINUOUS ))
    stepper.setRPM(velocity);
  else if( !strcmp(cmd, GCODE_CONTINUOUS_CC ))
    stepper.setRPM(-velocity);

  comm.send("OK");
}

void uart_home(char *cmd, char *data){ 
  stepper.moveToEnd( CW );
  stepper.encoder.setHome(); // Reset home position
  comm.send("DONE"); // Tell GUI homing is done
}

void uart_stop(char *cmd, char *data){
  stepper.stop();
  comm.send("OK");
}

void uart_setbrake(char *cmd, char *data){
  if( !strcmp(cmd, GCODE_SET_BRAKE_FREE ))
    stepper.setBrakeMode(FREEWHEELBRAKE);
  else if( !strcmp(cmd, GCODE_SET_BRAKE_COOL ))
    stepper.setBrakeMode(COOLBRAKE);
  else if( !strcmp(cmd, GCODE_SET_BRAKE_HARD ))
    stepper.setBrakeMode(HARDBRAKE);
  comm.send("OK");
}

void uart_config(char *cmd, char *data){
}

void uart_sendData(char *cmd, char *data){
  char buf[50] = {'\0'};
  char strAngle[10] = {'\0'};
  char strVelocity[10] = {'\0'};
  
  float angle = stepper.angleMoved();
  float velocity = stepper.encoder.getRPM();
  
  dtostrf(angle, 4, 2, strAngle);
  dtostrf(velocity, 4, 2, strVelocity);
  
  strcat(buf, "DATA ");
  sprintf(buf + strlen(buf), "A%s V%s", strAngle, strVelocity);

  comm.send(buf);
}

/** Implemented on the WiFi shield */
void uart_record(char *cmd, char *data){}
