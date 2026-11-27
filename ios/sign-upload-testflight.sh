#!/usr/bin/env bash
# Only the manually approved testflight environment may invoke this script.
set -euo pipefail
umask 077
cd "$(git rev-parse --show-toplevel)"
[[ "${GITHUB_EVENT_NAME:-}" == workflow_dispatch && "${GITHUB_REF:-}" == refs/heads/engineering/internal-testflight-handoff ]] || { echo 'Refusing non-manual or wrong-branch signing' >&2; exit 2; }
for name in BUILD_NUMBER BUILD_CERTIFICATE_BASE64 P12_PASSWORD BUILD_PROVISION_PROFILE_BASE64 KEYCHAIN_PASSWORD ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY; do
  [[ -n "${!name:-}" ]] || { echo "Missing required environment input: $name" >&2; exit 2; }
done
[[ "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ && "$ASC_KEY_ID" =~ ^[A-Za-z0-9]+$ && "$ASC_ISSUER_ID" =~ ^[A-Za-z0-9-]+$ ]]
test -f ios/RushToOrbit.xcodeproj/project.pbxproj
test -f ios/approved-app-icon.png
cmp ios/approved-app-icon.png ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon.png
tmp="$(mktemp -d "$RUNNER_TEMP/rto-sign.XXXXXX")"
keychain="$tmp/rto.keychain-db"
profile_uuid=''
cleanup() {
  if [[ -n "$profile_uuid" ]]; then
    rm -f "$HOME/Library/MobileDevice/Provisioning Profiles/$profile_uuid.mobileprovision" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles/$profile_uuid.mobileprovision"
  fi
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
printf '%s' "$BUILD_CERTIFICATE_BASE64" | base64 -D > "$tmp/cert.p12"
printf '%s' "$BUILD_PROVISION_PROFILE_BASE64" | base64 -D > "$tmp/profile.mobileprovision"
printf '%s\n' "$ASC_PRIVATE_KEY" > "$tmp/AuthKey_$ASC_KEY_ID.p8"
unset BUILD_CERTIFICATE_BASE64 BUILD_PROVISION_PROFILE_BASE64 ASC_PRIVATE_KEY
security cms -D -i "$tmp/profile.mobileprovision" > "$tmp/profile.plist"
profile_uuid="$(python3 - "$tmp/profile.plist" <<'PY'
import plistlib,datetime,re,sys
p=plistlib.load(open(sys.argv[1],'rb')); e=p['Entitlements']
assert isinstance(p.get('Name'),str) and p['Name'].strip() and not any(ord(c)<32 for c in p['Name'])
assert p['TeamIdentifier']==['TFNH5R2U6N']
assert e['application-identifier']=='TFNH5R2U6N.com.maraschick.rushtoorbit'
assert not e.get('get-task-allow',False)
assert not p.get('ProvisionedDevices') and not p.get('ProvisionsAllDevices')
assert p['ExpirationDate']>datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
assert re.fullmatch(r'[0-9a-fA-F-]{36}',p['UUID'])
print(p['UUID'])
PY
)"
profile_name="$(/usr/libexec/PlistBuddy -c 'Print :Name' "$tmp/profile.plist")"
[[ -n "$profile_name" ]]
security create-keychain -p "$KEYCHAIN_PASSWORD" "$keychain"
security set-keychain-settings -lut 3600 "$keychain"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$keychain"
security import "$tmp/cert.p12" -P "$P12_PASSWORD" -A -t cert -f pkcs12 -k "$keychain" >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain"
unset P12_PASSWORD KEYCHAIN_PASSWORD
security find-identity -v -p codesigning "$keychain" > "$tmp/identities"
fingerprint="$(python3 - "$tmp/profile.plist" "$tmp/identities" <<'PY'
import plistlib,hashlib,sys
p=plistlib.load(open(sys.argv[1],'rb')); identities=open(sys.argv[2]).read().upper()
matches=[hashlib.sha1(c).hexdigest().upper() for c in p['DeveloperCertificates'] if hashlib.sha1(c).hexdigest().upper() in identities]
assert len(matches)==1,'Expected exactly one profile-matching signing identity'
print(matches[0])
PY
)"
for dir in "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"; do
  mkdir -p "$dir"
  cp "$tmp/profile.mobileprovision" "$dir/$profile_uuid.mobileprovision"
done
rm -f "$tmp/cert.p12" "$tmp/profile.mobileprovision" "$tmp/profile.plist" "$tmp/identities"
xcodebuild -project ios/RushToOrbit.xcodeproj -scheme RushToOrbit -configuration Release -destination 'generic/platform=iOS' -archivePath "$tmp/RushToOrbit.xcarchive" CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="$fingerprint" DEVELOPMENT_TEAM=TFNH5R2U6N PROVISIONING_PROFILE_SPECIFIER="$profile_name" archive
app="$tmp/RushToOrbit.xcarchive/Products/Applications/RushToOrbit.app"
codesign --verify --deep --strict "$app"
[[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")" == com.maraschick.rushtoorbit ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$app/Info.plist")" == "$BUILD_NUMBER" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Info.plist")" == 4.14 ]]
for asset in index.html leaderboard.js manifest.webmanifest icon.svg; do cmp "$asset" "$app/Web/$asset"; done
test -s "$app/Assets.car"
python3 - "$tmp/export.plist" "$fingerprint" "$profile_name" <<'PY'
import plistlib,sys
p={'method':'app-store-connect','destination':'upload','teamID':'TFNH5R2U6N','signingStyle':'manual','signingCertificate':sys.argv[2],'provisioningProfiles':{'com.maraschick.rushtoorbit':sys.argv[3]},'testFlightInternalTestingOnly':True,'manageAppVersionAndBuildNumber':False,'uploadSymbols':True}
with open(sys.argv[1],'wb') as f: plistlib.dump(p,f)
PY
xcodebuild -exportArchive -archivePath "$tmp/RushToOrbit.xcarchive" -exportPath "$tmp/export" -exportOptionsPlist "$tmp/export.plist" -authenticationKeyPath "$tmp/AuthKey_$ASC_KEY_ID.p8" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID" -allowProvisioningUpdates
echo "Internal-only upload command succeeded for 4.14 ($BUILD_NUMBER). Apple processing and internal group assignment are separate."
