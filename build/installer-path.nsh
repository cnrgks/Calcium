!ifndef CALCIUM_INSTALL_PATH_INCLUDED
!define CALCIUM_INSTALL_PATH_INCLUDED
!define /ifndef CALCIUM_DEFAULT_INSTALL_DIR "$LOCALAPPDATA\Programs\Calcium Browser"
!macro customInit
  Push $0
  ; Updates must replace the executable the user actually launched. Respect /D,
  ; including when the registry contains a different or stale installation path.
  !insertmacro GetDParameter $0
  ${If} $0 != ""
    StrCpy $INSTDIR $0
  ${Else}
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    ${If} $0 == ""
      StrCpy $INSTDIR "${CALCIUM_DEFAULT_INSTALL_DIR}"
    ${Else}
      StrCpy $INSTDIR $0
    ${EndIf}
  ${EndIf}
  Pop $0
!macroend
!endif
