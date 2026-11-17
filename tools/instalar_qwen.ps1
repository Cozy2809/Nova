# Instala Qwen Code (agente de codigo de QwenLM/Alibaba, Apache-2.0) de forma SEGURA:
# descarga el instalador oficial a un archivo, lo muestra y pide confirmacion antes de ejecutarlo.
# Uso:  powershell -ExecutionPolicy Bypass -File tools\instalar_qwen.ps1
$ErrorActionPreference = 'Stop'
$url = 'https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1'
$dst = Join-Path $env:TEMP 'install-qwen-standalone.ps1'
Write-Host "Descargando $url"
Invoke-WebRequest $url -OutFile $dst -UseBasicParsing
Write-Host ("Guardado en " + $dst)
Write-Host ("SHA256: " + (Get-FileHash $dst -Algorithm SHA256).Hash)
Write-Host "---- primeras lineas del instalador ----"
Get-Content $dst -TotalCount 25
Write-Host "----------------------------------------"
Write-Host ("Puedes revisarlo entero con:  notepad " + $dst)
$r = Read-Host "Ejecutar el instalador ahora? (s/N)"
if ($r -notmatch '^[sSyY]') { Write-Host 'Cancelado. No se ha instalado nada.'; exit 0 }
powershell -NoProfile -ExecutionPolicy Bypass -File $dst
Write-Host ""
Write-Host "Cierra y vuelve a abrir PowerShell y comprueba:  qwen --version"
Write-Host "Primer uso: crea una carpeta de pruebas (NO tu carpeta personal), entra en ella y ejecuta  qwen  y luego  /auth"
$s = Read-Host "Instalar tambien el SDK (@qwen-code/sdk) en jarvis-clone? Solo si vas a programar con el (s/N)"
if ($s -match '^[sSyY]') { Set-Location (Split-Path -Parent $PSScriptRoot); npm install @qwen-code/sdk }
