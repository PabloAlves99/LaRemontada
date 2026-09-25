<?php

declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/app/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    startSession();
    $action = $_GET['action'] ?? 'public';
    $method = $_SERVER['REQUEST_METHOD'];
    $b = [];
    if ($method === 'POST') {
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 150000) fail('Conteúdo muito grande.', 413);
        $b = json_decode(file_get_contents('php://input'), true);
        if (!is_array($b)) fail('Requisição inválida.');
        if (!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) fail('A sessão expirou. Atualize a página.', 403);
    }
    function postOnly(): void
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Método não permitido.', 405);
    }
    if ($action === 'public') result(['rounds' => allRounds(true)]);
    if ($action === 'session') {
        $user = null;
        if (isset($_SESSION['admin'])) $user = query('SELECT id,email,name,owner,active FROM admins WHERE id=? AND active=1', [$_SESSION['admin']])->fetch() ?: null;
        result(['user' => $user, 'csrf' => $_SESSION['csrf'], 'setup' => query('SELECT COUNT(*) FROM admins')->fetchColumn() == 0, 'local' => in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'])]);
    }
    if ($action === 'setup') {
        postOnly();
        if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'])) fail('A configuração inicial deve ser feita nesta máquina.', 403);
        $password = textValue($b['password'] ?? '', 128);
        if (strlen($password) < 10) fail('Use uma senha com pelo menos 10 caracteres.');
        database()->exec('BEGIN IMMEDIATE');
        if (query('SELECT COUNT(*) FROM admins')->fetchColumn() > 0) {
            database()->exec('ROLLBACK');
            fail('O app já foi configurado.', 409);
        }
        $id = identifier();
        query('INSERT INTO admins (id,email,name,password,owner) VALUES (?,?,?,?,1)', [$id, OWNER_EMAIL, 'Pablo', password_hash($password, PASSWORD_DEFAULT)]);
        database()->exec('COMMIT');
        session_regenerate_id(true);
        $_SESSION['admin'] = $id;
        result(['ok' => true]);
    }
    if ($action === 'login') {
        postOnly();
        $key = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'local'));
        $attempt = query('SELECT * FROM login_attempts WHERE id=?', [$key])->fetch();
        if ($attempt && time() - (int)$attempt['started'] < 900 && (int)$attempt['attempts'] >= 10) fail('Muitas tentativas. Aguarde 15 minutos.', 429);
        if (!$attempt || time() - (int)$attempt['started'] >= 900) query('INSERT INTO login_attempts (id,attempts,started) VALUES (?,0,?) ON CONFLICT(id) DO UPDATE SET attempts=0,started=excluded.started', [$key, time()]);
        $email = strtolower(trim((string)($b['email'] ?? '')));
        $u = query('SELECT * FROM admins WHERE email=? AND active=1', [$email])->fetch();
        if (!$u || !password_verify((string)($b['password'] ?? ''), $u['password'])) {
            query('UPDATE login_attempts SET attempts=attempts+1 WHERE id=?', [$key]);
            fail('E-mail ou senha incorretos.', 401);
        }
        query('DELETE FROM login_attempts WHERE id=?', [$key]);
        session_regenerate_id(true);
        $_SESSION['admin'] = $u['id'];
        result(['ok' => true]);
    }
    if ($action === 'logout') {
        postOnly();
        $_SESSION = [];
        session_destroy();
        result(['ok' => true]);
    }
    if ($action === 'evaluation') {
        $inv = invite((string)($_GET['token'] ?? ''));
        $ps = rows('SELECT id,name,position FROM players WHERE active=1 ORDER BY name');
        $mine = rows('SELECT player_id,scores,created FROM reviews WHERE evaluator=? AND active=1 ORDER BY id', ['invite:' . $inv['id']]);
        $latest = [];
        foreach ($mine as $r) $latest[$r['player_id']] = ['scores' => json_decode($r['scores'], true), 'created' => $r['created']];
        result(['label' => $inv['label'], 'players' => $ps, 'mine' => $latest]);
    }
    if ($action === 'review') {
        postOnly();
        $token = $b['token'] ?? '';
        if ($token) {
            $inv = invite($token);
            $evaluator = 'invite:' . $inv['id'];
            $label = $inv['label'];
        } else {
            $u = admin();
            $evaluator = 'admin:' . $u['id'];
            $label = $u['name'];
        }
        $pid = textValue($b['playerId'] ?? '', 40);
        if (!query('SELECT id FROM players WHERE id=? AND active=1', [$pid])->fetch()) fail('Jogador não encontrado.', 404);
        $notes = scores($b['scores'] ?? null);
        query('INSERT INTO reviews (player_id,evaluator,label,scores,created) VALUES (?,?,?,?,?)', [$pid, $evaluator, $label, encode($notes), gmdate('c')]);
        result(['ok' => true]);
    }
    $u = admin();
    if ($action === 'admin') result(['players' => allPlayers(), 'reviews' => rows('SELECT * FROM reviews ORDER BY id DESC'), 'rounds' => allRounds(), 'invites' => rows('SELECT id,label,active,created FROM invites ORDER BY created DESC'), 'admins' => rows('SELECT id,email,name,owner,active FROM admins ORDER BY owner DESC,name'), 'keepers' => setting('keepers', ['', '', '']), 'rules' => setting('rules', ['weak' => 2, 'separatePivot' => true, 'history' => 6])]);
    if ($action === 'backup') {
        $dir = configuration()['storage_path'];
        $file = $dir . '/backup-' . identifier() . '.sqlite';
        database()->exec("VACUUM INTO " . database()->quote($file));
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="LaRemontada-' . date('Y-m-d') . '.sqlite"');
        readfile($file);
        unlink($file);
        exit;
    }
    postOnly();

    if ($action === 'playerStatus') {
        query('UPDATE players SET active=? WHERE id=?', [!empty($b['active']) ? 1 : 0, textValue($b['id'] ?? '', 40)]);
        result(['ok' => true]);
    }
    if ($action === 'playerDelete') {
        $id = textValue($b['id'] ?? '', 40);
        database()->beginTransaction();
        query('DELETE FROM reviews WHERE player_id=?', [$id]);
        query('DELETE FROM players WHERE id=?', [$id]);
        database()->commit();
        result(['ok' => true]);
    }
    if (in_array($action, ['reviewEdit', 'reviewStatus', 'reviewDelete'], true)) {
        $id = filter_var($b['id'] ?? null, FILTER_VALIDATE_INT);
        if (!$id || !query('SELECT id FROM reviews WHERE id=?', [$id])->fetch()) fail('Avaliação não encontrada.', 404);
        if ($action === 'reviewEdit') query('UPDATE reviews SET scores=?,edited_by=?,edited_at=? WHERE id=?', [encode(scores($b['scores'] ?? null)), $u['name'], gmdate('c'), $id]);
        if ($action === 'reviewStatus') query('UPDATE reviews SET active=? WHERE id=?', [!empty($b['active']) ? 1 : 0, $id]);
        if ($action === 'reviewDelete') query('DELETE FROM reviews WHERE id=?', [$id]);
        result(['ok' => true]);
    }
    if ($action === 'inviteEdit') {
        $id = textValue($b['id'] ?? '', 64);
        $label = textValue($b['label'] ?? '');
        database()->beginTransaction();
        query('UPDATE invites SET label=?,active=? WHERE id=?', [$label, !empty($b['active']) ? 1 : 0, $id]);
        query('UPDATE reviews SET label=? WHERE evaluator=?', [$label, 'invite:' . $id]);
        database()->commit();
        result(['ok' => true]);
    }
    if ($action === 'inviteDelete') {
        query('DELETE FROM invites WHERE id=?', [textValue($b['id'] ?? '', 64)]);
        result(['ok' => true]);
    }
    if ($action === 'adminEdit') {
        if (!$u['owner']) fail('Somente o responsável pode gerenciar acessos.', 403);
        $id = textValue($b['id'] ?? '', 40);
        $target = query('SELECT * FROM admins WHERE id=?', [$id])->fetch();
        if (!$target) fail('Administrador não encontrado.', 404);
        $name = textValue($b['name'] ?? '');
        $email = strtolower(textValue($b['email'] ?? '', 190));
        $active = !empty($b['active']) ? 1 : 0;
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('E-mail inválido.');
        if ($target['owner'] && !$active) fail('O responsável deve manter o acesso ativo.');
        if (query('SELECT id FROM admins WHERE email=? AND id<>?', [$email, $id])->fetch()) fail('Este e-mail já está em uso.');
        $pass = $b['password'] ?? '';
        if ($pass !== '' && strlen(textValue($pass, 128)) < 10) fail('Use pelo menos 10 caracteres na senha.');
        database()->beginTransaction();
        query('UPDATE admins SET name=?,email=?,active=? WHERE id=?', [$name, $email, $active, $id]);
        if ($pass !== '') query('UPDATE admins SET password=? WHERE id=?', [password_hash($pass, PASSWORD_DEFAULT), $id]);
        database()->commit();
        result(['ok' => true]);
    }
    if (in_array($action, ['roundStatus', 'roundDelete'], true)) {
        $date = textValue($b['date'] ?? '', 10);
        $old = query('SELECT updated FROM rounds WHERE date=?', [$date])->fetch();
        if (!$old) fail('Rodada não encontrada.', 404);
        if (($b['version'] ?? null) !== $old['updated']) fail('A rodada mudou. Atualize a página antes de continuar.', 409);
        if ($action === 'roundDelete') query('DELETE FROM rounds WHERE date=? AND updated=?', [$date, $old['updated']]);
        else query('UPDATE rounds SET published=?,updated=? WHERE date=? AND updated=?', [!empty($b['published']) ? 1 : 0, gmdate('c') . '.' . bin2hex(random_bytes(4)), $date, $old['updated']]);
        result(['ok' => true]);
    }

    if ($action === 'player') {
        $name = textValue($b['name'] ?? '');
        $position = (string)($b['position'] ?? '');
        if (!in_array($position, ['', 'Fixo (zagueiro)', 'Ala', 'Meio', 'Pivô'])) fail('Posição inválida.');
        $provisional = scores($b['provisional'] ?? null, true);
        $id = $b['id'] ?? identifier();
        query('INSERT INTO players (id,name,position,frequent,provisional,active) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position,frequent=excluded.frequent,provisional=excluded.provisional,active=excluded.active', [$id, $name, $position, !empty($b['frequent']) ? 1 : 0, $provisional ? encode($provisional) : null, ($b['active'] ?? true) ? 1 : 0]);
        result(['ok' => true, 'id' => $id]);
    }
    if ($action === 'invite') {
        $label = textValue($b['label'] ?? '');
        $token = bin2hex(random_bytes(32));
        query('INSERT INTO invites (id,label,created) VALUES (?,?,?)', [hash('sha256', $token), $label, gmdate('c')]);
        result(['token' => $token]);
    }
    if ($action === 'revoke') {
        query('UPDATE invites SET active=0 WHERE id=?', [textValue($b['id'] ?? '', 64)]);
        result(['ok' => true]);
    }
    if ($action === 'settings') {
        $keepers = $b['keepers'] ?? [];
        if (!is_array($keepers) || count($keepers) !== 3) fail('Informe os três goleiros.');
        foreach ($keepers as $k) if (!is_string($k) || mb_strlen($k) > 100) fail('Nome de goleiro inválido.');
        $rules = $b['rules'] ?? [];
        if (!in_array($rules['weak'] ?? null, [1, 1.5, 2, 2.5, 3], true) || !in_array($rules['history'] ?? null, [3, 6, 10], true)) fail('Critérios inválidos.');
        putSetting('keepers', $keepers);
        $distribution = $rules['distribution'] ?? 'balanced';
        if (!in_array($distribution, ['balanced', 'mixed', 'random'], true)) fail('Distribuição inválida.');
        $savedRules = ['distribution' => $distribution, 'weak' => $rules['weak'], 'history' => $rules['history']];
        foreach (['useRating', 'useCriteria', 'usePosition', 'separateWeak', 'useHistory', 'avoidSameTeam'] as $flag) $savedRules[$flag] = (bool)($rules[$flag] ?? true);
        putSetting('rules', $savedRules);
        result(['ok' => true]);
    }
    if ($action === 'adminAdd') {
        if (!$u['owner']) fail('Somente o responsável pode gerenciar administradores.', 403);
        $email = strtolower(textValue($b['email'] ?? '', 190));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('E-mail inválido.');
        $name = textValue($b['name'] ?? '');
        $pass = textValue($b['password'] ?? '', 128);
        if (strlen($pass) < 10) fail('Use pelo menos 10 caracteres na senha.');
        database()->exec('BEGIN IMMEDIATE');
        if (query('SELECT COUNT(*) FROM admins')->fetchColumn() >= 3) {
            database()->exec('ROLLBACK');
            fail('O limite é de três administradores.');
        }
        if (query('SELECT id FROM admins WHERE email=?', [$email])->fetch()) {
            database()->exec('ROLLBACK');
            fail('Este e-mail já é administrador.');
        }
        query('INSERT INTO admins (id,email,name,password) VALUES (?,?,?,?)', [identifier(), $email, $name, password_hash($pass, PASSWORD_DEFAULT)]);
        database()->exec('COMMIT');
        result(['ok' => true]);
    }
    if ($action === 'adminRemove') {
        if (!$u['owner']) fail('Acesso restrito ao responsável.', 403);
        query('DELETE FROM admins WHERE id=? AND owner=0', [$b['id'] ?? '']);
        result(['ok' => true]);
    }
    if ($action === 'password') {
        $saved = query('SELECT password FROM admins WHERE id=?', [$u['id']])->fetchColumn();
        if (!password_verify((string)($b['current'] ?? ''), $saved)) fail('Senha atual incorreta.');
        $p = textValue($b['password'] ?? '', 128);
        if (strlen($p) < 10) fail('Use pelo menos 10 caracteres.');
        query('UPDATE admins SET password=? WHERE id=?', [password_hash($p, PASSWORD_DEFAULT), $u['id']]);
        session_regenerate_id(true);
        result(['ok' => true]);
    }
    if ($action === 'round') {
        $date = (string)($b['date'] ?? '');
        $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if (!$dt || $dt->format('Y-m-d') !== $date) fail('Data inválida.');
        $teams = $b['teams'] ?? [];
        if (count($teams) !== 3) fail('São necessários três times.');
        $previous = query('SELECT data FROM rounds WHERE date=?', [$date])->fetchColumn();
        $knownHistorical = [];
        if ($previous) foreach (json_decode($previous, true)['teams'] as $team) foreach ($team as $member) $knownHistorical[$member['id']] = true;
        $seen = [];
        $clean = [];
        foreach ($teams as $team) {
            if (!is_array($team) || count($team) !== 6) fail('Cada time precisa de seis jogadores.');
            $ct = [];
            foreach ($team as $p) {
                $id = textValue($p['id'] ?? '', 40);
                if (isset($seen[$id])) fail('Um jogador aparece mais de uma vez.');
                $seen[$id] = true;
                $guest = (bool)($p['guest'] ?? false);
                if (!$guest && !isset($knownHistorical[$id]) && !query('SELECT id FROM players WHERE id=?', [$id])->fetch()) fail('Jogador não cadastrado.');
                $ns = $p['scores'] ?? null;
                if ($ns !== null) {
                    if (!is_array($ns) || count($ns) !== 5) fail('Notas inválidas.');
                    foreach ($ns as $n) if (!is_numeric($n) || $n < 1 || $n > 5) fail('Notas inválidas.');
                }
                $ct[] = ['id' => $id, 'name' => textValue($p['name'] ?? ''), 'position' => (string)($p['position'] ?? ''), 'scores' => $guest ? null : $ns, 'count' => (int)($p['count'] ?? 0), 'guest' => $guest];
            }
            $clean[] = $ct;
        }
        $keepers = $b['keepers'] ?? ['', '', ''];
        if (!is_array($keepers) || count($keepers) !== 3) fail('Goleiros inválidos.');
        foreach ($keepers as $k) if (!is_string($k) || mb_strlen($k) > 100) fail('Goleiro inválido.');
        $old = query('SELECT updated,published FROM rounds WHERE date=?', [$date])->fetch();
        if ($old && ($b['version'] ?? null) !== $old['updated']) fail('Esta rodada mudou em outra sessão. Reabra a rodada antes de salvar.', 409);
        $updated = gmdate('Y-m-d\TH:i:s') . '.' . bin2hex(random_bytes(4));
        $published = ($b['publish'] ?? false) ? 1 : 0;
        query('INSERT INTO rounds (date,data,published,updated) VALUES (?,?,?,?) ON CONFLICT(date) DO UPDATE SET data=excluded.data,published=excluded.published,updated=excluded.updated', [$date, encode(['teams' => $clean, 'keepers' => $keepers]), $published, $updated]);
        result(['ok' => true, 'updated' => $updated, 'published' => (bool)$published]);
    }
    fail('Operação não encontrada.', 404);
} catch (Throwable $e) {
    error_log('La Remontada: ' . $e->getMessage());
    fail('Não foi possível concluir. Seus campos foram mantidos; tente novamente.', 500);
}
