$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$versionFile = Join-Path $root "VERSION.txt"
$version = (Get-Content -LiteralPath $versionFile -Raw).Trim()

if ($version -notmatch '^\d+\.\d+\.\d+$') {
    throw "VERSION.txt must contain a semantic version such as 1.0.0."
}

$appSource = Get-Content -LiteralPath (Join-Path $root "js\app.js") -Raw
if ($appSource -notmatch 'const APP_VERSION="([^"]+)"') {
    throw "Could not find APP_VERSION in js\app.js."
}
if ($Matches[1] -ne $version) {
    throw "Version mismatch: VERSION.txt is $version, but js\app.js says $($Matches[1]). Update both before packaging."
}

$node = Get-Command node -ErrorAction Stop
& $node.Source (Join-Path $root "js\build-bundle.cjs")
if ($LASTEXITCODE -ne 0) {
    throw "Browser bundle build failed."
}

$dist = Join-Path $root "dist"
$stage = Join-Path ([IO.Path]::GetTempPath()) ("SiGamePackEditor-" + $version)
$zipPath = Join-Path $dist ("SiGamePackEditor-v" + $version + ".zip")

New-Item -ItemType Directory -Path $dist -Force | Out-Null
if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $stage "css") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage "js") -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $root "index.html") -Destination $stage
Copy-Item -LiteralPath (Join-Path $root "VERSION.txt") -Destination $stage
Copy-Item -LiteralPath (Join-Path $root "css\app.css") -Destination (Join-Path $stage "css")
Copy-Item -LiteralPath (Join-Path $root "js\app.bundle.js") -Destination (Join-Path $stage "js")

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse -Force

Write-Output "Release package created: $zipPath"
Write-Output "Only runtime files are included: index.html, css/app.css, js/app.bundle.js, VERSION.txt."
