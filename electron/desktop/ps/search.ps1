# Nova Desktop — búsqueda con el índice de Windows Search (no hace falta administrador; respeta los permisos del usuario).
# Se llama con -File y parámetros SEPARADOS (nunca se construye un comando con texto del usuario). El texto se limpia a letras,
# números y espacios antes de entrar en la consulta SQL del índice. Modo: name (nombre) | content (contenido).
# PENDIENTE DE VERIFICAR EN WINDOWS REAL. Si falla, Nova usa el recorrido acotado de carpetas.
param([string]$Query = '', [string]$Scopes = '', [string]$Mode = 'name', [int]$Limit = 40)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($Limit -lt 1 -or $Limit -gt 200) { $Limit = 40 }
$clean = ([regex]::Replace($Query, '[^\p{L}\p{N} ._-]', ' ')).Trim()
$tokens = @($clean -split '\s+' | Where-Object { $_.Length -ge 1 } | Select-Object -First 6)
if ($tokens.Count -eq 0) { throw 'Consulta vacía' }
$scopeSql = (($Scopes -split '\|' | Where-Object { $_ } | ForEach-Object { "SCOPE='file:" + $_.Replace("'", "''") + "'" }) -join ' OR ')
if (-not $scopeSql) { throw 'Sin carpetas donde buscar' }
if ($Mode -eq 'content') { $cond = (($tokens | ForEach-Object { "CONTAINS('""" + $_ + """')" }) -join ' AND ') }
else { $cond = (($tokens | ForEach-Object { "System.FileName LIKE '%" + $_ + "%'" }) -join ' AND ') }
$sql = "SELECT TOP $Limit System.ItemPathDisplay, System.FileName, System.Size, System.DateModified, System.ItemType FROM SystemIndex WHERE ($scopeSql) AND $cond ORDER BY System.DateModified DESC"
$conn = New-Object -ComObject ADODB.Connection
$conn.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
$rs = New-Object -ComObject ADODB.Recordset
$rs.Open($sql, $conn)
$rows = New-Object System.Collections.ArrayList
while (-not $rs.EOF) {
  $d = $rs.Fields.Item('System.DateModified').Value
  [void]$rows.Add([pscustomobject]@{
    path = [string]$rs.Fields.Item('System.ItemPathDisplay').Value; name = [string]$rs.Fields.Item('System.FileName').Value
    size = $rs.Fields.Item('System.Size').Value; mtime = $(if ($d) { ([DateTimeOffset]$d).ToUnixTimeMilliseconds() } else { 0 })
    isDir = ([string]$rs.Fields.Item('System.ItemType').Value -eq 'Directory')
  })
  $rs.MoveNext()
}
$rs.Close(); $conn.Close()
ConvertTo-Json -Compress -InputObject ([pscustomobject]@{ items = @($rows) })
