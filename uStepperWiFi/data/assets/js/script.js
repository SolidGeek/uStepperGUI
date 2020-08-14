/* 
 * G-Code commands 
 */

const FULLSTEPS = 200;
const MICROSTEPS = 256;
const STEPS_PER_REV = FULLSTEPS * MICROSTEPS;
const DEGREES_PER_REV = 360;

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
const GCODE_SET_BRAKE_FREE	= "M3";
const GCODE_SET_BRAKE_COOL 	= "M4";
const GCODE_SET_BRAKE_HARD 	= "M5";
const GCODE_SET_CL_ENABLE 	= "M6"; // Enable closed loop 
const GCODE_SET_CL_DISABLE 	= "M7"; // Disable closed loop

const GCODE_RECORD_START 	= "M10";
const GCODE_RECORD_STOP 	= "M11";
const GCODE_RECORD_ADD 		= "M12";
const GCODE_RECORD_PLAY 	= "M13";
const GCODE_RECORD_PAUSE 	= "M14";
const GCODE_REQUEST_DATA 	= "M15";
const GCODE_REQUEST_CONFIG	= "M16";


const APP_UNIT_DEGREES = 0;
const APP_UNIT_STEPS = 1;

// Min interval in ms between each command (not guaranteed)
const wsInterval = 50;
// Address to upload
const fileUploadURL = "/upload";


// Websocket object to be used
var websocket;

// Telemetry returned from device
var tlm = {
	position: 0.0,
	absPosition: 0.0, 
	steps: 0, // Steps directly from driver
	absSteps: 0,
	encoderVelocity: 0.0, 
	driverVelocity: 0.0,
};

var conf = {
	velocity: 0.0,
	acceleration: 0.0,
	brake: 0,
	closedLoop: 0
};

// Flag telling if a sequence is being recorded
var recording = false;

// Flag to check if the last sent command was completed
var commandAck = false;

// Keeping track of numbers of commands sent
var commandsSend = 0;

var initConfig = false;
var websocketCnt = 0;
var silenceWebsocket = 0;

var lastCommand = "";
var positionUnit = APP_UNIT_DEGREES;

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

var dataPositionElm		= document.getElementById('dataPosition');
var dataAbsPositionElm 	= document.getElementById('dataAbsPosition');
var dataVelocityElm		= document.getElementById('dataVelocity');

var dataPositionDriverElm		= document.getElementById('dataPositionDriver');
var dataAbsPositionDriverElm	= document.getElementById('dataAbsPositionDriver');
var dataVelocityDriverElm		= document.getElementById('dataVelocityDriver');

var velocityInput 		= document.getElementById('velocityInput');
var accelerationInput 	= document.getElementById('accelerationInput');
var moveInput 			= document.getElementById('moveInput');
var moveCWBtn 			= document.getElementById('moveCWBtn');
var moveCCWBtn 			= document.getElementById('moveCCWBtn');
var anglePointer 		= document.getElementById('anglePointer');
var closedLoopCheck 	= document.getElementById('closedLoopCheck');

var unitsRadios = document.getElementsByName('unit'); 
var brakeRadios = document.getElementsByName('brake'); 

var positionUnitElm = document.getElementsByClassName('positionUnit');

var loaderElm = document.getElementById('loader');



for (var i = 0; i < unitsRadios.length; i++) {
	unitsRadios[i].addEventListener('change', function(event) {
		var value = event.target.value;
		var moveunit = document.getElementById('moveInputWrapper');

		var string = "";

		switch( value ){
			case "degress":
				positionUnit = APP_UNIT_DEGREES;
				moveunit.classList.remove('unit-step');
				moveunit.classList.add('unit-degree');
				string = "°";
			break;

			case "steps":
				positionUnit = APP_UNIT_STEPS;
				moveunit.classList.remove('unit-degree');
				moveunit.classList.add('unit-step');
				string = "steps";
			break;
		}

		for (var i = 0; i < positionUnitElm.length; i++) {
			positionUnitElm[i].innerHTML = string;
		}
	});
}

