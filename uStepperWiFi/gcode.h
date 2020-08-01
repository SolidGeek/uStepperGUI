#ifndef GCODE_H_
#define GCODE_H_

#include <Arduino.h>
#include <stdio.h>
#include <string.h>


#define MAX_PACKET_SIZE 50
#define MAX_COMMAND_SIZE 5
/* Time before a packet is considered received in microseconds */
#define PACKET_TIMEOUT 500

#define GCODE_DEFAULT_VALID_RES "OK"
#define GCODE_DEFAULT_ERROR_RES "ERROR"

// States for packet
typedef enum {
	GCODE_PACKET_NONE = 0,
	GCODE_PACKET_READY,
	GCODE_PACKET_CRC_UNVALID,
	GCODE_PACKET_CRC_MISSING,
	GCODE_PACKET_OVERFLOW,
} packet_state_t;

// Structure to hold gcode commands and functions to call
typedef struct {
	char command[MAX_COMMAND_SIZE];
	void (*func)(char *command, char *data);
} command_func_t;


class GCode {

	public:
		GCode(void);

		void setPort(Stream *port);
		void setDebugPort(Stream *port);

		void setValidRes( const char * str );
		void setErrorRes( const char * str );
		void enableCRC( bool state );

		/* listen() called in the main loop to read incoming Serial 
		 * If function returns true, a new packet is ready to be processed. Process, otherwise it will be lost to next packet.
		 */
		void listen(void);

		/* Send commands over the serial port */ 
		void send(char *command);
		void send(char *command, bool checksum);

		/* Extract value from the packet, f.x. X10.0 */
		bool value(char *name, float *var);
		bool value(char *name, int *var);
		bool value(char *name, float *var, char *packet);
		bool value(char *name, int *var, char *packet);

		/* Check if packet contains command, f.x. G0 */
		bool check(char *cmd);
		bool check(char *cmd, char *packet );

		/* Get the newest packet for manuel inspection */
		char *getPacket(void);

		uint8_t getStatus(void);

		void setPacket(char * packet);

		void addCommand( char * command, void (*func)(char *command, char *data) );

		void listCommands( void );

	private:
		/* Variabel to hold the reference to the Serial object */
		Stream *serialPort = NULL;
		Stream *debugPort = NULL;

		/* Packet buffer to hold the actual received packet */
		char packet[MAX_PACKET_SIZE];

		uint8_t status = 0; 

		// Will contain a list of commands and function pointers
		command_func_t * commands = NULL; 

		// Number of commands added to gcode handler
		uint8_t commandCount = 0;

		// Pointer to default function if there is no gcode match
		void (*defaultFunc)(char *command, char *data);

		/* Function to read actual bytes from serial and build packet (is not blocking) */
		uint8_t read(void);

		char validRes[10];
		char errorRes[10]; 

		bool useCRC = false;
};

#endif