#define GCODE_MOVE 				"G0"
#define GCODE_MOVE_CC 			"G1"
#define GCODE_CONTINUOUS 		"G2"
#define GCODE_CONTINUOUS_CC 	"G3"
#define GCODE_BRAKE 			"G4"
#define GCODE_HOME 				"G5"

// Miscellaneous commands
#define GCODE_STOP 				"M0" // Stop everything
#define GCODE_SET_SPEED 		"M1"
#define GCODE_SET_ACCEL 		"M2"
#define GCODE_SET_UNIT_ANGLE 	"M3"
#define GCODE_SET_UNIT_STEP 	"M4"
#define GCODE_SET_BRAKE_FREE	"M5"
#define GCODE_SET_BRAKE_COOL 	"M6"
#define GCODE_SET_BRAKE_HARD 	"M7"
#define GCODE_SET_CL_ENABLE 	"M8" // Enable closed loop 
#define GCODE_SET_CL_DISABLE 	"M9" // Disable closed loop
#define GCODE_RECORD_START 		"M10"
#define GCODE_RECORD_STOP 		"M11"
#define GCODE_RECORD_ADD 		"M12"
#define GCODE_RECORD_PLAY 		"M13"
#define GCODE_RECORD_PAUSE 		"M14"
#define GCODE_REQUEST_DATA 		"M15"

#define GCODE_VALID "OK"
#define GCODE_INVALID "NAY"

#define BAUD_RATE 115200

typedef enum {
    rdy = 1,
    home,
    resetHome,
    move,
    runContinously,
    setVelocity,
    setAcceleration,
    stop
} state_t;
