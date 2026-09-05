$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path "$PSScriptRoot/../..").Path
$target = Join-Path $repo 'AI_output/linux-validation/work'
if (Test-Path -LiteralPath $target) { throw 'Validation work directory already exists; preserve it and choose a new directory.' }
New-Item -ItemType Directory -Path $target | Out-Null
# Explicit allowlist: never copy .env, credentials, git data or historical ledgers.
foreach ($name in @('packages','apps','scripts','package.json','tsconfig.json')) {
    Copy-Item -LiteralPath (Join-Path $repo $name) -Destination $target -Recurse
}
$youth = [string][char]0x9752 + [char]0x5e74
foreach ($name in @('.motion-models/face_landmarker.task',"AI_output/normalized/$youth-cf1a11df052a/source.png",'AI_output/motion/youth-v2/static_locked_base.png','AI_output/motion/youth-v2/donors')) {
    $dest = Join-Path $target $name
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo $name) -Destination $dest -Recurse
}
Write-Output $target
