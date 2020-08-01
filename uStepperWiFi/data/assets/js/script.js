/* 
 * G-Code commands 
 */

// Move commands
const GCODE_MOVE 			= "G0";
const GCODE_MOVE_CC 		= "G1";
const GCODE_CONTINUOUS 		= "G2";
const GCODE_CONTINUOUS_CC 	= "G3";
const GCODE_BRAKE 			= "G4";
const GCODE_HOME 			= "G5";

// Miscellaneous commands
const GCODE_STOP 			= "M0"; // Stop everything
const GCODE_SET_SPEED 		= "M1";
const GCODE_SET_ACCEL 		= "M2";
const GCODE_SET_UNIT_ANGLE 	= "M3";
const GCODE_SET_UNIT_STEP 	= "M4";
const GCODE_SET_BRAKE_FREE	= "M5";
const GCODE_SET_BRAKE_COOL 	= "M6";
const GCODE_SET_BRAKE_HARD 	= "M7";
const GCODE_SET_CL_ENABLE 	= "M8"; // Enable closed loop 
const GCODE_SET_CL_DISABLE 	= "M9"; // Disable closed loop
const GCODE_RECORD_START 	= "M10";
const GCODE_RECORD_STOP 	= "M11";
const GCODE_RECORD_ADD 		= "M12";
const GCODE_RECORD_PLAY 	= "M13";
const GCODE_RECORD_PAUSE 	= "M14";
const GCODE_REQUEST_DATA 	= "M15";

// Min interval in ms between each command (not guaranteed)
const wsInterval = 100;
// Address to upload
const fileUploadURL = "/upload";


// Websocket object to be used
var websocket;

// Telemetry returned from device
var telemetry = {
	position: 0.0,
	total: 0.0, 
	velocity: 0.0, 
};

// Flag telling if a sequence is being recorded
var recording = false;

// Flag to check if the last sent command was completed
var commandAck = false;

// Keeping track of numbers of commands sent
var commandsSend = 0;

var initPosition = true; // SHOULD BE FALSE
var websocketCnt = 0;
var silenceWebsocket = 0;


// Element references to modify DOM
var statusBar 		= document.getElementById("comm-status");
var logElement 		= document.getElementById("log");
var pauseBtn		= document.getElementById('pause');
var playBtn			= document.getElementById('play');
var stopBtn			= document.getElementById('stop');
var recordBtn		= document.getElementById('record');
var recordLineBtn	= document.getElementById('recordLine');
var uploadBtn		= document.getElementById('uploadBtn');
var uploadFile		= document.getElementById('uploadFile');
var uploadForm 		= document.getElementById('uploadForm');
var homeBtn			= document.getElementById('homeBtn');
var emergencyBtn	= document.getElementById('emergencyBtn');
var linesElement	= document.getElementById('lines');
var recordingElement = document.getElementById('recording');

var velocityInput = document.getElementById('velocityInput');



// Call this function when the gui is loaded
window.onload = function(){
	// Initiate the websocket connection
	initWebSocket();

	// Load previous made recording
	requestRecording();

	// Always try to reinitiate the Websocket connection
	setInterval(function() {
		if( websocket.readyState != 1 ){
			initWebSocket();
		}

		if( ! initPosition ){
			sendCommand( GCODE_REQUEST_DATA );
		}

		requestRecording();
	}, 3000)
}

// Perform a http request from the browser
// - Used to read the contents of recording.txt on the ESP device
var xhttp = new XMLHttpRequest();

// When the http request's state has changed (request success / failure ) 
xhttp.onreadystatechange = function(){
	if (this.readyState == 4 && this.status == 200) {

		lines = this.responseText.split('\n');
		if( lines.length == 0 ){
			linesElement.innerHTML = "<span class='line'>No lines recorded</span>";
		}

		linesElement.innerHTML = '';
		for(var i = 0;i < lines.length-1;i++){
		    linesElement.innerHTML += "<span class='linenum'>" + (i+1) + ":</span><span class='line'>" + lines[i] + "</span>";
		}

		document.getElementById('record-len').innerHTML = "("+ (lines.length-1) +")";
	}
};

// Perform a http request to read the recording
function requestRecording(){
	xhttp.open("GET", "/recording.txt", true);
	if (xhttp.readyState){
		xhttp.send();
	}
}

// When button "Upload" is clicked, open up the file selector "uploadFile"
uploadBtn.addEventListener('click', function(event){
	// Stop the button from performing any other action
	event.preventDefault()

	// Clear the file selector, and open it up
	uploadFile.value = null;
	uploadFile.click();
});

