<?php
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
?>
<!doctype html>
<html lang="pt-BR">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#101c1b">
    <title>Terça Várzea Clube • Futebol de terça</title>
    <meta name="description" content="Os times, a turma e a história do nosso futebol de terça.">
    <link rel="icon" type="image/png" href="assets/tvc-icon.png">
    <link rel="stylesheet" href="assets/style.css?v=13">
    <link rel="stylesheet" href="assets/css/experience.css?v=2">
    <script type="module" src="assets/app.js?v=24"></script>
</head>

<body>
    <a class="skip-link" href="#app">Pular para o conteúdo</a>
    <header class="topbar"><a class="brand" href="./"><img class="brand-logo" src="assets/tvc-icon.png" alt="Terça Várzea Clube"></a>
        <div class="top-actions"><span class="season">SOCIETY · 6 NA LINHA</span><a id="modeLink"
                href="?view=admin">Área administrativa</a></div>
    </header>
    <div id="app" aria-live="polite" tabindex="-1">
        <div class="loading"><span class="loading-ball" aria-hidden="true">⚽</span><span>Preparando o campo…</span></div>
    </div>
    <div id="toast" role="status"></div>
    <dialog id="modal"><button class="close" aria-label="Fechar">×</button>
        <div id="modalBody"></div>
    </dialog>
    <footer>TERÇA VÁRZEA CLUBE <span>Terça tem jogo.</span></footer>
</body>

</html>
