$ErrorActionPreference = "Stop"
$Project = Split-Path -Parent $PSScriptRoot
$Executable = Join-Path $Project "release\PDF Toolbox\PDF Toolbox.exe"
$Shortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "PDF Toolbox.lnk"

if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
    throw "Build PDF Toolbox first: $Executable"
}

$Shell = New-Object -ComObject WScript.Shell
$Link = $Shell.CreateShortcut($Shortcut)
$Link.TargetPath = $Executable
$Link.WorkingDirectory = Split-Path -Parent $Executable
$Link.IconLocation = "$Executable,0"
$Link.Description = "Open PDF Toolbox"
$Link.Save()
Write-Host "Created shortcut: $Shortcut"
