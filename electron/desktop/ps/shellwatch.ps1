# Nova Desktop — vigilante del shell (update 31, ligero). SOLO LEE estado público de Windows; no modifica nada ni recibe texto libre.
# Emite una línea JSON cuando algo cambia: pantalla completa/no molestar (SHQueryUserNotificationState), ventana activa,
# barra de tareas oculta automáticamente (SHAppBarMessage) y, si -Windows 1, las ventanas abiertas.
# Cambios frente a la update 30: las ventanas se enumeran con EnumWindows (sin recorrer todos los procesos), solo cada
# -WindowsEveryTicks ciclos, y el nombre/ruta de cada proceso se consulta una vez y se recuerda.
# PENDIENTE DE VERIFICAR EN WINDOWS REAL (no se pudo ejecutar en el entorno de desarrollo).
param([int]$IntervalMs = 1500, [int]$Windows = 0, [int]$WindowsEveryTicks = 2)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System; using System.Collections.Generic; using System.Text; using System.Runtime.InteropServices;
public class NovaWin { public uint Pid; public string Title; public bool Min; }
public static class NovaWatch {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct APPBARDATA { public uint cbSize; public IntPtr hWnd; public uint uCallbackMessage; public uint uEdge; public RECT rc; public IntPtr lParam; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public uint cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);
  [DllImport("shell32.dll")] public static extern UIntPtr SHAppBarMessage(uint msg, ref APPBARDATA data);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int idx);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  public static bool CoversMonitor(IntPtr h) {
    if (h == IntPtr.Zero) return false;
    StringBuilder sb = new StringBuilder(64); GetClassName(h, sb, 64); string c = sb.ToString();
    if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd") return false;
    RECT r; if (!GetWindowRect(h, out r)) return false;
    IntPtr m = MonitorFromWindow(h, 2); MONITORINFO mi = new MONITORINFO(); mi.cbSize = (uint)Marshal.SizeOf(typeof(MONITORINFO));
    if (!GetMonitorInfo(m, ref mi)) return false;
    return r.Left <= mi.rcMonitor.Left && r.Top <= mi.rcMonitor.Top && r.Right >= mi.rcMonitor.Right && r.Bottom >= mi.rcMonitor.Bottom;
  }
  public static bool TaskbarAutoHide() {
    APPBARDATA d = new APPBARDATA(); d.cbSize = (uint)Marshal.SizeOf(typeof(APPBARDATA));
    return ((UInt64)SHAppBarMessage(4, ref d) & 1) == 1;
  }
  // Ventanas de nivel superior que Windows mostraría en la barra de tareas (visibles, con título, sin propietario, sin "cloak").
  // EnumWindows recorre de arriba abajo (orden Z): la primera ventana de cada proceso es la más cercana al frente.
  public static List<NovaWin> TopWindows() {
    List<NovaWin> res = new List<NovaWin>(); HashSet<uint> seen = new HashSet<uint>();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      if (GetWindow(h, 4) != IntPtr.Zero) return true;            // GW_OWNER: ventanas con propietario no van a la barra
      int ex = GetWindowLong(h, -20); if ((ex & 0x80) != 0 && (ex & 0x40000) == 0) return true; // WS_EX_TOOLWINDOW sin APPWINDOW
      int cloaked = 0; DwmGetWindowAttribute(h, 14, out cloaked, 4); if (cloaked != 0) return true;
      int n = GetWindowTextLength(h); if (n <= 0) return true;
      StringBuilder sb = new StringBuilder(n + 1); GetWindowText(h, sb, n + 1);
      uint pid; GetWindowThreadProcessId(h, out pid); if (pid == 0 || seen.Contains(pid)) return true; seen.Add(pid);
      NovaWin w = new NovaWin(); w.Pid = pid; w.Title = sb.ToString(); w.Min = IsIconic(h); res.Add(w);
      return true;
    }, IntPtr.Zero);
    return res;
  }
}
"@
[void][NovaWatch]::SetProcessDPIAware()
$last = ''; $tick = 0; $cache = @{}; $wins = @()
function Get-Info([uint32]$procId) {
  if (-not $cache.ContainsKey($procId)) {
    $n = ''; $p = $null
    try { $pr = [System.Diagnostics.Process]::GetProcessById([int]$procId); $n = $pr.ProcessName; try { $p = $pr.MainModule.FileName } catch {} } catch {}
    $cache[$procId] = @{ n = $n; p = $p }
  }
  return $cache[$procId]
}
while ($true) {
  try {
    $q = 0; [void][NovaWatch]::SHQueryUserNotificationState([ref]$q)
    $fg = [NovaWatch]::GetForegroundWindow(); $fgPid = [uint32]0; [void][NovaWatch]::GetWindowThreadProcessId($fg, [ref]$fgPid)
    $o = [ordered]@{ t = 'state'; quns = $q; cover = [NovaWatch]::CoversMonitor($fg); abh = [NovaWatch]::TaskbarAutoHide(); fg = [int]$fgPid }
    if ($Windows -eq 1) {
      if (($tick % [Math]::Max(1, $WindowsEveryTicks)) -eq 0) {
        $list = [NovaWatch]::TopWindows(); $alive = @{}
        $wins = @($list | ForEach-Object { $alive[$_.Pid] = $true; $i = Get-Info $_.Pid; if ($i.n) { [pscustomobject]@{ pid = [int]$_.Pid; n = $i.n; t = $_.Title; p = $i.p; m = [bool]$_.Min } } })
        foreach ($k in @($cache.Keys)) { if (-not $alive.ContainsKey($k)) { $cache.Remove($k) } }   # procesos que ya no tienen ventana
      }
      $o.w = $wins
    }
    $tick++
    $json = ConvertTo-Json -Compress -Depth 4 -InputObject $o
    if ($json -ne $last) { $last = $json; [Console]::Out.WriteLine($json); [Console]::Out.Flush() }
  } catch { }
  Start-Sleep -Milliseconds $IntervalMs
}
