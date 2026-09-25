<?php
// Somente para o servidor de desenvolvimento PHP. O Apache usa os .htaccess.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
if (preg_match('~^/(app|storage|tools)(/|$)|(^|/)\.|config\.(local|example)\.php$|\.(sqlite|db|log|json|sql|cmd|ps1|md)$~i', $path)) {
    http_response_code(403);
    exit('Acesso restrito.');
}
$file = realpath(__DIR__ . $path);
$base = realpath(__DIR__);
if ($file && str_starts_with($file, $base . DIRECTORY_SEPARATOR) && is_file($file)) return false;
if ($path === '/' || $path === '/index.php') {
    require __DIR__ . '/index.php';
    return;
}
http_response_code(404);
echo 'Página não encontrada.';