// When the file selector's state is changed (i.e. when a new file is selected)
uploadFile.onchange = function(){
	var file = this.files[0];

	// files types allowed
	var allowed_types = [ 'text/plain' ];
	if(allowed_types.indexOf(file.type) == -1) {
		alert('File: Incorrect type');
		return;
	}

	// Max 2 MB allowed
	var max_size_allowed = 2*1024*1024
	if(file.size > max_size_allowed) {
		alert('File: Exceeded size 2MB');
		return;
	}

	// Rename file
	var fileData = new FormData();
	fileData.append('file', file, 'recording.txt');

	// Send file
	var request = new XMLHttpRequest();
	request.open("POST", fileUploadURL, true);
	request.send(fileData);

	request.onload = function() {
		// Load the recording into the GUI
		requestRecording();
	}
};

// Play current recording
playBtn.onclick  = function(){
	sendCommand(GCODE_RECORD_PLAY);
}

// Pause current recording
pauseBtn.onclick  = function(){
	sendCommand(GCODE_RECORD_PAUSE);
}

// Add the current position/state to the recording
recordLineBtn.onclick = function(){
	sendCommand(GCODE_RECORD_ADD);

	// Request recording (update the gui)
	requestRecording();
}

// Stop the recording
function stopRecording()
{
	if( recording ){
		sendCommand( GCODE_RECORD_STOP );
		recordBtn.style = "color:white";
		recording = false;
	}
}

// Home the device
homeBtn.onclick = function(){
	// Stop any on-going recording
	stopRecording();

	sendCommand( GCODE_HOME );
	silenceWebsocket = 1;
};

// Stop all operations
emergencyBtn.onclick = function(){
	// Stop any on-going recording
	stopRecording();

	sendCommand( GCODE_STOP );
};

// Start and stop recording
recordBtn.onclick = function(){
	if(! recording ){
		sendCommand( GCODE_RECORD_START );
		recordBtn.style="color:red";
	}else{
		sendCommand( GCODE_RECORD_STOP );
		recordBtn.style="color:white";
	}
	
	// Toggle the recording state and visibility of the add line button
	recording = !recording;
	recordLineBtn.classList.toggle('d-none');
};

// Timer function to keep the 
var websocketInterval = function() {
	// If a connection is established
	joystickControl();
	if(websocket.readyState == 1){
		// If the initial position is received
		if( initPosition ){
			// Toggle between control command and telemetry
			if(websocketCnt === 0){
				velocity = joystickControl();

				if(velocity !== null){
					if( velocity > 0 )
						sendCommand( GCODE_CONTINUOUS, [{name: "A", value: Math.abs(velocity)}] );
					else
						sendCommand( GCODE_CONTINUOUS_CC, [{name: "A", value: Math.abs(velocity)}] );
				}

				websocketCnt = 1;
			}
			else if(websocketCnt === 1){
				sendCommand( GCODE_REQUEST_DATA );
				websocketCnt = 0;
			}
		}
	}

	// Set next timeout
    setTimeout(websocketInterval, wsInterval);
}

function joystickControl(){

	if(angleJoystick.isActive())
	{
		var values = angleJoystick.getRatio();

		var velocity = values.x * velocityInput.value;
		
		return velocity;
	}

	return null;
}

// Function to initialize the websocket communication
function initWebSocket(){
	// If websocket is active, close connection
	if( websocket ){
		websocket.close();
	}
	
	// Initiate the websocket object
	websocket = new WebSocket('ws://192.168.4.1:81/');

	addToLog("Connecting...");
	setStatus("Connecting...", "primary")

	// Add eventlisteners for handling communication with ESP
	websocket.onopen = function(event) { onWsOpen(event) };
	websocket.onclose = function(event) { onWsClose(event) };
	websocket.onmessage = function(event) { onWsMessage(event) };

	// Add eventlistener to close websocket before closing browser
	window.addEventListener('beforeunload', function() {
		websocket.close();
	});

	// Initiate timer to retry the websocket if no connection is made
	setTimeout(websocketInterval, wsInterval);
}

// Function to send a command / gcode through the websocket to the ESP
function sendCommand( command, params = [] ){
	var gcode = command;

	// If any params is to be added
	if( params.length > 0 ){
		var parameters = params.map(e => e.name + e.value ).join(' ');
		gcode += " " + parameters;
	}

	if(websocket.readyState == 1){
		console.log( "Sending: " + gcode);
		websocket.send( gcode );
		commandsSend++;
	}
}

function onWsOpen(event) {
	addToLog("Websocket connection established");
	setStatus("Connected", "success");

	// When connection first is opened, request current position
	sendCommand( GCODE_REQUEST_DATA );
}

function onWsClose(event) {
	addToLog("Websocket connection lost");
	setStatus("No connection", "danger")
}

