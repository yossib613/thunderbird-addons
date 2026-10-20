# Builds dist\notes-reminders-<version>.xpi from the src folder.
# An .xpi is a zip file. Entry names must use forward slashes, which
# Compress-Archive in Windows PowerShell 5.1 does not do, so build it with .NET.

$ErrorActionPreference = "Stop"
$src = Join-Path $PSScriptRoot "src"
$dist = Join-Path $PSScriptRoot "dist"
$version = (Get-Content (Join-Path $src "manifest.json") -Raw | ConvertFrom-Json).version
$xpi = Join-Path $dist "notes-reminders-$version.xpi"

New-Item -ItemType Directory -Force $dist | Out-Null
if (Test-Path $xpi) { Remove-Item $xpi }

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($xpi, "Create")
try {
    Get-ChildItem $src -Recurse -File | ForEach-Object {
        $entry = $_.FullName.Substring($src.Length + 1).Replace("\", "/")
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entry)
    }
}
finally {
    $zip.Dispose()
}

Write-Output $xpi
