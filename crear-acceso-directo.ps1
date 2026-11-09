# Crea el acceso directo "JARVIS" en el Escritorio y en el menu Inicio (se ejecuta una sola vez)
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$ws = New-Object -ComObject WScript.Shell
$dirs = @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))
foreach ($d in $dirs) {
  $l = $ws.CreateShortcut((Join-Path $d 'JARVIS.lnk'))
  $l.TargetPath = $ps
  $l.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $Root 'launch.ps1') + '"'
  $l.WorkingDirectory = $Root
  $l.IconLocation = (Join-Path $Root 'assets\jarvis.ico')
  $l.Description = 'Abrir JARVIS'
  $l.WindowStyle = 7
  $l.Save()
  Write-Host ('Creado: ' + (Join-Path $d 'JARVIS.lnk'))
}
