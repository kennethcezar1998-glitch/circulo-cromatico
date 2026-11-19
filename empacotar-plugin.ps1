# Gera dist\Circulo-Cromatico.ccx a partir da pasta photoshop-plugin.
# O .ccx é um ZIP com o manifest.json na raiz. Rode de novo sempre que mudar o plugin
# (lembre de aumentar "version" no manifest.json antes de mandar uma atualização).
#
# Uso:  powershell -ExecutionPolicy Bypass -File .\empacotar-plugin.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$src    = Join-Path $root 'photoshop-plugin'
$dist   = Join-Path $root 'dist'
$output = Join-Path $dist 'Circulo-Cromatico.ccx'

if (-not (Test-Path (Join-Path $src 'manifest.json'))) { throw "manifest.json não encontrado em $src" }
New-Item -ItemType Directory -Force $dist | Out-Null
if (Test-Path $output) { Remove-Item $output -Force }

$zip = [System.IO.Compression.ZipFile]::Open($output, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
    # Caminho relativo com "/" (o instalador da Adobe espera separador de ZIP padrão)
    $rel = $_.FullName.Substring($src.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $zip.Dispose()
}

$manifest = Get-Content (Join-Path $src 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host "Pacote gerado: $output (versão $($manifest.version))"
