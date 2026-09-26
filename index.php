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
    <title>La Remontada • Futebol de terça</title>
    <meta name="description" content="Os times, a turma e a história do nosso futebol de terça.">
    <link rel="icon" href="assets/favicon.svg">
    <link rel="stylesheet" href="assets/style.css?v=4">
    <script type="module" src="assets/app.js?v=4"></script>
</head>

<body>
    <header class="topbar"><a class="brand" href="./"><span class="crest">LR<span>✦</span></span><span>LA REMONTADA<small>FUTEBOL DE TERÇA</small></span></a>
        <div class="top-actions"><span class="season">SOCIETY · 6 NA LINHA</span><a id="modeLink" href="?view=admin">Administração ↗</a></div>
    </header>
    <div id="app" aria-live="polite">
        <div class="loading">Preparando o campo…</div>
    </div>
    <div id="toast" role="status"></div>
    <dialog id="modal"><button class="close" aria-label="Fechar">×</button>
        <div id="modalBody"></div>
    </dialog>
    <footer>LA REMONTADA <span>Terça tem jogo.</span></footer>
</body>

</html>
