$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$revision = '4467e97cd97194c2c54762043cf121c6d313db12'
Push-Location -LiteralPath $projectRoot
try {
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw 'Install uv from https://docs.astral.sh/uv/ first.' }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is required.' }
    if (-not (Test-Path -LiteralPath 'epoch_40_new.pth')) { throw 'Place the approved epoch_40_new.pth in the project root first.' }
    $weightHash = (Get-FileHash -LiteralPath 'epoch_40_new.pth' -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($weightHash -ne '1730b121d97c3f9429eace07cbf454d1b2862b76eeb32b84af8b028c6f5759b9') {
        throw 'Weights differ from the validated photo prototype. Verify the original file before continuing.'
    }
    if (-not (Test-Path -LiteralPath '.cache/dh-live-upstream')) {
        git -c http.sslBackend=openssl clone https://github.com/kleinlee/DH_live.git .cache/dh-live-upstream
        if ($LASTEXITCODE -ne 0) { throw 'Upstream download failed.' }
        git -C .cache/dh-live-upstream checkout --detach $revision
        if ($LASTEXITCODE -ne 0) { throw 'Could not select the validated upstream revision.' }
    }
    $currentRevision = git -C .cache/dh-live-upstream rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $currentRevision -ne $revision) { throw 'Existing upstream cache differs; it was not modified. Restore the validated revision in a separate cache.' }
    if (-not (Test-Path -LiteralPath '.cache/dh-prep-py312/Scripts/python.exe')) {
        uv venv --python 3.12 .cache/dh-prep-py312
        if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed.' }
    }
    uv pip install --python .cache/dh-prep-py312/Scripts/python.exe torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
    if ($LASTEXITCODE -ne 0) { throw 'CPU PyTorch installation failed.' }
    uv pip install --python .cache/dh-prep-py312/Scripts/python.exe -r scripts/avatar-requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Photo dependencies installation failed.' }
    Write-Output 'Photo environment ready. Configure .env locally, then run npm run dev.'
} finally { Pop-Location }
