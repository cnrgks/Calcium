!ifndef CALCIUM_INSTALL_UPDATE_INCLUDED
!define CALCIUM_INSTALL_UPDATE_INCLUDED
!ifndef BUILD_UNINSTALLER
Var CalciumIsUpdate
Var CalciumUpdateToken
Var CalciumUpdateParentHandle

Function CalciumWriteUpdateStatus
  Exch $0
  Push $1
  StrCmp $CalciumIsUpdate "1" 0 calcium_status_done
  ClearErrors
  FileOpen $1 "$EXEDIR\update-status.json" w
  IfErrors calcium_status_done
  FileWrite $1 '{"status":"$0","token":"$CalciumUpdateToken"}'
  FileClose $1
  calcium_status_done:
  Pop $1
  Pop $0
FunctionEnd

Function CalciumPrepareUpdate
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "--calcium-update-parent=" $1
  IfErrors calcium_parent_done
  IntOp $1 $1 + 0
  IntCmp $1 0 calcium_parent_done calcium_parent_done
  ClearErrors
  ${GetOptions} $0 "--calcium-update-token=" $2
  IfErrors calcium_parent_done
  StrLen $3 $2
  IntCmp $3 64 0 calcium_parent_done calcium_parent_done
  ; A token may only name a file inside this installer's own staging directory.
  StrCpy $3 0
  calcium_token_loop:
    StrCpy $5 $2 1 $3
    StrCmp $5 "0" calcium_token_char
    StrCmp $5 "1" calcium_token_char
    StrCmp $5 "2" calcium_token_char
    StrCmp $5 "3" calcium_token_char
    StrCmp $5 "4" calcium_token_char
    StrCmp $5 "5" calcium_token_char
    StrCmp $5 "6" calcium_token_char
    StrCmp $5 "7" calcium_token_char
    StrCmp $5 "8" calcium_token_char
    StrCmp $5 "9" calcium_token_char
    StrCmp $5 "a" calcium_token_char
    StrCmp $5 "b" calcium_token_char
    StrCmp $5 "c" calcium_token_char
    StrCmp $5 "d" calcium_token_char
    StrCmp $5 "e" calcium_token_char
    StrCmp $5 "f" calcium_token_char
    Goto calcium_parent_done
  calcium_token_char:
    IntOp $3 $3 + 1
    IntCmp $3 64 0 calcium_token_loop
  StrCpy $CalciumUpdateToken $2
  StrCpy $CalciumIsUpdate "1"
  ; Capture the current parent before acknowledging readiness, avoiding PID reuse.
  System::Call 'kernel32::OpenProcess(i 0x100000, i 0, i r1) p.r4'
  StrCmp $4 0 calcium_parent_failed
  ClearErrors
  FileOpen $0 "$EXEDIR\update-ready-$2.txt" w
  IfErrors calcium_parent_close_failed
  FileWrite $0 "$2"
  FileClose $0
  Push "ready"
  Call CalciumWriteUpdateStatus
  StrCpy $CalciumUpdateParentHandle $4
  Goto calcium_parent_done
  calcium_parent_close_failed:
    System::Call 'kernel32::CloseHandle(p r4)'
  calcium_parent_failed:
    Push "failed"
    Call CalciumWriteUpdateStatus
    StrCmp $LANGUAGE 1055 0 +3
      MessageBox MB_OK|MB_ICONSTOP "Calcium kapatılamadı. Güncelleme iptal edildi."
      Goto calcium_parent_abort
    MessageBox MB_OK|MB_ICONSTOP "Calcium could not close. The update was cancelled."
    calcium_parent_abort:
    SetErrorLevel 2
    Quit
  calcium_parent_done:
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; Called from the install worker, never the GUI callback. The progress window
; remains responsive while Calcium flushes its session and exits.
Function CalciumWaitForUpdateParent
  Push $0
  StrCmp $CalciumIsUpdate "1" 0 calcium_wait_done
  System::Call 'kernel32::WaitForSingleObject(p $CalciumUpdateParentHandle, i 60000) i.r0'
  System::Call 'kernel32::CloseHandle(p $CalciumUpdateParentHandle)'
  StrCpy $CalciumUpdateParentHandle 0
  IntCmp $0 0 calcium_wait_closed
  Push "failed"
  Call CalciumWriteUpdateStatus
  StrCmp $LANGUAGE 1055 0 +3
    MessageBox MB_OK|MB_ICONSTOP "Calcium kapatılamadı. Güncelleme iptal edildi."
    Goto calcium_wait_abort
  MessageBox MB_OK|MB_ICONSTOP "Calcium could not close. The update was cancelled."
  calcium_wait_abort:
    SetErrorLevel 2
    Quit
  calcium_wait_closed:
    Push "installing"
    Call CalciumWriteUpdateStatus
  calcium_wait_done:
  Pop $0
FunctionEnd
!endif
!endif
