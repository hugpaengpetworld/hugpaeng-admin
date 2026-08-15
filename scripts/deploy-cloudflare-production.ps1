param(
  [switch]$ConfirmProductionDeploy
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmProductionDeploy) {
  throw "Production deployment requires -ConfirmProductionDeploy after Gate 6 configuration is complete."
}

$expectedAccountId = "dd0c01bdf56fa7bba2e915d0522a9666"
$expectedProjectRef = "dghipgebiioxphbbyvxp"
$expectedSupabaseHost = "$expectedProjectRef.supabase.co"
$expectedAppHost = "admin.hug-paeng.com"
$environmentPath = Join-Path $PSScriptRoot "..\.env.production.local"

if (-not (Test-Path -LiteralPath $environmentPath)) {
  throw ".env.production.local is required for production deployment."
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

$requiredSecrets = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_CHANNEL_SECRET",
  "CRON_SHARED_SECRET",
  "RATE_LIMIT_HASH_SECRET"
)

foreach ($secretName in $requiredSecrets) {
  if (-not $environment.ContainsKey($secretName) -or [string]::IsNullOrWhiteSpace($environment[$secretName])) {
    throw "$secretName is missing or empty in .env.production.local."
  }
}

try {
  $supabaseUri = [Uri]$environment["NEXT_PUBLIC_SUPABASE_URL"]
  $appUri = [Uri]$environment["NEXT_PUBLIC_APP_URL"]
}
catch {
  throw "Production URL configuration is invalid."
}

if ($supabaseUri.Scheme -ne "https" -or $supabaseUri.Host -ne $expectedSupabaseHost) {
  throw "Refusing to deploy: Supabase is not the approved production project."
}
if ($appUri.Scheme -ne "https" -or $appUri.Host -ne $expectedAppHost -or $appUri.AbsolutePath -ne "/") {
  throw "Refusing to deploy: NEXT_PUBLIC_APP_URL must be https://$expectedAppHost."
}

$env:CLOUDFLARE_ACCOUNT_ID = $expectedAccountId
$env:NEXT_PUBLIC_SUPABASE_URL = $environment["NEXT_PUBLIC_SUPABASE_URL"]
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $environment["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
$env:NEXT_PUBLIC_APP_URL = $environment["NEXT_PUBLIC_APP_URL"].TrimEnd('/')
$env:SUPABASE_SERVICE_ROLE_KEY = $environment["SUPABASE_SERVICE_ROLE_KEY"]
$env:LINE_CHANNEL_ACCESS_TOKEN = $environment["LINE_CHANNEL_ACCESS_TOKEN"]
$env:LINE_CHANNEL_SECRET = $environment["LINE_CHANNEL_SECRET"]
$env:CRON_SHARED_SECRET = $environment["CRON_SHARED_SECRET"]
$env:RATE_LIMIT_HASH_SECRET = $environment["RATE_LIMIT_HASH_SECRET"]
$env:APP_TIMEZONE = "Asia/Bangkok"
$env:APP_CURRENCY = "THB"
$env:DEFAULT_TENANT_SLUG = "baan-mhor-poy"

$productionSecrets = [ordered]@{
  NEXT_PUBLIC_SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY = $env:NEXT_PUBLIC_SUPABASE_ANON_KEY
  NEXT_PUBLIC_APP_URL = $env:NEXT_PUBLIC_APP_URL
  SUPABASE_SERVICE_ROLE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY
  LINE_CHANNEL_ACCESS_TOKEN = $env:LINE_CHANNEL_ACCESS_TOKEN
  LINE_CHANNEL_SECRET = $env:LINE_CHANNEL_SECRET
  CRON_SHARED_SECRET = $env:CRON_SHARED_SECRET
  RATE_LIMIT_HASH_SECRET = $env:RATE_LIMIT_HASH_SECRET
}

Write-Host "Target Worker: bmp-booking-production"
Write-Host "Target Supabase host: $expectedSupabaseHost"
Write-Host "Production application URL: $($env:NEXT_PUBLIC_APP_URL)"
Write-Host "Uploading encrypted production secrets..."
$productionSecrets | ConvertTo-Json -Compress | & npx.cmd wrangler secret bulk --env production
if ($LASTEXITCODE -ne 0) { throw "Cloudflare production secret upload failed." }

Write-Host "Building the OpenNext production Worker..."
& npx.cmd opennextjs-cloudflare build --env production
if ($LASTEXITCODE -ne 0) { throw "OpenNext production build failed." }

Write-Host "Deploying the OpenNext production Worker..."
& npx.cmd opennextjs-cloudflare deploy --env production
if ($LASTEXITCODE -ne 0) { throw "Cloudflare production deployment failed." }
