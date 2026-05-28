; installer.nsh — počisti Windows icon cache po namestitvi

!macro customInstall
  ; Počisti icon cache
  ExecShell "" "ie4uinit.exe" "-show" SW_HIDE
  ; Restart Explorer za osvežitev ikon
  nsExec::Exec 'taskkill /IM explorer.exe /F'
  Sleep 1000
  Exec "$WINDIR\explorer.exe"
!macroend
