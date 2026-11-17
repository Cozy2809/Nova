# Nova Desktop — acciones del shell de Windows con la API pública. Lista CERRADA de acciones; nunca texto libre.
# Acciones: start | search | taskview | quicksettings | notifications (atajos de teclado de Windows) | desktop (mostrar/restaurar escritorio).
# PENDIENTE DE VERIFICAR EN WINDOWS REAL (no se pudo ejecutar en el entorno de desarrollo).
param([Parameter(Mandatory = $true)][ValidateSet('start', 'search', 'taskview', 'quicksettings', 'notifications', 'desktop')][string]$Action)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class NovaKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void Chord(byte mod, byte key) { keybd_event(mod, 0, 0, UIntPtr.Zero); if (key != 0) { keybd_event(key, 0, 0, UIntPtr.Zero); keybd_event(key, 0, 2, UIntPtr.Zero); } keybd_event(mod, 0, 2, UIntPtr.Zero); }
}
"@
$LWIN = 0x5B
switch ($Action) {
  'start'         { [NovaKeys]::Chord($LWIN, 0) }
  'search'        { [NovaKeys]::Chord($LWIN, 0x53) }   # Win+S
  'taskview'      { [NovaKeys]::Chord($LWIN, 0x09) }   # Win+Tab
  'quicksettings' { [NovaKeys]::Chord($LWIN, 0x41) }   # Win+A
  'notifications' { [NovaKeys]::Chord($LWIN, 0x4E) }   # Win+N
  'desktop'       { (New-Object -ComObject Shell.Application).ToggleDesktop() }
}
'{"ok":true}'
