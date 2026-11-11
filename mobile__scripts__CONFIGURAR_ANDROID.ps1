$ErrorActionPreference = 'Stop'
$MobileRoot = Split-Path -Parent $PSScriptRoot
Set-Location $MobileRoot

Write-Host '1/5 · Instalando dependencias de LOGISTEC Mobile...' -ForegroundColor Cyan
npm install

if (-not (Test-Path (Join-Path $MobileRoot 'android'))) {
  Write-Host '2/5 · Creando proyecto Android con Capacitor...' -ForegroundColor Cyan
  npx cap add android
} else {
  Write-Host '2/5 · El proyecto Android ya existe; se conservará.' -ForegroundColor Yellow
}

$AndroidRoot = Join-Path $MobileRoot 'android'
$SourceRoot = Join-Path $MobileRoot 'android-template/app/src/main/java/com/logistec/mobile'
$TargetRoot = Join-Path $AndroidRoot 'app/src/main/java/com/logistec/mobile'
New-Item -ItemType Directory -Force -Path (Join-Path $TargetRoot 'gps') | Out-Null
Copy-Item (Join-Path $SourceRoot 'MainActivity.java') $TargetRoot -Force
Copy-Item (Join-Path $SourceRoot 'gps/LogistecGpsPlugin.java') (Join-Path $TargetRoot 'gps') -Force
Copy-Item (Join-Path $SourceRoot 'gps/GpsForegroundService.java') (Join-Path $TargetRoot 'gps') -Force

$ManifestPath = Join-Path $AndroidRoot 'app/src/main/AndroidManifest.xml'
[xml]$Manifest = Get-Content $ManifestPath -Raw
$AndroidNs = 'http://schemas.android.com/apk/res/android'
$PermissionNames = @(
  'android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC', 'android.permission.POST_NOTIFICATIONS'
)
foreach ($PermissionName in $PermissionNames) {
  $Exists = $false
  foreach ($Node in $Manifest.manifest.'uses-permission') { if ($Node.GetAttribute('name', $AndroidNs) -eq $PermissionName) { $Exists = $true } }
  if (-not $Exists) {
    $Permission = $Manifest.CreateElement('uses-permission')
    $Permission.SetAttribute('name', $AndroidNs, $PermissionName)
    [void]$Manifest.manifest.AppendChild($Permission)
  }
}
$ServiceNode = $null
foreach ($Node in $Manifest.manifest.application.service) {
  if ($Node.GetAttribute('name', $AndroidNs) -eq 'com.logistec.mobile.gps.GpsForegroundService') { $ServiceNode = $Node }
}
if ($null -eq $ServiceNode) {
  $ServiceNode = $Manifest.CreateElement('service')
  [void]$Manifest.manifest.application.AppendChild($ServiceNode)
}
$ServiceNode.SetAttribute('name', $AndroidNs, 'com.logistec.mobile.gps.GpsForegroundService')
$ServiceNode.SetAttribute('exported', $AndroidNs, 'false')
$ServiceNode.SetAttribute('foregroundServiceType', $AndroidNs, 'location|dataSync')
$Manifest.Save($ManifestPath)

Write-Host '3/5 · Construyendo la interfaz web móvil...' -ForegroundColor Cyan
npm run build
Write-Host '4/5 · Sincronizando Capacitor con Android...' -ForegroundColor Cyan
npx cap sync android
Write-Host '5/5 · Android preparado.' -ForegroundColor Green
Write-Host 'Abre Android Studio con: npx cap open android' -ForegroundColor Green
Write-Host 'Antes de instalar, ejecuta la migración SQL y despliega la Edge Function según ANDROID_SETUP.md.' -ForegroundColor Yellow
