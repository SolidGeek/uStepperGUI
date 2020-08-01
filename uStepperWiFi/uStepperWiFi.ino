#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
#include <WebSocketsServer.h>
// Include SPIFFS filesystem
#include "FS.h"
// Include GCode class
#include "test/GCode.h"
#include <WebOTA.h>

ESP8266WebServer server(80);
WebSocketsServer websocket = WebSocketsServer(81);
bool startOTA = 0;
GCode link;

const char* VERSION = "0.1.0";
const char *ssid = "uStepper GUI";
const char *password = "12345679";

bool isRecording = false;
bool playRecording = false;
uint32_t lastPackage = 0;
char * response = NULL;
int32_t playStepsDelay = 0;
// Led blinking variables
bool ledState = LOW;
uint8_t statusLed = 4;
uint32_t previousBlink = 0;

// Local path to save the GCode recordings
char recordPath[] = "/recording.txt";
uint16_t recordLineCount = 0;
bool positionReached = false;
double angle;

void setup() {
  // Init Serial port for UART communication
  Serial.begin(115200);
  link.setSerialPort(&Serial);
  link.setBufferSize(1);

  // Built-in LED is pin 5
  pinMode(statusLed, OUTPUT);
  initSPIFFS();

  webota.init(&server, "/webota");

  initWiFi();
  initWebsocket();
  initWebserver();
}
    
void loop() {

  websocket.loop();
  server.handleClient();

  // Listen for messages coming from master
  if (link.run()) {

    // Read newest response from fifo buffer
    response = link.getNextValue();

    // If response is telemetry, pull the values from the message and send to ESP
    if (link.check("TLM", response) ) {
      link.value("A", &angle); // Angle of motor "A"
      
      websocket.broadcastTXT(response);
    }
    // For knowing when the latest sent line from the recording is reached
    else if (link.check("REACHED", response)) {
      positionReached = true;
      playStepsDelay = millis() + 1000;
    }
    else {
      // Probably an error or other important information, send it to GUI for inspection
      websocket.broadcastTXT(response);
    }
  }

  if (playRecording) {

    // Send next line from the recording
    if( positionReached ){
      if(millis() > playStepsDelay)
      {
        positionReached = false;
    
        playNextLine();
      }
    }
    
  }

  if (millis() - lastPackage < 500) {
    if (millis() - previousBlink >= 100) {
      previousBlink = millis();
      ledState = !ledState;
      digitalWrite(statusLed, ledState);
    }
  } else {
    if (WiFi.softAPgetStationNum() > 0) 
      digitalWrite(statusLed, LOW);
    else
      digitalWrite(statusLed, HIGH);
  }
}


void playNextLine( void ){
  
  File file = SPIFFS.open(recordPath, "r");
  file.setTimeout(0); // Set timeout when no newline was found (no timeout plz).

  // Buffer to load each line into
  char buf[50];
  uint8_t len = 0;

  // Read through all lines until the wanted line is reached... Is there a better way?
  for(uint16_t i = 0; i <= recordLineCount; i++){
    memset(buf, 0, sizeof(buf));
    
    len = file.readBytesUntil('\n', buf, 50);
  }

  // Check if any line was read
  if (len != 0){
    
    // Append null termination to the buffer for good measure
    buf[len] = '\0'; 
    
    char command[100] = {'\0'};
    
    strcat(command, "G1 ");
    strcat(command, buf);
    strcat(command, " F10.0"); // Set feedrate to 10mm/s 

    // For debugging
    websocket.broadcastTXT("Playing line " + String(recordLineCount) + ": " + String(command));
    
    link.send(command, false); // False = do not add checksum

    recordLineCount++;
  }else{
    recordLineCount = 0;  
    playRecording = false;
    playStepsDelay = 0;
  }
}

void saveData(char *data) {

  // Open file and keep appending
  File f = SPIFFS.open(recordPath, "a");

  f.println(data);
  f.close();
}

void clearData( void ){
  // Open file and keep appending
  File f = SPIFFS.open(recordPath, "w");

  f.print("");
  f.close();
}

