@echo off
setlocal
cd /d "%~dp0"
echo Stopping Gradle daemon...
call gradlew.bat --stop

echo Removing local build caches...
if exist app\build rmdir /s /q app\build
if exist build rmdir /s /q build
if exist .gradle rmdir /s /q .gradle

echo Running clean build...
call gradlew.bat clean
call gradlew.bat :app:assembleDebug --rerun-tasks

if %ERRORLEVEL% EQU 0 (
  echo.
  echo APK created: app\build\outputs\apk\debug\app-debug.apk
) else (
  echo.
  echo Build failed. Please copy the full error log.
)
pause
