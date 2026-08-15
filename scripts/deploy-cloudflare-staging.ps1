param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$AppUrl
)

$ErrorActionPreference = "Stop"

$expectedAccountId = "dd0c01bdf56fa7bba2e915d0522a9666"
$expectedSupabaseHost = "wnnxdcxuxupmnplkegkt.supabase.co"
$expectedAppHost = "bmp-booking-staging.hugpaeng-petworld.workers.dev"
$environmentPath = Join-Path $PSScriptRoot "..\.env.local"

if (-not (Test-Path -LiteralPath $environmentPath)) {
  throw ".env.local is required for staging deployment."
}

$environment = @{}
Get-Content -LiteralPath $environmentPath | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    $key = $matches[1]
    $value = $matches[2].Trim()

    if (
      $value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $environment[$key] = $value
  }
}

$secretNames = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SHARED_SECRET",
  "RATE_LIMIT_HASH_SECRET"
)

foreach ($secretName in $secretNames) {
  if (-not $environment.ContainsKey($secretName) -or [string]::IsNullOrWhiteSpace($environment[$secretName])) {
    throw "$secretName is missing or empty in .env.local."
  }
}

try {
  $supabaseUri = [Uri]$environment["NEXT_PUBLIC_SUPABASE_URL"]
}
catch {
  throw "NEXT_PUBLIC_SUPABASE_URL is invalid."
}

if ($supabaseUri.Host -ne $expectedSupabaseHost) {
  throw "Refusing to deploy: the Supabase host is not the approved CLEAN staging project."
}

$appUri = [Uri]$AppUrl
if ($appUri.Scheme -ne "https" -or $appUri.Host -ne $expectedAppHost -or $appUri.AbsolutePath -ne "/") {
  throw "Refusing to deploy: AppUrl must be the approved Cloudflare staging origin."
}

$env:CLOUDFLARE_ACCOUNT_ID = $expectedAccountId
$env:NEXT_PUBLIC_SUPABASE_URL = $environment["NEXT_PUBLIC_SUPABASE_URL"]
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $environment["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
$env:NEXT_PUBLIC_APP_URL = $AppUrl.TrimEnd('/')
$env:SUPABASE_SERVICE_ROLE_KEY = $environment["SUPABASE_SERVICE_ROLE_KEY"]
$env:CRON_SHARED_SECRET = $environment["CRON_SHARED_SECRET"]
$env:RATE_LIMIT_HASH_SECRET = $environment["RATE_LIMIT_HASH_SECRET"]
$env:APP_TIMEZONE = "Asia/Bangkok"
$env:APP_CURRENCY = "THB"
$env:DEFAULT_TENANT_SLUG = "baan-mhor-poy"

$stagingSecrets = [ordered]@{
  NEXT_PUBLIC_SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY = $env:NEXT_PUBLIC_SUPABASE_ANON_KEY
  NEXT_PUBLIC_APP_URL = $env:NEXT_PUBLIC_APP_URL
  SUPABASE_SERVICE_ROLE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY
  CRON_SHARED_SECRET = $env:CRON_SHARED_SECRET
  RATE_LIMIT_HASH_SECRET = $env:RATE_LIMIT_HASH_SECRET
}

Write-Host "Target Worker: bmp-booking-staging"
Write-Host "Target Supabase host: $expectedSupabaseHost"
Write-Host "Staging application URL: $($env:NEXT_PUBLIC_APP_URL)"
Write-Host "Uploading encrypted staging secrets..."

$stagingSecrets | ConvertTo-Json -Compress | & npx.cmd wrangler secret bulk --env staging
if ($LASTEXITCODE -ne 0) {
  throw "Cloudflare staging secret upload failed."
}

Write-Host "Building the OpenNext staging Worker..."
& npx.cmd opennextjs-cloudflare build --env staging
if ($LASTEXITCODE -ne 0) {
  throw "OpenNext staging build failed."
}

Write-Host "Deploying the OpenNext staging Worker..."
& npx.cmd opennextjs-cloudflare deploy --env staging
if ($LASTEXITCODE -ne 0) {
  throw "Cloudflare staging deployment failed."
}
