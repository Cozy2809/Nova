# Nova Desktop — volumen real del dispositivo de salida predeterminado (Core Audio, IAudioEndpointVolume).
# Acciones: get | set (-Level 0..100) | mute (-Muted 0|1). Salida: JSON {level, muted}. PENDIENTE DE VERIFICAR EN WINDOWS REAL.
param([string]$Action = 'get', [int]$Level = -1, [int]$Muted = -1)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
namespace NovaAudio {
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr p); int UnregisterControlChangeNotify(IntPtr p);
    int GetChannelCount(out uint c);
    int SetMasterVolumeLevel(float l, ref Guid ctx); int SetMasterVolumeLevelScalar(float l, ref Guid ctx);
    int GetMasterVolumeLevel(out float l); int GetMasterVolumeLevelScalar(out float l);
    int SetChannelVolumeLevel(uint ch, float l, ref Guid ctx); int SetChannelVolumeLevelScalar(uint ch, float l, ref Guid ctx);
    int GetChannelVolumeLevel(uint ch, out float l); int GetChannelVolumeLevelScalar(uint ch, out float l);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid ctx); int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator { int EnumAudioEndpoints(int flow, int mask, out IntPtr d); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d); }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumerator { }
  public static class Vol {
    static IAudioEndpointVolume Ep() {
      var en = (IMMDeviceEnumerator)(new MMDeviceEnumerator()); IMMDevice dev; Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));
      Guid iid = typeof(IAudioEndpointVolume).GUID; object o; Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, IntPtr.Zero, out o)); return (IAudioEndpointVolume)o;
    }
    public static float Get() { float v; Marshal.ThrowExceptionForHR(Ep().GetMasterVolumeLevelScalar(out v)); return v; }
    public static bool IsMuted() { bool m; Marshal.ThrowExceptionForHR(Ep().GetMute(out m)); return m; }
    public static void Set(float v) { Guid g = Guid.Empty; Marshal.ThrowExceptionForHR(Ep().SetMasterVolumeLevelScalar(v, ref g)); }
    public static void Mute(bool m) { Guid g = Guid.Empty; Marshal.ThrowExceptionForHR(Ep().SetMute(m, ref g)); }
  }
}
"@
switch ($Action) {
  'get'  { }
  'set'  { if ($Level -lt 0 -or $Level -gt 100) { throw 'Nivel fuera de rango' }; [NovaAudio.Vol]::Set([float]($Level / 100.0)) }
  'mute' { if ($Muted -ne 0 -and $Muted -ne 1) { throw 'Valor no válido' }; [NovaAudio.Vol]::Mute([bool]$Muted) }
  default { throw 'Acción desconocida' }
}
ConvertTo-Json -Compress -InputObject ([pscustomobject]@{ level = [int][Math]::Round([NovaAudio.Vol]::Get() * 100); muted = [NovaAudio.Vol]::IsMuted() })
