$ErrorActionPreference = "Stop"

$passwordPointer = [IntPtr]::Zero
$confirmationPointer = [IntPtr]::Zero
$plainPassword = $null
$plainConfirmation = $null
$commandExitCode = 1

try {
  $securePassword = Read-Host "New OWNER password (12-128 characters)" -AsSecureString
  $secureConfirmation = Read-Host "Confirm OWNER password" -AsSecureString

  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConfirmation)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $plainConfirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)

  if ($plainPassword -cne $plainConfirmation) {
    throw "Passwords do not match."
  }
  if ($plainPassword.Length -lt 12 -or $plainPassword.Length -gt 128) {
    throw "Password must contain 12-128 characters."
  }

  $env:BMP_OWNER_PASSWORD = $plainPassword
  & npx.cmd tsx scripts/set-owner-password.ts
  $commandExitCode = $LASTEXITCODE
}
finally {
  Remove-Item Env:BMP_OWNER_PASSWORD -ErrorAction SilentlyContinue
  $plainPassword = $null
  $plainConfirmation = $null
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  if ($confirmationPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer)
  }
}

if ($commandExitCode -ne 0) {
  exit $commandExitCode
}
