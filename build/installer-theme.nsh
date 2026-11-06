!ifndef CALCIUM_INSTALLER_THEME_INCLUDED
!define CALCIUM_INSTALLER_THEME_INCLUDED
!ifndef BUILD_UNINSTALLER
!include "WinMessages.nsh"
!define MUI_BGCOLOR "000000"
!define MUI_TEXTCOLOR "FFFFFF"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"
!define MUI_CUSTOMFUNCTION_GUIINIT CalciumInstallerGuiInit
!define MUI_PAGE_CUSTOMFUNCTION_SHOW CalciumInstallerPageShow

Function CalciumThemeChildren
  Exch $0
  Push $1
  System::Call 'user32::FindWindowExW(p r0, p 0, p 0, p 0) p.r1'
  calcium_theme_child:
    StrCmp $1 0 calcium_theme_done
    SetCtlColors $1 FFFFFF 000000
    Push $1
    Call CalciumThemeChildren
    System::Call 'user32::FindWindowExW(p r0, p r1, p 0, p 0) p.r1'
    Goto calcium_theme_child
  calcium_theme_done:
  Pop $1
  Pop $0
FunctionEnd

Function CalciumInstallerGuiInit
  Push $0
  ; Remove caption, system menu and resize frame before the window is shown.
  System::Call 'user32::GetWindowLongW(p $HWNDPARENT, i -16) i.r0'
  IntOp $0 $0 & 0xFF30FFFF
  System::Call 'user32::SetWindowLongW(p $HWNDPARENT, i -16, i r0)'
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i 0, i 0, i 0, i 0, i 0x27)'
  SetCtlColors $HWNDPARENT FFFFFF 000000
  Push $HWNDPARENT
  Call CalciumThemeChildren
  Pop $0
FunctionEnd

Function CalciumCenterInstaller
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  ; Use this window's monitor, including monitors with negative coordinates.
  System::Call 'user32::MonitorFromWindow(p $HWNDPARENT, i 2) p.r0'
  System::Alloc 40
  Pop $1
  System::Call '*$1(i 40)'
  System::Call 'user32::GetMonitorInfoW(p r0, p r1) i.r0'
  StrCmp $0 0 calcium_center_done
  ; MONITORINFO: cbSize, monitor rectangle, working rectangle, flags.
  System::Call '*$1(i, i, i, i, i, i .r2, i .r3, i .r4, i .r5, i)'
  IntOp $4 $4 - $2
  IntOp $4 $4 - 400
  IntOp $4 $4 / 2
  IntOp $4 $4 + $2
  IntOp $5 $5 - $3
  IntOp $5 $5 - 132
  IntOp $5 $5 / 2
  IntOp $5 $5 + $3
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i r4, i r5, i 0, i 0, i 0x15)'
  calcium_center_done:
  System::Free $1
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

Function CalciumInstallerPageShow
  Push $0
  Push $1
  Push $2
  SetCtlColors $HWNDPARENT FFFFFF 000000
  Push $HWNDPARENT
  Call CalciumThemeChildren
  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $1 $0 1004
  ; Disable the Windows progress theme so it cannot force a green bar.
  System::Call 'uxtheme::SetWindowTheme(p r1, w "", w "")'
  System::Call 'user32::GetWindowLongW(p r1, i -16) i.r2'
  IntOp $2 $2 & 0xFF7FFFFF
  System::Call 'user32::SetWindowLongW(p r1, i -16, i r2)'
  System::Call 'user32::GetWindowLongW(p r1, i -20) i.r2'
  IntOp $2 $2 & 0xFFFFFDFF
  System::Call 'user32::SetWindowLongW(p r1, i -20, i r2)'
  SendMessage $1 0x0409 0 0xB0B0B0
  SendMessage $1 0x2001 0 0x202020
  ; Use one small, borderless progress window. The standard installer logic stays intact.
  GetDlgItem $1 $0 1006
  SendMessage $1 0x000C 0 "STR:$(MUI_TEXT_INSTALLING_SUBTITLE)"
  System::Call 'user32::SetWindowPos(p r1, p 0, i 64, i 23, i 310, i 42, i 0x14)'
  GetDlgItem $1 $0 1004
  System::Call 'user32::SetWindowPos(p r1, p 0, i 20, i 98, i 360, i 6, i 0x34)'
  GetDlgItem $1 $0 1027
  ShowWindow $1 0
  GetDlgItem $1 $0 1016
  ShowWindow $1 0
  System::Call 'user32::SetWindowPos(p r0, p 0, i 0, i 0, i 400, i 132, i 0x14)'
  Push $2
  SendMessage $HWNDPARENT 0x007F 1 0 $2
  StrCmp $2 0 0 +2
    System::Call 'user32::GetClassLongW(p $HWNDPARENT, i -14) p.r2'
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i 0x50000003, i 20, i 23, i 32, i 32, p r0, p 0, p 0, p 0) p.r1'
  SetCtlColors $1 FFFFFF 000000
  SendMessage $1 0x0170 $2 0
  Pop $2
  GetDlgItem $1 $HWNDPARENT 1037
  ShowWindow $1 0
  GetDlgItem $1 $HWNDPARENT 1038
  ShowWindow $1 0
  GetDlgItem $1 $HWNDPARENT 1039
  ShowWindow $1 0
  GetDlgItem $1 $HWNDPARENT 1034
  ShowWindow $1 0
  GetDlgItem $1 $HWNDPARENT 1035
  ShowWindow $1 0
  GetDlgItem $1 $HWNDPARENT 1045
  ShowWindow $1 0
  GetDlgItem $1 $HWNDPARENT 1256
  ShowWindow $1 0
  GetDlgItem $1 $HWNDPARENT 1028
  ShowWindow $1 0
  GetDlgItem $1 $HWNDPARENT 1
  ShowWindow $1 0
  GetDlgItem $1 $HWNDPARENT 2
  ShowWindow $1 0
  GetDlgItem $1 $HWNDPARENT 3
  ShowWindow $1 0
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i 0, i 0, i 400, i 132, i 0x26)'
  Call CalciumCenterInstaller
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif
!endif
