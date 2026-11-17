# Escribe un texto "en directo" en el Bloc de notas y lo guarda. Lo lanza NOVA solo tras pedir permiso.
# Seguridad: antes de CADA trozo comprueba que la ventana activa es el Bloc de notas; si no, se detiene.
# Codigos de salida: 0 ok, 2 el Bloc de notas no aparecio, 3 se perdio el foco (el usuario toco algo), 4 no se guardo, 9 otro error.
param([string]$ChunksFile, [string]$SavePath, [int]$Delay = 70)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class NovaWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@
function Test-Notepad {
  try { $p = [uint32]0; [void][NovaWin]::GetWindowThreadProcessId([NovaWin]::GetForegroundWindow(), [ref]$p); return ((Get-Process -Id $p).ProcessName -like 'notepad*') } catch { return $false }
}
function Set-Clip([string]$t) {
  for ($i = 0; $i -lt 8; $i++) { try { [System.Windows.Forms.Clipboard]::SetText($t); return } catch { Start-Sleep -Milliseconds 80 } }
  throw 'E9'
}
$saved = $null; $hadText = $false
try { if ([System.Windows.Forms.Clipboard]::ContainsText()) { $saved = [System.Windows.Forms.Clipboard]::GetText(); $hadText = $true } } catch {}
$code = 0
try {
  $chunks = @(Get-Content -LiteralPath $ChunksFile -Raw -Encoding UTF8 | ConvertFrom-Json)
  $before = @(Get-Process -Name notepad -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  Start-Process notepad.exe | Out-Null
  $ok = $false
  for ($i = 0; $i -lt 50; $i++) {
    Start-Sleep -Milliseconds 200
    if (Test-Notepad) { $ok = $true; break }
    $np = Get-Process -Name notepad -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and ($before -notcontains $_.Id) } | Select-Object -First 1
    if ($np) { [void][NovaWin]::SetForegroundWindow($np.MainWindowHandle) }
  }
  if (-not $ok) { throw 'E2' }
  Start-Sleep -Milliseconds 800
  [System.Windows.Forms.SendKeys]::SendWait('^n')
  Start-Sleep -Milliseconds 600
  foreach ($c in $chunks) {
    if (-not (Test-Notepad)) { throw 'E3' }
    Set-Clip ([string]$c)
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds $Delay
  }
  Start-Sleep -Milliseconds 400
  if (-not (Test-Notepad)) { throw 'E3' }
  [System.Windows.Forms.SendKeys]::SendWait('^s')
  Start-Sleep -Milliseconds 1400
  if (-not (Test-Notepad)) { throw 'E3' }
  Set-Clip $SavePath
  [System.Windows.Forms.SendKeys]::SendWait('^v')
  Start-Sleep -Milliseconds 400
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Start-Sleep -Milliseconds 1600
  if (-not (Test-Path -LiteralPath $SavePath)) { throw 'E4' }
} catch {
  if ($_.Exception.Message -match '^E(\d)$') { $code = [int]$Matches[1] } else { $code = 9 }
} finally {
  try { if ($hadText) { [System.Windows.Forms.Clipboard]::SetText($saved) } else { [System.Windows.Forms.Clipboard]::Clear() } } catch {}
}
exit $code
