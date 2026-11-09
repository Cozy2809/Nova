# Crea el acceso directo "Nova" (icono de Nova) en el Escritorio y en el menu Inicio y quita el antiguo "JARVIS". Se ejecuta una sola vez.
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$ws = New-Object -ComObject WScript.Shell
$dirs = @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))
foreach ($d in $dirs) {
  $old = Join-Path $d 'JARVIS.lnk'
  if (Test-Path $old) { Remove-Item $old -Force; Write-Host ('Quitado: ' + $old) }
  $l = $ws.CreateShortcut((Join-Path $d 'Nova.lnk'))
  $l.TargetPath = $ps
  $l.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $Root 'launch.ps1') + '"'
  $l.WorkingDirectory = $Root
  $l.IconLocation = (Join-Path $Root 'assets\nova.ico')
  $l.Description = 'Abrir Nova'
  $l.WindowStyle = 7
  $l.Save()
  Write-Host ('Creado: ' + (Join-Path $d 'Nova.lnk'))
}
# Refresca la cache de iconos de Windows para que se vea el nuevo enseguida
try { ie4uinit.exe -show } catch {}
