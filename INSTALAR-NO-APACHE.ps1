$ErrorActionPreference = 'Stop'
$sourceDir = $PSScriptRoot
$destinationDir = 'C:\Apache24\htdocs\laRemontada'
if (-not (Test-Path -LiteralPath 'C:\Apache24\htdocs')) { throw 'A pasta do Apache não foi encontrada.' }
if (Test-Path -LiteralPath (Join-Path $destinationDir 'index.php')) { throw 'Já existe um app nessa pasta. Faça um backup antes de atualizar.' }
New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
$items = @('.htaccess', 'index.php', 'api.php', 'config.example.php', 'app', 'assets', 'storage', 'tools', 'router.php', 'INICIAR-LOCAL.cmd', 'LEIA-ME.md', 'VERIFICACAO.md')
foreach ($name in $items) {
    Copy-Item -LiteralPath (Join-Path $sourceDir $name) -Destination $destinationDir -Recurse -Force
}
Write-Host 'Terça Várzea Clube instalado em C:\Apache24\htdocs\laRemontada'
Write-Host 'Abra http://localhost:8090/laRemontada/?view=admin'
