# Lanzador de Nova sin consola: abre Ollama si hace falta, compila la interfaz solo si cambio y abre la app.
# Si algo falla, el detalle queda en launch.log
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$log = Join-Path $Root 'launch.log'
try {
  if (-not (Get-Process -Name 'ollama*' -ErrorAction SilentlyContinue)) {
    Start-Process 'ollama' -ArgumentList 'serve' -WindowStyle Hidden
    Start-Sleep -Seconds 2
  }
  $dist = Join-Path $Root 'dist\index.html'
  $needs = -not (Test-Path $dist)
  if (-not $needs) {
    $t = (Get-Item $dist).LastWriteTime
    $newer = Get-ChildItem -Path (Join-Path $Root 'src'), (Join-Path $Root 'index.html'), (Join-Path $Root 'tailwind.config.js'), (Join-Path $Root 'mobile.html') -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $t } | Select-Object -First 1
    $needs = [bool]$newer
  }
  if ($needs) {
    & npm.cmd run build *> $log
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la compilacion de la interfaz (mira launch.log)' }
  }
  Start-Process -FilePath (Join-Path $Root 'node_modules\electron\dist\electron.exe') -ArgumentList '.' -WorkingDirectory $Root
} catch {
  Add-Content $log ($_.Exception.Message)
  Add-Type -AssemblyName System.Windows.Forms
  [void][System.Windows.Forms.MessageBox]::Show('No se pudo abrir Nova: ' + $_.Exception.Message, 'Nova')
}
