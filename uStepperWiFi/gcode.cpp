#include "GCode.h"

GCode::GCode(void) {
	this->commandCount = 0;

	// Load default sender responses
	strcpy(this->validRes, GCODE_DEFAULT_VALID_RES);
	strcpy(this->errorRes, GCODE_DEFAULT_ERROR_RES);
}

void GCode::addCommand( char * command, void (*func)(char *command, char *data) ){

	if( command == NULL ){
		this->defaultFunc = func;
		return;
	}

	command_func_t entry;

	entry.func = func;
	strcpy( entry.command, command );

	if(commandCount == 0){
		// Allocate memory to the first command in the list.
		this->commands = malloc( sizeof(command_func_t) ); // Probably should allocate more than one at start, however would need an index to keep track of used memory  
	}else{
		this->commands = realloc(this->commands, (1 + this->commandCount) * sizeof(command_func_t));
	}

	this->commands[this->commandCount++] = entry;

}

void GCode::listen( void ){

	this->status = this->read();

	if (this->status == GCODE_PACKET_READY) {

		// A packet is retrieved, loop through commands to see if any matches 
		for (uint8_t i = 0; i < commandCount; ++i)
		{
			char *command = this->commands[i].command;

			if( this->check( command ) ){
				// Return a response to sender
				this->serialPort->println(this->validRes);

				// We got a match, call the function pointer associated with this command
				this->commands[i].func( command, this->packet);
				return;
			}
		}

		// No match was found, call defaultFunc if defined
		if( this->defaultFunc != NULL )
			this->defaultFunc( NULL , this->packet );

	}else if ( this->status != GCODE_PACKET_NONE ){
		// Return a response to sender
		this->serialPort->print(this->errorRes);
		this->serialPort->print(": ");
		this->serialPort->println(this->status);
	}
}

void GCode::listCommands( void ){

	if( this->debugPort == NULL )
		return;

	this->debugPort->println( "Supported commands:" );
	for (uint8_t i = 0; i < this->commandCount; ++i)
	{	
		this->debugPort->print("- ");
		this->debugPort->println(this->commands[i].command);
	}

}

void GCode::setPort(Stream *port) { 
	this->serialPort = port;
}

void GCode::setDebugPort(Stream *port){
	this->debugPort = port;
}

void GCode::enableCRC(bool state){
	this->useCRC = state;
}

bool GCode::check(char *cmd ) {
	return this->check( cmd, this->packet );
}

bool GCode::check(char *cmd, char *packet ) {
	char buf[10] = {'\0'};
	uint8_t len = 0;

	// The first part is always the command
	char *start = &packet[0];
	char *end = strpbrk(packet, " \n");

	// If no end is found, the command is the entire packet
	if( end == NULL ){
		len = strlen(packet);
	}else{
		len = end - start;
	}

	strncpy(buf, packet, len);
	
	if (strcmp(buf, cmd) == 0) {
		return true;
	}
	return false;
}

char *GCode::getPacket(void) {
	return this->packet;
}

uint8_t GCode::getStatus(void){
	return this->status;
}

void GCode::setPacket(char * p){
	strncpy(this->packet, p, MAX_PACKET_SIZE);
}

bool GCode::value(char *name, float *var) {
	// If no packet is supplied, work on the latests in buffer
	return this->value(name, var, this->packet);
}

bool GCode::value(char *name, int *var) {
	// If no packet is supplied, work on the latests in buffer
	return this->value(name, var, this->packet);
}

bool GCode::value(char *name, int *var, char *packet ){
	float temp = 0.0;

	this->value(name, &temp, packet );

	*var = (int)temp;
}

bool GCode::value(char *name, float *var, char *packet ) {
	char *start;
	char *end;
	size_t len;

	char buf[20] = {'\0'};

	// Find start of parameter value
	if (start = strstr(packet, name)) {

		// Not interested in the param name, f.x. the X in "G1 X10"
		start++;

		// Find end of parameter value by searching for a space or newline
		if (end = strpbrk(start, " \n")) {
			len = end - start;

			strncpy(buf, start, len);
			buf[len] = '\0';

			// Now convert the string in buf to a float
			*var = atof(buf);

			return true;
		}
	}

	return false;
}

uint8_t GCode::read(void) {

	static bool inPacket = false; 	// New packet is incoming
	static uint32_t lastChar = 0; 	// When last byte was received
	static uint8_t packetLen = 0;	// Lenght of current packet

	char buf;		 // Variable to hold each new byte
	float crc; // Variable to hold checksum 
	char *crcStart;

	// If no packet is incoming, and some old packet is still in the buffer
	if ( inPacket == false && packetLen > 0) {
		packetLen = 0;
		memset(this->packet, 0, sizeof(this->packet));
	}

	// If data is received on the serial port
	if (this->serialPort->available() > 0) {
		lastChar = micros();

		// Read the newest char from the UART buffer
		buf = this->serialPort->read();

		// Save the char in the buffer ( but limited by MAX_PACKET_SIZE )
		if (packetLen < MAX_PACKET_SIZE - 1) {
			this->packet[packetLen++] = buf;
		}else{
			return GCODE_PACKET_OVERFLOW;
		}

		// A new packet is being read.
		inPacket = true;
	}

	// If the timeout has been reached, or a newline has been received the string is complete
	if ((micros() - lastChar >= PACKET_TIMEOUT || buf == '\n') && inPacket == true) {
		inPacket = false;

		if( !this->useCRC ){

			return GCODE_PACKET_READY;
		
		}else if (this->value("*", &crc)) { // Check for checksum
			// Checksum appended, check if it correct
			if ((uint8_t)crc == 0xff) {
				return GCODE_PACKET_READY;
			}else{
				return GCODE_PACKET_CRC_UNVALID;
			}
		}else{
			return GCODE_PACKET_CRC_MISSING;
		}
	}

	return GCODE_PACKET_NONE;
}

void GCode::send(char *command) { 
	this->send(command, this->useCRC);
}

void GCode::send(char *command, bool checksum)
{
	char buf[MAX_PACKET_SIZE] = {'\0'};
	strcpy(buf, command);

	if (checksum) {
		strcat(buf, " *255"); // Append checksum, should be calculated from entire string
	}

	this->serialPort->println(buf); // Always append a newline to indicate end of command
}