// Process data being send from GUI by webSocket
void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t len) {

  // Pointer to hold reference to received payload
  char *packet;
  static bool test = 0;
  // Buffer for temporary storage
  char commandBuffer[50] = {'\0'};

  if (type == WStype_TEXT) {
    lastPackage = millis();

    packet = (char *)payload;

    // Emergency stop, set all motor speeds to zero
    if (strstr(packet, "M0")) {
      playRecording = false;
      link.send("M10 X0.0 Y0.0 Z0.0");
    }

    // Start new recording
    else if (strstr(packet, "M2")) {
      clearData();
      isRecording = true;
      return;
    }

    // Stop recording
    else if (strstr(packet, "M3")) {
      isRecording = false;
    }

    // If a M10 command (xyz speeds) is received while playing drop the message
    else if( strstr( packet, "M10")){
      if(playRecording)
        return;
    }

    // Play recording
    else if (strstr(packet, "M11")) {
      if( playRecording ){
        // Reset playback of recording
        recordLineCount = 0;  
      }
      playRecording = true;
      positionReached = true; // In order to get playNextLine started.
      return;
    }

    // Pause recording
    else if (strstr(packet, "M12")) {
      playRecording = false;
      return;
    }

    // Add line to recording
    else if (strstr(packet, "M13")) {
      char temp[50] = {'\0'};
      String recording = "A" + String(angle);
      recording.toCharArray(temp, sizeof(temp));
  
      saveData(temp);
      return;
    }

    // Afterwards, just pass the data on to the uStepper
    strcpy(commandBuffer, packet);

    // Send GCode over UART
    link.send(commandBuffer);
  }
}

void initWebsocket(void) {
  websocket.begin();
  websocket.onEvent(webSocketEvent);
}

void initWebserver(void) {
  // Page handlers
  server.serveStatic("/", SPIFFS, "/index.html"); // Main website structure
  server.serveStatic("/assets/css/framework.css", SPIFFS, "/assets/css/framework.css"); // Responsive framework for the GUI
  server.serveStatic("/assets/css/fonticons.css", SPIFFS, "/assets/css/fonticons.css"); // Icon pack
  server.serveStatic("/assets/css/style.css", SPIFFS, "/assets/css/style.css"); // Main website style
  server.serveStatic("/assets/js/script.js", SPIFFS,"/assets/js/script.js"); // Javascript functionalities
  server.serveStatic("/assets/font/fonticons.ttf", SPIFFS,"/assets/font/fonticons.ttf"); // Javascript functionalities
  server.serveStatic("/assets/logo.png", SPIFFS,"/assets/logo.png"); // Javascript functionalities
  server.serveStatic(recordPath, SPIFFS, recordPath);
  server.on("/upload", HTTP_POST,[](){ server.send(200); }, uploadJob );
  server.begin();
}

void initWiFi(void) {
  if (!WiFi.softAP(ssid, password)) {
    Serial.println("Failed to initialise WiFi");
  }
}

void initSPIFFS(void) {
  // Begin file-system
  if (!SPIFFS.begin()) {
    Serial.println("Failed to initialise SPIFFS");
  }
}

File recordFile;

// Upload a new file to the SPIFFS
void uploadJob( void ){

  HTTPUpload& upload = server.upload();
   
  if( upload.status == UPLOAD_FILE_START){
    String filename = upload.filename;

    if( ! filename.equals("recording.txt") ){
      server.send(500, "text/plain", "Wrong filename");
      return;
    }else{
      if(!filename.startsWith("/")) filename = "/"+filename;
    
      // Open the file for writing in SPIFFS (create if it doesn't exist)
      recordFile = SPIFFS.open(filename, "w");  
    }
           
  } else if(upload.status == UPLOAD_FILE_WRITE){
    if(recordFile){
       recordFile.write(upload.buf, upload.currentSize); // Write the received bytes to the file
    }
     
  } else if(upload.status == UPLOAD_FILE_END){
    if(recordFile) { // If the file was successfully created
      recordFile.close(); // Close the file again
      server.send(303);
    } else {
      server.send(500, "text/plain", "Couldn't create file");
    }
  }
}
