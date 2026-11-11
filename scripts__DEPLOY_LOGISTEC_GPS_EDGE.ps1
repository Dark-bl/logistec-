$ErrorActionPreference = 'Stop'
$ProjectRef = 'ugrfilgclbmejgdldood'
$FunctionName = 'logistec-gps-ingest'

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw 'No se encontró npx. Instala Node.js 20 o superior y vuelve a abrir PowerShell.'
}

Write-Host 'LOGISTEC · despliegue de Edge Function GPS' -ForegroundColor Cyan
Write-Host 'Este proceso no modifica tablas ni ejecuta migraciones SQL.' -ForegroundColor Yellow
Write-Host 'Se desplegará solamente la función logistec-gps-ingest.' -ForegroundColor Yellow

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  Write-Host '1/2 · Iniciar sesión en Supabase CLI...' -ForegroundColor Cyan
  & npx --yes supabase@latest login
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo autenticar Supabase CLI.' }

  Write-Host '2/2 · Desplegar Edge Function GPS...' -ForegroundColor Cyan
  & npx --yes supabase@latest functions deploy $FunctionName --project-ref $ProjectRef --yes
  if ($LASTEXITCODE -ne 0) { throw 'El despliegue de la Edge Function falló. Revisa el mensaje anterior.' }

  Write-Host "Despliegue enviado correctamente para $FunctionName." -ForegroundColor Green
  Write-Host 'Verifica en Supabase > Edge Functions y conserva verify_jwt = true.' -ForegroundColor Yellow
}
finally {
  Pop-Location
}
