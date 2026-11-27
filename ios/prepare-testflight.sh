#!/usr/bin/env bash
# Run in a fresh owner-controlled checkout on macOS. No signing or upload here.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
[[ $# == 2 ]] || { echo 'Usage: bash ios/prepare-testflight.sh /absolute/path/to/approved-icon.png unused-build-number' >&2; exit 2; }
icon="$1"
build="$2"
[[ "$icon" = /* && -f "$icon" ]] || { echo 'An absolute path to the Dot-approved icon PNG is required.' >&2; exit 2; }
[[ "$build" =~ ^[1-9][0-9]*$ ]] || { echo 'Use an unused positive integer build number.' >&2; exit 2; }
command -v xcodegen >/dev/null
command -v xcodebuild >/dev/null
sdk="$(xcrun --sdk iphoneos --show-sdk-version)"
[[ "${sdk%%.*}" -ge 26 ]] || { echo 'iOS SDK 26+ required.' >&2; exit 2; }
# Keep the vetted native web assets untouched.
! grep -Fq '__nativeCampaignQAEnabled' index.html
grep -Fq 'v4.14' index.html
mkdir -p ios/App/Web ios/App/Assets.xcassets/AppIcon.appiconset
cp index.html leaderboard.js manifest.webmanifest icon.svg ios/App/Web/
python3 - "$icon" "$build" <<'PY'
import json, pathlib, shutil, struct, sys
icon = pathlib.Path(sys.argv[1])
raw = icon.read_bytes()
assert raw[:8] == b'\x89PNG\r\n\x1a\n' and raw[12:16] == b'IHDR', 'Expected PNG'
w,h,depth,color = struct.unpack('>IIBB', raw[16:26])
assert (w,h,depth,color) == (1024,1024,8,2), 'Use 1024x1024 8-bit RGB PNG, no alpha'
offset=8
while offset+12 <= len(raw):
    n=int.from_bytes(raw[offset:offset+4],'big')
    assert raw[offset+4:offset+8] != b'tRNS', 'No transparent pixels'
    offset+=n+12
folder=pathlib.Path('ios/App/Assets.xcassets')
(folder/'Contents.json').write_text(json.dumps({'info':{'author':'xcode','version':1}}))
shutil.copyfile(icon,folder/'AppIcon.appiconset/AppIcon.png')
(folder/'AppIcon.appiconset/Contents.json').write_text(json.dumps({'images':[{'filename':'AppIcon.png','idiom':'universal','platform':'ios','size':'1024x1024'}],'info':{'author':'xcode','version':1}}))
p=pathlib.Path('ios/project.yml')
s=p.read_text()
def replace(old,new):
    global s
    assert s.count(old)==1, 'Unexpected project format: '+old
    s=s.replace(old,new)
replace('CURRENT_PROJECT_VERSION: "2"', 'CURRENT_PROJECT_VERSION: "'+sys.argv[2]+'"')
replace('      - path: App/AppDelegate.swift','      - path: App/AppDelegate.swift\n      - path: App/Assets.xcassets')
replace('        TARGETED_DEVICE_FAMILY: "1"','        TARGETED_DEVICE_FAMILY: "1"\n        DEVELOPMENT_TEAM: TFNH5R2U6N\n        ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon\n        CODE_SIGN_STYLE: Automatic')
replace('        CFBundleDisplayName: RUSH TO ORBIT','        CFBundleDisplayName: RUSH TO ORBIT\n        CFBundleVersion: "$(CURRENT_PROJECT_VERSION)"\n        CFBundleShortVersionString: "$(MARKETING_VERSION)"')
pathlib.Path('ios/project-testflight.yml').write_text(s)
PY
(cd ios && xcodegen generate --spec project-testflight.yml)
# No credentials or provisioning access; unsigned compilation only.
xcodebuild -project ios/RushToOrbit.xcodeproj -scheme RushToOrbit -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath ios/TestFlightDerivedData CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
app=ios/TestFlightDerivedData/Build/Products/Release-iphoneos/RushToOrbit.app
for asset in index.html leaderboard.js manifest.webmanifest icon.svg; do
  cmp "$asset" "$app/Web/$asset" || { echo "Bundle asset mismatch: $asset" >&2; exit 1; }
done
assert_plist() {
  local key="$1" expected="$2" actual
  actual="$(/usr/libexec/PlistBuddy -c "Print $key" "$app/Info.plist")"
  [[ "$actual" == "$expected" ]] || { echo "Bundle metadata mismatch: $key expected=$expected actual=$actual" >&2; exit 1; }
  echo "Verified $key: $actual"
}
assert_plist CFBundleIdentifier com.maraschick.rushtoorbit
assert_plist CFBundleVersion "$build"
assert_plist CFBundleShortVersionString 4.14
test -s "$app/Assets.car" || { echo 'Missing compiled asset catalog' >&2; exit 1; }
test -s "$app/AppIcon60x60@2x.png" || { echo 'Missing compiled iPhone icon' >&2; exit 1; }
echo 'Unsigned preflight complete; not installable. In owner-authenticated Xcode choose Product > Archive, then Distribute App > TestFlight Internal Only. Never commit generated files or signing assets.'