for (var i = 0; i < brakeRadios.length; i++) {
	brakeRadios[i].addEventListener('change', function(event) {
		var value = event.target.value;

		switch( value ){
			case "free":
				sendCommand(GCODE_SET_BRAKE_FREE);
			break;

			case "cool":
				sendCommand(GCODE_SET_BRAKE_COOL);
			break;

			case "hard":
				sendCommand(GCODE_SET_BRAKE_HARD);
			break;
		}
	});
}

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

		if( ! initConfig ){
			sendCommand( GCODE_REQUEST_CONFIG );
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
	requestTlm = false;
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


moveCWBtn.onclick = function(){

	var step = 0;

	if( positionUnit == APP_UNIT_DEGREES)
		step = Math.round(moveInput.value * (STEPS_PER_REV/360.0));
	else
		step = Math.round(moveInput.value * MICROSTEPS);

	sendCommand( GCODE_MOVE, [{name: "A", value: Math.abs(step)}] );

}

moveCCWBtn.onclick = function(){

	var step = 0;

	if( positionUnit == APP_UNIT_DEGREES)
		step = Math.round(moveInput.value * (STEPS_PER_REV/360.0));
	else
		step = Math.round(moveInput.value * MICROSTEPS);

	sendCommand( GCODE_MOVE_CC, [{name: "A", value: Math.abs(step)}] );

}

closedLoopCheck.onchange = function(){
	var state = closedLoopCheck.checked;
	
	if( state == true ){
		sendCommand( GCODE_SET_CL_ENABLE );
	}else{
		sendCommand( GCODE_SET_CL_DISABLE );
	}
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

var lastVelocity = 0.0;

// Timer function to keep the 
var websocketInterval = function() {

    // If a connection is established
	if(websocket.readyState == 1){
		// If the initial position is received
		if( initConfig ){
			// Toggle between control command and telemetry
			if(websocketCnt === 0){
				velocity = joystickControl();

				if(velocity != lastVelocity){
					if( velocity > 0 )
						sendCommand( GCODE_CONTINUOUS, [{name: "A", value: Math.abs(velocity)}] );
					else
						sendCommand( GCODE_CONTINUOUS_CC, [{name: "A", value: Math.abs(velocity)}] );
				}

				lastVelocity = velocity;

				websocketCnt = 1;
			}
			else if(websocketCnt === 1){
				if( requestTlm )
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
		velocity = velocity.toFixed(2);
		
		return velocity;
	}

	return 0.0;
}

// Function to initialize the websocket communication
function initWebSocket(){
	// If websocket is active, close connection
	if( websocket ){
		websocket.close();
	}
	
	// Initiate the websocket object
	websocket = new WebSocket('ws://192.168.4.1:81/');

	initConfig = false;
	loaderElm.classList.remove('hidden');
	addToLog("Connecting");
	setStatus("Connecting", "primary")

	// Add eventlisteners for handling communication with ESP
	websocket.onopen = function(event) { onWsOpen(event) };
	websocket.onclose = function(event) { onWsClose(event) };
	websocket.onmessage = function(event) { onWsMessage(event) };

	// Add eventlistener to close websocket before closing browser
	window.addEventListener('beforeunload', function() {
		websocket.close();
	});

	requestTlm = true;

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

	loaderElm.classList.add('hidden');

	// When connection first is opened, request configuration
	sendCommand( GCODE_REQUEST_CONFIG );
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

	} else if( data.includes("DATA") ){
		var values = [];

		var items = data.split(" ");
		items.shift(); // Remove "DATA" from string

		for (var i in items) {
			// Remove the prefix of each datastring f.x. P, T and S of "TLM P20 T450 S0"
	    	values[i] = items[i].substring(1, items[i].length);
		}


		tlm.posistion 		= parseFloat(values[0])%DEGREES_PER_REV;
		tlm.absPosition 	= parseFloat(values[0]);
		tlm.steps 			= parseInt(values[1])%STEPS_PER_REV;
		tlm.absSteps		= parseInt(values[1]);
		tlm.encoderVelocity = parseFloat(values[2]);
		tlm.driverVelocity 	= parseFloat(values[3]);

		// Print values to GUI
		if( positionUnit == APP_UNIT_DEGREES ){
			dataPositionElm.value 			= tlm.posistion.toFixed(2);
			dataAbsPositionElm.value 		= tlm.absPosition.toFixed(2);
			dataPositionDriverElm.value 	= (tlm.steps/STEPS_PER_REV*DEGREES_PER_REV).toFixed(2); 	// Convert microsteps to angle
			dataAbsPositionDriverElm.value 	= (tlm.absSteps/STEPS_PER_REV*DEGREES_PER_REV).toFixed(2); 	// Convert microsteps to angle
		}else{
			dataPositionElm.value 			= (tlm.posistion.toFixed(2)/DEGREES_PER_REV*FULLSTEPS).toFixed(2); 	// Convert angle to steps
			dataAbsPositionElm.value 		= (tlm.absPosition.toFixed(2)/DEGREES_PER_REV*FULLSTEPS).toFixed(2); // Convert angle to steps
			dataPositionDriverElm.value 	= (tlm.steps/MICROSTEPS).toFixed(2);
			dataAbsPositionDriverElm.value 	= (tlm.absSteps/MICROSTEPS).toFixed(2);
		}

		dataVelocityElm.value 			= tlm.encoderVelocity.toFixed(2);
		dataVelocityDriverElm.value 	= tlm.driverVelocity.toFixed(2);

		// Animate arrow to show position
		anglePointer.style.transform 	= 'rotate('+tlm.posistion+'deg)';
	}
	else if(data.includes("CONF")){
		var values = [];

		var items = data.split(" ");
		items.shift(); // Remove "CONF" from string

		for (var i in items) {
			// Remove the prefix of each datastring
	    	values[i] = items[i].substring(1, items[i].length);
		}

		conf.velocity 		= parseFloat(values[0]);
		conf.acceleration 	= parseFloat(values[1]);
		conf.brakeMethod 	= parseInt(values[2]);
		conf.closedLoop 	= parseInt(values[3]);

		velocityInput.value = conf.velocity/FULLSTEPS*60.0; // Get it as RPM
		accelerationInput.value = conf.acceleration/FULLSTEPS*60.0; // Get it as RPM/s


		if(initConfig != true){
			addToLog( "Config received" );
		}

		initConfig = true;
	}
	else if(data.includes("DONE"))
	{	
		// uStepper is done after blocking operation.
		// Safely begin request of data again
		requestTlm = true;
	}
	else {
		console.log( "Unknown response: \"" + data + "\"");
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
		currentRatio = { x: 0, y: 0 };
	}

	parent.appendChild(stick);

	return {
		getRatio: () => currentRatio,
		getPosition: () => currentPos,
		isActive: () => active,
	};
}
