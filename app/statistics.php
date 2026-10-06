<?php
declare(strict_types=1);

function initializeStatistics(PDO $db): void
{
    $db->exec('CREATE TABLE IF NOT EXISTS stat_teams (id TEXT PRIMARY KEY, round_date TEXT NOT NULL, team_index INTEGER NOT NULL CHECK(team_index BETWEEN 0 AND 2), UNIQUE(round_date,team_index), FOREIGN KEY(round_date) REFERENCES rounds(date) ON DELETE RESTRICT)');
    $db->exec('CREATE TABLE IF NOT EXISTS stat_members (team_id TEXT NOT NULL, player_id TEXT NOT NULL, name TEXT NOT NULL, guest INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(team_id,player_id), FOREIGN KEY(team_id) REFERENCES stat_teams(id))');
    $db->exec("CREATE TABLE IF NOT EXISTS stat_events (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE, team_id TEXT NOT NULL, player_id TEXT, kind TEXT NOT NULL CHECK(kind IN ('goal','assist','win','draw','loss')), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 999), created TEXT NOT NULL, created_by TEXT NOT NULL, author TEXT NOT NULL, cancelled_at TEXT, cancelled_by TEXT, cancel_reason TEXT, FOREIGN KEY(team_id) REFERENCES stat_teams(id), FOREIGN KEY(team_id,player_id) REFERENCES stat_members(team_id,player_id), CHECK((kind IN ('goal','assist') AND player_id IS NOT NULL) OR (kind IN ('win','draw','loss') AND player_id IS NULL)))");
    $db->exec('CREATE INDEX IF NOT EXISTS idx_stat_events_team ON stat_events(team_id,id)');
}

// Read model for rankings and, later, team balancing. Stable player IDs link
// performances across rounds; membership snapshots preserve the original team.
function statistics(bool $public = false, string $date = ''): array
{
    if ($date !== '') {
        $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if (!$dt || $dt->format('Y-m-d') !== $date)
            fail('Data inválida.');
    }
    $where = ' WHERE 1=1' . ($public ? ' AND r.published=1' : '') . ($date !== '' ? ' AND r.date=?' : '');
    $params = $date !== '' ? [$date] : [];
    $teams = rows('SELECT t.id,t.round_date,t.team_index,r.published FROM stat_teams t JOIN rounds r ON r.date=t.round_date' . $where . ' ORDER BY t.round_date DESC,t.team_index', $params);
    $events = rows("SELECT e.*,t.round_date,t.team_index FROM stat_events e JOIN stat_teams t ON t.id=e.team_id JOIN rounds r ON r.date=t.round_date" . $where . " AND e.kind<>'assist' ORDER BY e.id DESC", $params);
    $members = rows('SELECT m.* FROM stat_members m JOIN stat_teams t ON t.id=m.team_id JOIN rounds r ON r.date=t.round_date' . $where, $params);
    $players = [];
    foreach (rows('SELECT id,name FROM players ORDER BY name') as $p) {
        $players[$p['id']] = $p + ['goal' => 0, 'win' => 0, 'draw' => 0, 'loss' => 0, 'confirmed' => 0];
    }
    $byTeam = [];
    foreach ($teams as $t) {
        $t['members'] = [];
        $t['win'] = $t['draw'] = $t['loss'] = 0;
        $byTeam[$t['id']] = $t;
    }
    foreach ($members as $m) {
        $byTeam[$m['team_id']]['members'][] = ['id' => $m['player_id'], 'name' => $m['name'], 'guest' => (bool) $m['guest']];
        if ($m['guest'])
            continue;
        $players[$m['player_id']] ??= ['id' => $m['player_id'], 'name' => $m['name'], 'goal' => 0, 'win' => 0, 'draw' => 0, 'loss' => 0, 'confirmed' => 0];
    }
    $names = array_column(rows('SELECT id,name FROM players'), 'name', 'id');
    foreach ($players as $id => &$p)
        $p['name'] = $names[$id] ?? $p['name'];
    unset($p);
    foreach ($events as &$e) {
        $e['quantity'] = (int) $e['quantity'];
        $e['player_name'] = null;
        foreach ($byTeam[$e['team_id']]['members'] as $m)
            if ($m['id'] === $e['player_id'])
                $e['player_name'] = $m['name'];
        if (!$e['cancelled_at']) {
            if ($e['player_id'] !== null) {
                if (isset($players[$e['player_id']]))
                    $players[$e['player_id']][$e['kind']] += $e['quantity'];
            } else {
                $byTeam[$e['team_id']][$e['kind']] += $e['quantity'];
                foreach ($byTeam[$e['team_id']]['members'] as $m)
                    if (!$m['guest'])
                        $players[$m['id']][$e['kind']] += $e['quantity'];
            }
        }
        if ($public)
            unset($e['created_by'], $e['author'], $e['cancelled_by'], $e['request_id'], $e['cancel_reason']);
    }
    unset($e);
    if ($public)
        $events = array_values(array_filter($events, fn($e) => !$e['cancelled_at']));
    foreach (rows("SELECT player_id,COUNT(DISTINCT round_date) AS confirmed FROM attendance WHERE status='confirmed'" . ($date !== '' ? ' AND round_date=?' : '') . ' GROUP BY player_id', $params) as $a) {
        if (isset($players[$a['player_id']]))
            $players[$a['player_id']]['confirmed'] = (int) $a['confirmed'];
    }
    $dates = array_column(rows("SELECT date FROM rounds" . ($public ? ' WHERE published=1' : '') . " UNION SELECT round_date AS date FROM attendance WHERE status='confirmed' ORDER BY date DESC"), 'date');
    return ['players' => array_values($players), 'teams' => array_values($byTeam), 'events' => $events, 'dates' => $dates];
}

