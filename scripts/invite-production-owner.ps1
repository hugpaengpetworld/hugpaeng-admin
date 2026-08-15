param(
  [switch]$ConfirmProductionInvite
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmProductionInvite) {
  throw "Production OWNER invitation requires -ConfirmProductionInvite after the production domain and Supabase Auth redirects are live."
}

$expectedProjectRef = "dghipgebiioxphbbyvxp"
$expectedProductionUrl = "https://$expectedProjectRef.supabase.co"
$environmentPath = Join-Path $PSScriptRoot "..\.env.production.local"

if (-not (Test-Path -LiteralPath $environmentPath)) {
  throw ".env.production.local is required."
}

$configuredUrl = Get-Content -LiteralPath $environmentPath |
  Where-Object { $_ -match '^NEXT_PUBLIC_SUPABASE_URL=' } |
  Select-Object -First 1
if ($configuredUrl -ne "NEXT_PUBLIC_SUPABASE_URL=$expectedProductionUrl") {
  throw "Refusing to invite: environment is not the approved production project."
}

$previousEnvironmentFile = $env:APP_ENV_FILE
try {
  $env:APP_ENV_FILE = $environmentPath
  & npx.cmd tsx scripts/invite-owner.ts --email admin@hug-paeng.com --name OWNER
  if ($LASTEXITCODE -ne 0) {
    throw "Production OWNER invitation failed."
  }
}
finally {
  $env:APP_ENV_FILE = $previousEnvironmentFile
}
