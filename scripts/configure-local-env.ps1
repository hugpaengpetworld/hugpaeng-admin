param(
  [switch]$FromSupabaseCli
)

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

function New-RandomHex {
  param([int]$ByteCount = 32)
  $bytes = New-Object byte[] $ByteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

Write-Host "Configuring BMP Booking with Supabase Cloud (secret values are hidden)"
if ($FromSupabaseCli) {
  $rawKeys = npx.cmd supabase projects api-keys --project-ref wnnxdcxuxupmnplkegkt --reveal -o json
  if ($LASTEXITCODE -ne 0) { throw "SUPABASE_API_KEYS_FAILED" }
  $apiKeys = $rawKeys | ConvertFrom-Json
  $publicKey = ($apiKeys | Where-Object { $_.type -eq "publishable" } | Select-Object -First 1).api_key
  $serviceKey = ($apiKeys | Where-Object { $_.type -eq "secret" } | Select-Object -First 1).api_key
  if ([string]::IsNullOrWhiteSpace($publicKey)) {
    $publicKey = ($apiKeys | Where-Object { $_.name -eq "anon" } | Select-Object -First 1).api_key
  }
  if ([string]::IsNullOrWhiteSpace($serviceKey)) {
    $serviceKey = ($apiKeys | Where-Object { $_.name -eq "service_role" } | Select-Object -First 1).api_key
  }
}
else {
  $publicKeySecure = Read-Host "Paste Publishable key or legacy anon key" -AsSecureString
  $serviceKeySecure = Read-Host "Paste Secret key or legacy service_role key" -AsSecureString
  $publicKey = ConvertFrom-SecureValue $publicKeySecure
  $serviceKey = ConvertFrom-SecureValue $serviceKeySecure
}

if ([string]::IsNullOrWhiteSpace($publicKey) -or [string]::IsNullOrWhiteSpace($serviceKey)) {
  throw "SUPABASE_KEYS_REQUIRED"
}

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env.local"
$lines = @(
  "NEXT_PUBLIC_SUPABASE_URL=https://wnnxdcxuxupmnplkegkt.supabase.co",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=$publicKey",
  "NEXT_PUBLIC_APP_URL=http://localhost:3000",
  "SUPABASE_SERVICE_ROLE_KEY=$serviceKey",
  "LINE_CHANNEL_ACCESS_TOKEN=",
  "LINE_CHANNEL_SECRET=",
  "LINE_LOGIN_CHANNEL_ID=",
  "CRON_SHARED_SECRET=$(New-RandomHex)",
  "RATE_LIMIT_HASH_SECRET=$(New-RandomHex)",
  "APP_TIMEZONE=Asia/Bangkok",
  "APP_CURRENCY=THB",
  "DEFAULT_TENANT_SLUG=baan-mhor-poy",
  "INITIAL_OWNER_EMAIL=admin@hug-paeng.com",
  "TEST_DATABASE_URL=",
  "MIGRATION_DATABASE_URL="
)

[IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
$publicKey = $null
$serviceKey = $null
Write-Host ".env.local created (ignored by Git; never commit this file)"