function recordStatistic(array $b, array $user): never
{
    $date = textValue($b['date'] ?? '', 10);
    $team = $b['team'] ?? null;
    $kind = $b['kind'] ?? '';
    $quantity = $b['quantity'] ?? null;
    $request = textValue($b['requestId'] ?? '', 80);
    if (!is_int($team) || $team < 0 || $team > 2 || !in_array($kind, ['goal', 'win', 'draw', 'loss'], true))
        fail('Time ou tipo de lançamento inválido.');
    if (!is_int($quantity) || $quantity < 1 || $quantity > 999)
        fail('Informe uma quantidade inteira de 1 a 999.');
    $pid = $kind === 'goal' ? textValue($b['playerId'] ?? '', 40) : null;
    database()->exec('BEGIN IMMEDIATE');
    if (!empty($user['limited'])) {
        if (!scorekeeper())
            fail('A senha de lançamento mudou. Entre novamente.', 401);
        if (!scorekeeperCanAccessRound($date))
            fail('Esta senha permite alterar apenas rodadas publicadas.', 403);
    }
    $existing = query('SELECT e.*,t.round_date,t.team_index FROM stat_events e JOIN stat_teams t ON t.id=e.team_id WHERE request_id=?', [$request])->fetch();
    if ($existing) {
        if ($existing['round_date'] !== $date || (int) $existing['team_index'] !== $team || $existing['kind'] !== $kind || (int) $existing['quantity'] !== $quantity || $existing['player_id'] !== $pid || $existing['created_by'] !== $user['id'])
            fail('Identificador de lançamento já utilizado.', 409);
        database()->exec('COMMIT');
        result(['ok' => true, 'id' => $existing['id']]);
    }
    $r = query('SELECT data FROM rounds WHERE date=?', [$date])->fetchColumn();
    if (!$r)
        fail('Salve a rodada antes de lançar estatísticas.', 404);
    $formation = json_decode($r, true)['teams'][$team];
    if ($pid !== null && !array_filter($formation, fn($p) => $p['id'] === $pid && empty($p['guest'])))
        fail('Escolha um jogador cadastrado deste time.');
    $tid = query('SELECT id FROM stat_teams WHERE round_date=? AND team_index=?', [$date, $team])->fetchColumn();
    if (!$tid) {
        $tid = identifier();
        query('INSERT INTO stat_teams(id,round_date,team_index) VALUES (?,?,?)', [$tid, $date, $team]);
        foreach ($formation as $p)
            query('INSERT INTO stat_members(team_id,player_id,name,guest) VALUES (?,?,?,?)', [$tid, $p['id'], $p['name'], !empty($p['guest']) ? 1 : 0]);
    }
    query('INSERT INTO stat_events(request_id,team_id,player_id,kind,quantity,created,created_by,author) VALUES (?,?,?,?,?,?,?,?)', [$request, $tid, $pid, $kind, $quantity, gmdate('c'), $user['id'], $user['name']]);
    $id = database()->lastInsertId();
    database()->exec('COMMIT');
    result(['ok' => true, 'id' => $id]);
}

function cancelStatistic(array $b, array $user): never
{
    $id = filter_var($b['id'] ?? null, FILTER_VALIDATE_INT);
    $reason = textValue($b['reason'] ?? '', 250);
    if (!$id)
        fail('Lançamento inválido.');
    database()->exec('BEGIN IMMEDIATE');
    $event = query('SELECT e.created_by,r.published,r.date FROM stat_events e JOIN stat_teams t ON t.id=e.team_id JOIN rounds r ON r.date=t.round_date WHERE e.id=?', [$id])->fetch();
    if (!$event)
        fail('Lançamento não encontrado.', 404);
    if (query('SELECT event_id FROM match_stat_links WHERE event_id=?', [$id])->fetch())
        fail('Este lançamento pertence a um confronto. Cancele o jogo completo para corrigir o resultado.', 409);
    if (!empty($user['limited'])) {
        if (!scorekeeper())
            fail('A senha de lançamento mudou. Entre novamente.', 401);
        if ($event['created_by'] !== $user['id'] || !scorekeeperCanAccessRound($event['date']))
            fail('Você pode cancelar somente seus próprios lançamentos de rodadas publicadas.', 403);
    }
    query('UPDATE stat_events SET cancelled_at=?,cancelled_by=?,cancel_reason=? WHERE id=? AND cancelled_at IS NULL', [gmdate('c'), $user['id'], $reason, $id]);
    database()->exec('COMMIT');
    result(['ok' => true]);
}

// A formação é mantida enquanto existir algum lançamento ou confronto que a
// consulte. Quando o administrador exclui definitivamente o último confronto,
// o snapshot deixa de ser histórico e não deve impedir a edição da rodada.
function releaseUnusedStatisticTeams(string $date): void
{
    $teamIds = array_column(rows(
        'SELECT t.id FROM stat_teams t
         WHERE t.round_date=?
           AND NOT EXISTS (SELECT 1 FROM stat_events e WHERE e.team_id=t.id)
           AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.team_a=t.id OR m.team_b=t.id)',
        [$date]
    ), 'id');
    foreach ($teamIds as $teamId) {
        query('DELETE FROM stat_members WHERE team_id=?', [$teamId]);
        query('DELETE FROM stat_teams WHERE id=?', [$teamId]);
    }
}
