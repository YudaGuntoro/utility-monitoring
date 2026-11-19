@echo off
SETLOCAL EnableExtensions EnableDelayedExpansion

SET "SERVICE_NAME=UtilityMqttBroker"

echo Unregistering %SERVICE_NAME% Windows Service...

net session >nul 2>&1
IF ERRORLEVEL 1 (
    echo ERROR: Please run this BAT as Administrator.
    pause
    exit /b 1
)

sc.exe query "%SERVICE_NAME%" >nul 2>&1
IF ERRORLEVEL 1 (
    echo Service %SERVICE_NAME% is not registered.
    pause
    exit /b 0
)

echo Stopping service if running...
sc.exe stop "%SERVICE_NAME%" >nul 2>&1

FOR /L %%I IN (1,1,30) DO (
    sc.exe query "%SERVICE_NAME%" | findstr /I "STOPPED" >nul
    IF "!ERRORLEVEL!"=="0" GOTO DeleteService
    timeout /t 1 /nobreak >nul
)

:DeleteService
echo Deleting service...
sc.exe delete "%SERVICE_NAME%"
IF ERRORLEVEL 1 (
    SET "EXIT_CODE=!ERRORLEVEL!"
    echo ERROR: Failed to delete service. Error code: !EXIT_CODE!
    pause
    exit /b !EXIT_CODE!
)

echo Service unregistered successfully.
pause
exit /b 0
