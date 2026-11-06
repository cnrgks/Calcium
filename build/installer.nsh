!include "installer-theme.nsh"
; Calcium: registers as a browser in Windows "Default apps" (like Chrome, per user, HKCU).
; The user can pick Calcium in Settings > Default apps; the installer does NOT make it the default by itself.

!define CALCIUM_KEY "Software\Clients\StartMenuInternet\Calcium"

!macro calciumProgId PROGID DESC
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "${DESC}"
  WriteRegStr HKCU "Software\Classes\${PROGID}" "FriendlyTypeName" "${DESC}"
  WriteRegStr HKCU "Software\Classes\${PROGID}\Application" "ApplicationName" "Calcium"
  WriteRegStr HKCU "Software\Classes\${PROGID}\Application" "ApplicationIcon" "$INSTDIR\Calcium.exe,0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\Calcium.exe,0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\Calcium.exe" "%1"'
!macroend

!macro customInit
  ; Keep the installation directory separate from legacy products.
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $0 == ""
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Calcium Browser"
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro calciumProgId "CalciumURL" "Calcium URL"
  WriteRegStr HKCU "Software\Classes\CalciumURL" "URL Protocol" ""
  !insertmacro calciumProgId "CalciumHTML" "Calcium HTML Document"

  WriteRegStr HKCU "${CALCIUM_KEY}" "" "Calcium"
  WriteRegStr HKCU "${CALCIUM_KEY}\DefaultIcon" "" "$INSTDIR\Calcium.exe,0"
  WriteRegStr HKCU "${CALCIUM_KEY}\shell\open\command" "" '"$INSTDIR\Calcium.exe"'
  WriteRegStr HKCU "${CALCIUM_KEY}\Capabilities" "ApplicationName" "Calcium"
  WriteRegStr HKCU "${CALCIUM_KEY}\Capabilities" "ApplicationDescription" "Minimal, debloated Chromium-based browser"
  WriteRegStr HKCU "${CALCIUM_KEY}\Capabilities" "ApplicationIcon" "$INSTDIR\Calcium.exe,0"
  WriteRegStr HKCU "${CALCIUM_KEY}\Capabilities\StartMenu" "StartMenuInternet" "Calcium"
  WriteRegStr HKCU "${CALCIUM_KEY}\Capabilities\URLAssociations" "http" "CalciumURL"
  WriteRegStr HKCU "${CALCIUM_KEY}\Capabilities\URLAssociations" "https" "CalciumURL"
  WriteRegStr HKCU "${CALCIUM_KEY}\Capabilities\FileAssociations" ".htm" "CalciumHTML"
  WriteRegStr HKCU "${CALCIUM_KEY}\Capabilities\FileAssociations" ".html" "CalciumHTML"
  WriteRegStr HKCU "${CALCIUM_KEY}\Capabilities\FileAssociations" ".pdf" "CalciumHTML"
  WriteRegStr HKCU "${CALCIUM_KEY}\Capabilities\FileAssociations" ".svg" "CalciumHTML"
  WriteRegStr HKCU "${CALCIUM_KEY}\Capabilities\FileAssociations" ".webp" "CalciumHTML"
  WriteRegStr HKCU "Software\RegisteredApplications" "Calcium" "${CALCIUM_KEY}\Capabilities"
  ; Notify the shell that file associations changed
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\RegisteredApplications" "Calcium"
  DeleteRegKey HKCU "${CALCIUM_KEY}"
  DeleteRegKey HKCU "Software\Classes\CalciumURL"
  DeleteRegKey HKCU "Software\Classes\CalciumHTML"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
