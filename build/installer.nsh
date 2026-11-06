; Calcium: registers as a browser in Windows "Default apps" (like Chrome, per user, HKCU).
; The user can pick Calcium in Settings > Default apps; the installer does NOT make it the default by itself.

!define MONDIUM_KEY "Software\Clients\StartMenuInternet\Calcium"

!macro mondiumProgId PROGID DESC
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "${DESC}"
  WriteRegStr HKCU "Software\Classes\${PROGID}" "FriendlyTypeName" "${DESC}"
  WriteRegStr HKCU "Software\Classes\${PROGID}\Application" "ApplicationName" "Calcium"
  WriteRegStr HKCU "Software\Classes\${PROGID}\Application" "ApplicationIcon" "$INSTDIR\Calcium.exe,0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\Calcium.exe,0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\Calcium.exe" "%1"'
!macroend

!macro customInstall
  ; Keep existing Windows default-app choices working after the rename.
  !insertmacro mondiumProgId "MondiumURL" "Calcium URL"
  WriteRegStr HKCU "Software\Classes\MondiumURL" "URL Protocol" ""
  !insertmacro mondiumProgId "MondiumHTML" "Calcium HTML Document"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Mondium"
  !insertmacro mondiumProgId "CalciumURL" "Calcium URL"
  WriteRegStr HKCU "Software\Classes\CalciumURL" "URL Protocol" ""
  !insertmacro mondiumProgId "CalciumHTML" "Calcium HTML Document"

  WriteRegStr HKCU "${MONDIUM_KEY}" "" "Calcium"
  WriteRegStr HKCU "${MONDIUM_KEY}\DefaultIcon" "" "$INSTDIR\Calcium.exe,0"
  WriteRegStr HKCU "${MONDIUM_KEY}\shell\open\command" "" '"$INSTDIR\Calcium.exe"'
  WriteRegStr HKCU "${MONDIUM_KEY}\Capabilities" "ApplicationName" "Calcium"
  WriteRegStr HKCU "${MONDIUM_KEY}\Capabilities" "ApplicationDescription" "Minimal, debloated Chromium-based browser"
  WriteRegStr HKCU "${MONDIUM_KEY}\Capabilities" "ApplicationIcon" "$INSTDIR\Calcium.exe,0"
  WriteRegStr HKCU "${MONDIUM_KEY}\Capabilities\StartMenu" "StartMenuInternet" "Calcium"
  WriteRegStr HKCU "${MONDIUM_KEY}\Capabilities\URLAssociations" "http" "CalciumURL"
  WriteRegStr HKCU "${MONDIUM_KEY}\Capabilities\URLAssociations" "https" "CalciumURL"
  WriteRegStr HKCU "${MONDIUM_KEY}\Capabilities\FileAssociations" ".htm" "CalciumHTML"
  WriteRegStr HKCU "${MONDIUM_KEY}\Capabilities\FileAssociations" ".html" "CalciumHTML"
  WriteRegStr HKCU "${MONDIUM_KEY}\Capabilities\FileAssociations" ".pdf" "CalciumHTML"
  WriteRegStr HKCU "${MONDIUM_KEY}\Capabilities\FileAssociations" ".svg" "CalciumHTML"
  WriteRegStr HKCU "${MONDIUM_KEY}\Capabilities\FileAssociations" ".webp" "CalciumHTML"
  WriteRegStr HKCU "Software\RegisteredApplications" "Calcium" "${MONDIUM_KEY}\Capabilities"
  ; Notify the shell that file associations changed
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\RegisteredApplications" "Calcium"
  DeleteRegKey HKCU "${MONDIUM_KEY}"
  DeleteRegKey HKCU "Software\Classes\CalciumURL"
  DeleteRegKey HKCU "Software\Classes\CalciumHTML"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
