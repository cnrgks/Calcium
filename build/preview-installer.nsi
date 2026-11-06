Unicode true
Name "Calcium Installer Preview"
OutFile "..\dist\Calcium-Installer-Preview.exe"
RequestExecutionLevel user
Icon "icon.ico"
ShowInstDetails nevershow
!include "installer-theme.nsh"
!define MUI_ICON "icon.ico"
!include "MUI2.nsh"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section
  SetDetailsPrint none
  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $1 $0 1006
  SendMessage $1 ${WM_SETTEXT} 0 "STR:Installing Calcium, please wait..."
  GetDlgItem $1 $0 1004
  SendMessage $1 0x0402 55 0
  Sleep 15000
SectionEnd
