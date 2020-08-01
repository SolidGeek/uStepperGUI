# uStepperSRobotArm

This repository contains the code for the uStepper robotarm Rev 4. The repository is currently not structured as a regular arduino library, so installation using the arduino library manager is not possible yet, but it will be in the future. Until then, this repository should be downloaded to a folder, of your choosing, on your computer.

# Flashing of the uStepper S boards

The "usteppersrobotarm.ino" sketch contains the code for the 3 uStepper S boards on the uStepper arm. This sketch requires the newest version of the uStepper S library to be installed

## Flashing steps

    - Open the "usteppersrobotarm.ino" sketch in Arduino IDE
    - Go to "Tools->Boards" and choose "uStepper S"
    - Attach USB cable and power supply to the uStepper S board you want to flash
    - Turn on power supply and press "upload" button in Arduino IDE
    - Wait for flashing to finish
    - Repeat for the other uStepper S boards if nessecary