// Whenever a message is received from the ESP
function onWsMessage(event) {
	var data = event.data;
	
	if( data.includes("OK")) {
		// Please send new command 
		commandAck = true;

	} else if( data.includes("RDY") ){

		commandAck = true;

	// Telemetry == TLM
	} else if( data.includes("TLM") ){

		var data = [];
		// Read data about position and update current positions
		var items = data.split(" ");
		items.shift(); // Remove "TLM" from string

		for (var i in items) {
			// Remove the prefix of each datastring f.x. P, T and S of "TLM P20 T450 S0"
	    	data[i] = items[i].substring(1, items[i].length);
		}

		telemetry.posistion = parseFloat(data[0]);
		telemetry.total 	= parseFloat(data[1]);
		telemetry.velocity 	= parseFloat(data[2]);

		if(!isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)){
			return;
		}

		if(initPosition != true){
			addToLog( "Position received" );
		}

		initPosition = true;
		/* xDisplay.value = pos.x.toFixed(0);
		yDisplay.value = pos.y.toFixed(0);
		zDisplay.value = pos.z.toFixed(0); */
	}
	else if(data.includes("HOMINGDONE"))
	{
		silenceWebsocket = 0;
	}
	else {
		console.log( "Unknown: " +  data );
	}
}

function addToLog( data ){
	var options = { };
	var now = new Date();

	if(logElement.value != ""){
		logElement.value += "\n";
	}

	logElement.value += now.toLocaleTimeString('en-GB', options) + ": " + data;
	logElement.scrollTop = logElement.scrollHeight;
}

function setStatus( text, type ){
	statusBar.className = type;

	textArea = statusBar.getElementsByTagName('span')[0];
	textArea.innerHTML = text;
}

// Map function from Arduino documentation
function map(x, in_min, in_max, out_min, out_max){
	return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

// Joystick object
var angleJoystick = joystick( document.getElementById('joystick'));

// Joystick "class" 
function joystick(parent) {
	// Max lenght from center (in pixels)
	const stickWidth = 80; 

	const stick = document.createElement('div');
	stick.classList.add('joystick');

	stick.addEventListener('mousedown', handleMouseDown, { passive: true });
	document.addEventListener('mousemove', handleMouseMove);
	document.addEventListener('mouseup', handleMouseUp);

	stick.addEventListener('touchstart', handleMouseDown, { passive: true });
	document.addEventListener('touchmove', handleMouseMove);
	document.addEventListener('touchend', handleMouseUp);

	let dragStart = null;
	let active = false;
	let wrapperWidth = null;
	let currentPos = { x: 0, y: 0 };
	let currentRatio = { x: 0.0, y: 0.0 };

	function handleMouseDown(event) {
		stick.style.transition = '0s';
		if (event.changedTouches) {
			dragStart = {
				x: event.changedTouches[0].clientX,
				y: event.changedTouches[0].clientY,
			};
			return;
		}

		dragStart = {
			x: event.clientX,
			y: event.clientY,
		};

		currentPos = { x: 0, y: 0 };
		currentRatio = { x: 0, y: 0 };

		active = true;
	}

	function handleMouseMove(event) {
		if (dragStart === null) return;
		event.preventDefault(); // Prevent scroll on mobile touch of joystick

		wrapperWidth = parent.offsetWidth;

		if (event.changedTouches) {
		 	event.clientX = event.changedTouches[0].clientX;
			event.clientY = event.changedTouches[0].clientY;
		}

		const xDiff = Math.round(event.clientX - dragStart.x);
		const yDiff = Math.round(event.clientY - dragStart.y);
		const angle = Math.atan2(yDiff, xDiff);

		const lenght = Math.hypot(xDiff, yDiff);
		const maxLenght = wrapperWidth/2 - stickWidth/2;

		const distance = Math.min(maxLenght, lenght);

		var xNew = distance * Math.cos(angle);
		var yNew = distance * Math.sin(angle);

		// --- Only move X ---
		yNew = 0;

		stick.style.transform = `translate3d(${xNew}px, ${yNew}px, 0px)`;
		currentPos = { x: xNew, y: yNew };
		currentRatio = { x: xNew/maxLenght, y: yNew/maxLenght};

		active = true;
	}

	function handleMouseUp(event)
	{
		if (dragStart === null) return;

		stick.style.transition = '.2s';
		stick.style.transform = `translate3d(0px, 0px, 0px)`;
		dragStart = null;
		active = false;

		currentPos = { x: 0, y: 0 };
	}

	parent.appendChild(stick);

	return {
		getRatio: () => currentRatio,
		getPosition: () => currentPos,
		isActive: () => active,
	};
}
