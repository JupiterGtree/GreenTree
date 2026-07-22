param(
  [ValidateSet("Test", "Demo")]
  [string]$Mode = "Test"
)

$ErrorActionPreference = "Stop"
$workspaceWindows = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$workspaceDrive = $workspaceWindows.Substring(0, 1).ToLowerInvariant()
$workspaceRemainder = $workspaceWindows.Substring(2).Replace("\", "/")
$workspaceWsl = "/mnt/$workspaceDrive$workspaceRemainder"
$solanaBin = "/home/arash/.local/share/solana/install/active_release/bin"
$wslBuildPath = "$solanaBin`:/home/arash/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
$validatorLog = Join-Path $workspaceWindows ".localnet\validator.log"
$validatorErrorLog = Join-Path $workspaceWindows ".localnet\validator-error.log"
New-Item -ItemType Directory -Force (Split-Path $validatorLog) | Out-Null

wsl.exe --cd $workspaceWsl /usr/bin/env "PATH=$wslBuildPath" "CARGO_NET_OFFLINE=true" /home/arash/.avm/bin/anchor-1.1.2 build
if ($LASTEXITCODE -ne 0) {
  throw "Anchor build failed."
}

$validator = Start-Process -FilePath "wsl.exe" -ArgumentList @("--cd", $workspaceWsl, "$solanaBin/solana-test-validator", "--reset", "--ledger", ".localnet/ledger", "--quiet") -WindowStyle Hidden -PassThru -RedirectStandardOutput $validatorLog -RedirectStandardError $validatorErrorLog

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 500
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    wsl.exe "$solanaBin/solana" cluster-version --url http://127.0.0.1:8899 2>$null | Out-Null
    $clusterExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorAction
    if ($clusterExitCode -eq 0) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    throw "Localnet validator did not become ready. See $validatorErrorLog"
  }

  wsl.exe "$solanaBin/solana" airdrop 100 7fgxFZ1h1tmg71hydvcdTAYHof6LV8U5U6eSFbq9MCSC --url http://127.0.0.1:8899 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Authority airdrop failed."
  }
  wsl.exe --cd $workspaceWsl "$solanaBin/solana" program deploy target/deploy/gtree_foundation_sale.so --program-id target/deploy/gtree_foundation_sale-keypair.json --keypair test-keys/authority.json --url http://127.0.0.1:8899
  if ($LASTEXITCODE -ne 0) {
    throw "Program deployment failed."
  }

  $env:RPC_URL = "http://127.0.0.1:8899"
  $env:ANCHOR_WALLET = (Resolve-Path (Join-Path $workspaceWindows "test-keys\authority.json")).Path
  Push-Location $workspaceWindows
  try {
    if ($Mode -eq "Test") {
      npm run test:localnet
    } else {
      npm run client:demo
    }
    if ($LASTEXITCODE -ne 0) {
      throw "$Mode execution failed."
    }
  } finally {
    Pop-Location
  }
} finally {
  if ($null -ne $validator -and -not $validator.HasExited) {
    Stop-Process -Id $validator.Id -Force
  }
}
