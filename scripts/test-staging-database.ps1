$ErrorActionPreference = "Stop"

$databasePasswordPointer = [IntPtr]::Zero
$plainDatabasePassword = $null
$encodedDatabasePassword = $null
$plainDatabaseUrl = $null
$commandExitCode = 1

try {
  $poolerUrlPath = Join-Path $PSScriptRoot "../supabase/.temp/pooler-url"
  if (-not (Test-Path -LiteralPath $poolerUrlPath)) {
    throw "The linked Supabase Session pooler URL was not found. Run 'npx.cmd supabase link --project-ref <project-ref>' first."
  }

  $poolerUrl = (Get-Content -LiteralPath $poolerUrlPath -Raw).Trim()
  $parsedPoolerUrl = $null
  if (-not [Uri]::TryCreate($poolerUrl, [UriKind]::Absolute, [ref]$parsedPoolerUrl)) {
    throw "The linked Supabase Session pooler URL is invalid. Run Supabase link again."
  }
  if ($parsedPoolerUrl.Scheme -notin @("postgres", "postgresql")) {
    throw "The linked URI must use the postgres or postgresql scheme."
  }
  if (-not $parsedPoolerUrl.Host.EndsWith(".supabase.com", [StringComparison]::OrdinalIgnoreCase)) {
    throw "The linked URI must point to a Supabase database host."
  }
  if (-not $poolerUrl.Contains("@")) {
    throw "The linked Supabase Session pooler URL does not contain database user information."
  }

  $secureDatabasePassword = Read-Host "Supabase staging database password" -AsSecureString
  $databasePasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureDatabasePassword)
  $plainDatabasePassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($databasePasswordPointer)
  if ([String]::IsNullOrWhiteSpace($plainDatabasePassword)) {
    throw "The database password cannot be empty."
  }

  $encodedDatabasePassword = [Uri]::EscapeDataString($plainDatabasePassword)
  $plainDatabaseUrl = $poolerUrl.Replace("@", ":$encodedDatabasePassword@")

  $parsedDatabaseUrl = $null
  if (-not [Uri]::TryCreate($plainDatabaseUrl, [UriKind]::Absolute, [ref]$parsedDatabaseUrl)) {
    throw "The Session pooler URI could not be constructed from the linked project."
  }

  $env:TEST_DATABASE_URL = $plainDatabaseUrl
  & npm.cmd run test:integration
  $commandExitCode = $LASTEXITCODE
}
finally {
  Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
  $plainDatabasePassword = $null
  $encodedDatabasePassword = $null
  $plainDatabaseUrl = $null
  if ($databasePasswordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($databasePasswordPointer)
  }
}

if ($commandExitCode -ne 0) {
  exit $commandExitCode
}
