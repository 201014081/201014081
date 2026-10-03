# Crea el acceso directo "Plano Inclinado" en el Escritorio de Windows.
# La app se abre en su propia ventana (modo aplicacion de Edge o Chrome).
$ErrorActionPreference = 'Stop'
$dir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = Join-Path $dir 'index.html'
$ico  = Join-Path $dir 'icono.ico'
$url  = ([System.Uri]$html).AbsoluteUri

$candidatos = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$navegador = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

$escritorio = [Environment]::GetFolderPath('Desktop')
$destinos = @((Join-Path $escritorio 'Plano Inclinado.lnk'))
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Plano Inclinado.lnk'
$destinos += $menu

$shell = New-Object -ComObject WScript.Shell
foreach ($ruta in $destinos) {
  $lnk = $shell.CreateShortcut($ruta)
  if ($navegador) {
    $lnk.TargetPath = $navegador
    $lnk.Arguments  = "--app=`"$url`" --window-size=1400,900"
  } else {
    $lnk.TargetPath = $html
  }
  $lnk.WorkingDirectory = $dir
  $lnk.IconLocation     = "$ico,0"
  $lnk.Description      = 'Simulacion del Proyecto del Plano Inclinado'
  $lnk.Save()
}

Write-Host ''
Write-Host 'Listo. Se creo el acceso directo "Plano Inclinado" en tu Escritorio y en el menu Inicio.' -ForegroundColor Green
if ($navegador) { Write-Host "Se abrira con: $navegador" } else { Write-Host 'No se encontro Edge ni Chrome: se abrira con tu navegador predeterminado.' }
Write-Host 'IMPORTANTE: no muevas ni borres esta carpeta, el acceso directo la necesita.'
