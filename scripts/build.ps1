$ErrorActionPreference = "Stop"
$Project = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Project ".venv\Scripts\python.exe"
$Spec = Join-Path $Project "packaging\PDFToolbox.spec"
$Dist = Join-Path $Project "release"
$Build = Join-Path $Project "build"

& $Python -I -m PyInstaller --noconfirm --clean --distpath $Dist --workpath $Build $Spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed with exit code $LASTEXITCODE" }
Write-Host "Built: $Dist\PDF Toolbox\PDF Toolbox.exe"
