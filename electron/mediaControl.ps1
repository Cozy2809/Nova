# Script auxiliar para control de volumen y teclas multimedia en Windows
param([string]$action)

$code = @"
using System;
using System.Runtime.InteropServices;
public class KeySender {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public static void Press(byte vk, int repeat) {
        for (int i = 0; i < repeat; i++) {
            keybd_event(vk, 0, 0, UIntPtr.Zero);
            keybd_event(vk, 0, 2, UIntPtr.Zero);
        }
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'KeySender').Type) {
    Add-Type -TypeDefinition $code
}

switch ($action) {
    'vol_up'    { [KeySender]::Press(0xAF, 5); 'OK' } # VK_VOLUME_UP (5 pasos = ~10%)
    'vol_down'  { [KeySender]::Press(0xAE, 5); 'OK' } # VK_VOLUME_DOWN (5 pasos = ~10%)
    'mute'      { [KeySender]::Press(0xAD, 1); 'OK' } # VK_VOLUME_MUTE
    'unmute'    { 
        # En Windows presionar VolUp desmutea automáticamente; luego bajamos para mantener nivel
        [KeySender]::Press(0xAF, 1); [KeySender]::Press(0xAE, 1); 'OK' 
    }
    'play_pause'{ [KeySender]::Press(0xB3, 1); 'OK' } # VK_MEDIA_PLAY_PAUSE
    'next'      { [KeySender]::Press(0xB0, 1); 'OK' } # VK_MEDIA_NEXT_TRACK
    'prev'      { [KeySender]::Press(0xB1, 1); 'OK' } # VK_MEDIA_PREV_TRACK
    'stop'      { [KeySender]::Press(0xB2, 1); 'OK' } # VK_MEDIA_STOP
    default     { 'UNKNOWN_ACTION' }
}
