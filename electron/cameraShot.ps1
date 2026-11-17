# Abre la app Camara de Windows y (si -Shot 1) pulsa el disparador y devuelve la ruta de la foto nueva.
# Codigos de salida: 0 ok, 2 la app no aparecio, 3 se perdio el foco, 4 no se encontro la foto nueva, 9 otro error.
param([string]$Shot = '1')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class NovaCam {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
function Test-Cam {
  try { $p = [uint32]0; [void][NovaCam]::GetWindowThreadProcessId([NovaCam]::GetForegroundWindow(), [ref]$p); return ((Get-Process -Id $p).ProcessName -like 'WindowsCamera*') } catch { return $false }
}
$code = 0
try {
  $roll = Join-Path ([Environment]::GetFolderPath('MyPictures')) 'Camera Roll'
  $start = Get-Date
  Start-Process 'microsoft.windows.camera:'
  if ($Shot -ne '1') { exit 0 }
  $ok = $false
  for ($i = 0; $i -lt 50; $i++) { Start-Sleep -Milliseconds 200; if (Test-Cam) { $ok = $true; break } }
  if (-not $ok) { throw 'E2' }
  Start-Sleep -Milliseconds 3500
  if (-not (Test-Cam)) { throw 'E3' }
  [System.Windows.Forms.SendKeys]::SendWait(' ')
  $found = $null
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 400
    $found = Get-ChildItem -LiteralPath $roll -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $start } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($found) { break }
  }
  if (-not $found) { throw 'E4' }
  Write-Output $found.FullName
} catch {
  if ($_.Exception.Message -match '^E(\d)$') { $code = [int]$Matches[1] } else { $code = 9 }
}
exit $code
