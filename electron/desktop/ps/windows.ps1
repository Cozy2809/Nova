# Nova Desktop — ventanas abiertas. Acciones: list | focus | minimize | maximize | restore | close. Salida: JSON.
# SIN texto libre del usuario: solo un número de proceso y una acción de una lista cerrada.
# PENDIENTE DE VERIFICAR EN WINDOWS REAL (no se pudo ejecutar en el entorno de desarrollo).
param([ValidateSet('list', 'focus', 'minimize', 'maximize', 'restore', 'close')][string]$Action = 'list', [int]$ProcessId = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class NovaWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  // Windows limita quién puede pasar al primer plano; una pulsación de Alt "legítima" lo permite (truco habitual y público).
  public static bool Front(IntPtr h) {
    if (SetForegroundWindow(h)) return true;
    keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
    return SetForegroundWindow(h);
  }
}
"@
function Get-Main([int]$id) { $p = Get-Process -Id $id; $h = $p.MainWindowHandle; if ($h -eq 0) { throw 'El proceso no tiene ventana' }; return @{ proc = $p; h = $h } }
if ($Action -eq 'list') {
  $fg = [uint32]0; [void][NovaWin]::GetWindowThreadProcessId([NovaWin]::GetForegroundWindow(), [ref]$fg)
  $rows = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | ForEach-Object {
    $p = $null; try { $p = $_.Path } catch {}
    [pscustomobject]@{ pid = $_.Id; name = $_.ProcessName; title = $_.MainWindowTitle; path = $p; minimized = [NovaWin]::IsIconic($_.MainWindowHandle); active = ($_.Id -eq [int]$fg) }
  })
  ConvertTo-Json -Compress -InputObject $rows
} else {
  $m = Get-Main $ProcessId; $h = $m.h
  switch ($Action) {
    'focus'    { if ([NovaWin]::IsIconic($h)) { [void][NovaWin]::ShowWindow($h, 9) }; if (-not [NovaWin]::Front($h)) { throw 'Windows no permitió traer la ventana al frente' } }
    'minimize' { [void][NovaWin]::ShowWindow($h, 6) }
    'maximize' { [void][NovaWin]::ShowWindow($h, 3); [void][NovaWin]::Front($h) }
    'restore'  { [void][NovaWin]::ShowWindow($h, 9); [void][NovaWin]::Front($h) }
    'close'    { if (-not $m.proc.CloseMainWindow()) { throw 'La ventana no aceptó cerrarse' } }
  }
  '{"ok":true}'
}
