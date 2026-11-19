@echo off
SETLOCAL EnableExtensions EnableDelayedExpansion

SET "SERVICE_NAME=Worker"
SET "DISPLAY_NAME=Utility Worker"
SET "SERVICE_DESCRIPTION=PT. Baja Titian Utama Utility Worker"
SET "BAT_DIR=%~dp0"
SET "APP_DIR=%BAT_DIR:~0,-1%"
SET "PROJECT_FILE=%APP_DIR%\Worker.csproj"
SET "PUBLISH_DIR=%APP_DIR%\bin\Release\net8.0\publish"

echo Registering %SERVICE_NAME% as Windows Service...
echo Script directory: %APP_DIR%

net session >nul 2>&1
IF ERRORLEVEL 1 (
    echo ERROR: Please run this BAT as Administrator.
    pause
    exit /b 1
)


IF EXIST "%PROJECT_FILE%" (
    echo Source project detected. Publishing Release output...
    dotnet publish "%PROJECT_FILE%" -c Release -o "%PUBLISH_DIR%"
    IF ERRORLEVEL 1 (
        SET "EXIT_CODE=!ERRORLEVEL!"
        echo ERROR: Publish failed. Service was not registered.
        pause
        exit /b !EXIT_CODE!
    )

    SET "APP_DIR=%PUBLISH_DIR%"
)

SET "EXE_PATH=%APP_DIR%\Worker.exe"
SET "DLL_PATH=%APP_DIR%\Worker.dll"
SET "DOTNET_PATH="

IF EXIST "%EXE_PATH%" (
    SET "USE_EXE=1"
) ELSE (
    IF EXIST "%DLL_PATH%" (
        FOR /F "delims=" %%D IN ('where dotnet 2^>nul') DO (
            IF NOT DEFINED DOTNET_PATH SET "DOTNET_PATH=%%D"
        )

        IF NOT DEFINED DOTNET_PATH (
            echo ERROR: Worker.exe was not found and dotnet.exe is not available in PATH.
            pause
            exit /b 1
        )
    ) ELSE (
        echo ERROR: Neither Worker.exe nor Worker.dll was found in:
        echo %APP_DIR%
        pause
        exit /b 1
    )
)

CALL :DeleteExistingService
IF ERRORLEVEL 1 (
    SET "EXIT_CODE=!ERRORLEVEL!"
    pause
    exit /b !EXIT_CODE!
)

echo Creating service with Automatic startup...
IF DEFINED USE_EXE (
    sc.exe create "%SERVICE_NAME%" binPath= "\"%EXE_PATH%\"" start= auto DisplayName= "%DISPLAY_NAME%"
) ELSE (
    sc.exe create "%SERVICE_NAME%" binPath= "\"%DOTNET_PATH%\" \"%DLL_PATH%\"" start= auto DisplayName= "%DISPLAY_NAME%"
)

IF ERRORLEVEL 1 (
    SET "EXIT_CODE=!ERRORLEVEL!"
    echo ERROR: Failed to create service. Error code: !EXIT_CODE!
    pause
    exit /b !EXIT_CODE!
)

sc.exe description "%SERVICE_NAME%" "%SERVICE_DESCRIPTION%" >nul
sc.exe config "%SERVICE_NAME%" start= auto >nul
sc.exe failure "%SERVICE_NAME%" reset= 86400 actions= restart/5000/restart/10000/restart/30000 >nul
sc.exe failureflag "%SERVICE_NAME%" 1 >nul 2>&1

echo Starting service...
sc.exe start "%SERVICE_NAME%"
IF ERRORLEVEL 1 (
    SET "EXIT_CODE=!ERRORLEVEL!"
    echo WARNING: Service was registered, but failed to start. Error code: !EXIT_CODE!
    echo Please check Windows Event Viewer or the application logs.
    pause
    exit /b !EXIT_CODE!
)

echo Service registered and started successfully.
pause
exit /b 0

:DeleteExistingService
sc.exe query "%SERVICE_NAME%" >nul 2>&1
IF ERRORLEVEL 1 (
    echo Existing service not found. Registering new service...
    exit /b 0
)

echo Existing service found. Stopping service if needed...
sc.exe stop "%SERVICE_NAME%" >nul 2>&1
CALL :WaitForStopped

echo Deleting existing service...
sc.exe delete "%SERVICE_NAME%"
IF ERRORLEVEL 1 (
    SET "EXIT_CODE=!ERRORLEVEL!"
    echo ERROR: Failed to delete existing service. Error code: !EXIT_CODE!
    exit /b !EXIT_CODE!
)

timeout /t 2 /nobreak >nul
exit /b 0

:WaitForStopped
FOR /L %%I IN (1,1,30) DO (
    sc.exe query "%SERVICE_NAME%" | findstr /I "STOPPED" >nul
    IF "!ERRORLEVEL!"=="0" exit /b 0
    timeout /t 1 /nobreak >nul
)
exit /b 0
