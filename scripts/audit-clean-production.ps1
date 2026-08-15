$ErrorActionPreference = "Stop"

$expectedProjectRef = "dghipgebiioxphbbyvxp"
$expectedProductionUrl = "https://$expectedProjectRef.supabase.co"
$environmentPath = Join-Path $PSScriptRoot "..\.env.production.local"

if (-not (Test-Path -LiteralPath $environmentPath)) {
  throw ".env.production.local is required. Run npm.cmd run env:production:configure first."
}

$configuredUrl = Get-Content -LiteralPath $environmentPath |
  Where-Object { $_ -match '^NEXT_PUBLIC_SUPABASE_URL=' } |
  Select-Object -First 1

if ($configuredUrl -ne "NEXT_PUBLIC_SUPABASE_URL=$expectedProductionUrl") {
  throw "Refusing to audit: .env.production.local is not hard-locked to the approved production project."
}

$previousEnvironmentFile = $env:APP_ENV_FILE
$previousCleanRequirement = $env:REQUIRE_CLEAN_TEST_FIXTURES
try {
  $env:APP_ENV_FILE = $environmentPath
  $env:REQUIRE_CLEAN_TEST_FIXTURES = "1"
  Write-Host "Auditing clean production target $expectedProjectRef (read-only)..."
  & npx.cmd tsx scripts/audit-test-fixtures.ts
  if ($LASTEXITCODE -ne 0) {
    throw "Production clean-state audit failed."
  }
}
finally {
  $env:APP_ENV_FILE = $previousEnvironmentFile
  $env:REQUIRE_CLEAN_TEST_FIXTURES = $previousCleanRequirement
}
