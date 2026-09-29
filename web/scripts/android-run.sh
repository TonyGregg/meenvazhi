#!/bin/sh
# Install the built APK and open Meenvazhi on an Android phone or emulator.
#
# Uses a phone connected by USB (with USB debugging on) if there is one. Otherwise
# it starts the Android 15 emulator and waits for it to boot. Full paths are used
# throughout, so adb does not need to be on your PATH.
#
# Usage, from web/:
#   npm run android:run       build, then install and open
#   npm run android:install   install and open the APK already in apk/
set -e

SDK="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
ADB="$SDK/platform-tools/adb"
EMULATOR="$SDK/emulator/emulator"
AVD="${MEENVAZHI_AVD:-meenvazhi-a15}"
PKG=io.github.tonygregg.meenvazhi
APK="$(cd "$(dirname "$0")/../.." && pwd)/apk/Meenvazhi-debug.apk"

[ -f "$APK" ] || { echo "No APK at $APK. Run: npm run apk:debug"; exit 1; }

first_device() { "$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1; exit }'; }

DEVICE="$(first_device)"
if [ -z "$DEVICE" ]; then
  echo "No phone or emulator connected. Starting the $AVD emulator; a phone window will appear..."
  nohup "$EMULATOR" -avd "$AVD" -no-snapshot-save >/dev/null 2>&1 &
  "$ADB" wait-for-device
  printf "Waiting for Android to finish booting"
  until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    printf "."; sleep 2
  done
  echo
  DEVICE="$(first_device)"
fi

echo "Installing on $DEVICE..."
"$ADB" -s "$DEVICE" install -r "$APK" >/dev/null
"$ADB" -s "$DEVICE" shell am start -n "$PKG/.MainActivity" >/dev/null
echo "Meenvazhi is open on $DEVICE."
