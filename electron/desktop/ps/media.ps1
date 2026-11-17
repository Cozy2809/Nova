# Nova Desktop — sesiones multimedia de Windows (SMTC). Acciones: status | play | pause | toggle | next | prev. Salida: JSON.
# Requiere Windows PowerShell 5.1 (powershell.exe). PENDIENTE DE VERIFICAR EN WINDOWS REAL.
param([string]$Action = 'status', [string]$Session = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); [void]$task.Wait(8000); $task.Result }
$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$propType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ($mgrType::RequestAsync()) $mgrType
$current = $mgr.GetCurrentSession()
$all = @($mgr.GetSessions())

function Describe($s) {
  $info = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties(); $props = Await ($s.TryGetMediaPropertiesAsync()) $propType
  $pos = $tl.Position.TotalSeconds; $dur = $tl.EndTime.TotalSeconds - $tl.StartTime.TotalSeconds
  $status = [string]$info.PlaybackStatus
  if ($status -eq 'Playing' -and $dur -gt 0) { $pos = [Math]::Min($dur, $pos + ([DateTimeOffset]::UtcNow - $tl.LastUpdatedTime).TotalSeconds) }
  [pscustomobject]@{
    id = $s.SourceAppUserModelId; current = ($current -ne $null -and $s.SourceAppUserModelId -eq $current.SourceAppUserModelId)
    status = $status; title = $props.Title; artist = $props.Artist; album = $props.AlbumTitle
    positionSec = [Math]::Round($pos, 1); durationSec = [Math]::Round($dur, 1)
    canPlay = $info.Controls.IsPlayEnabled; canPause = $info.Controls.IsPauseEnabled; canNext = $info.Controls.IsNextEnabled; canPrev = $info.Controls.IsPreviousEnabled
  }
}

if ($Action -eq 'status') {
  $rows = @($all | ForEach-Object { Describe $_ })
  ConvertTo-Json -Compress -Depth 4 -InputObject ([pscustomobject]@{ sessions = $rows })
} else {
  $target = $current
  if ($Session) { $target = $all | Where-Object { $_.SourceAppUserModelId -eq $Session } | Select-Object -First 1 }
  if ($target -eq $null) { throw 'No hay ninguna sesión multimedia activa' }
  switch ($Action) {
    'play'   { $r = Await ($target.TryPlayAsync()) ([bool]) }
    'pause'  { $r = Await ($target.TryPauseAsync()) ([bool]) }
    'toggle' { $r = Await ($target.TryTogglePlayPauseAsync()) ([bool]) }
    'next'   { $r = Await ($target.TrySkipNextAsync()) ([bool]) }
    'prev'   { $r = Await ($target.TrySkipPreviousAsync()) ([bool]) }
    default  { throw 'Acción desconocida' }
  }
  ConvertTo-Json -Compress -InputObject ([pscustomobject]@{ ok = [bool]$r })
}
