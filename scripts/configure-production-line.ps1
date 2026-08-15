$ErrorActionPreference = "Stop"

function ConvertFrom-SecureValue {
  param([Security.SecureString]$Value)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Set-EnvironmentValue {
  param(
    [string[]]$Lines,
    [string]$Name,
    [string]$Value
  )

  $prefix = "$Name="
  $found = $false
  $updated = foreach ($line in $Lines) {
    if ($line.StartsWith($prefix, [StringComparison]::Ordinal)) {
      $found = $true
      "$prefix$Value"
    }
    else {
      $line
    }
  }
  if (-not $found) {
    $updated += "$prefix$Value"
  }
  return $updated
}

$expectedProductionUrl = "https://dghipgebiioxphbbyvxp.supabase.co"
$environmentPath = Join-Path $PSScriptRoot "..\.env.production.local"

if (-not (Test-Path -LiteralPath $environmentPath)) {
  throw ".env.production.local is required. Run npm.cmd run env:production:configure first."
}

$lines = Get-Content -LiteralPath $environmentPath
if ($lines -notcontains "NEXT_PUBLIC_SUPABASE_URL=$expectedProductionUrl") {
  throw "Refusing to configure LINE: environment is not the approved production project."
}

$tokenSecure = Read-Host "LINE production Channel access token" -AsSecureString
$secretSecure = Read-Host "LINE production Channel secret" -AsSecureString
$token = ConvertFrom-SecureValue $tokenSecure
$secret = ConvertFrom-SecureValue $secretSecure

try {
  if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 40) {
    throw "LINE Channel access token is missing or unexpectedly short."
  }
  if ([string]::IsNullOrWhiteSpace($secret) -or $secret.Length -lt 20) {
    throw "LINE Channel secret is missing or unexpectedly short."
  }

  $lines = Set-EnvironmentValue -Lines $lines -Name "LINE_CHANNEL_ACCESS_TOKEN" -Value $token
  $lines = Set-EnvironmentValue -Lines $lines -Name "LINE_CHANNEL_SECRET" -Value $secret
  [IO.File]::WriteAllLines($environmentPath, $lines, [Text.UTF8Encoding]::new($false))
}
finally {
  $token = $null
  $secret = $null
}

Write-Host "LINE production credentials stored in Git-ignored .env.production.local (values were not displayed)."
