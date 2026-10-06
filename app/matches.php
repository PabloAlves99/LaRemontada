<?php
declare(strict_types=1);

function initializeMatches(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, round_date TEXT NOT NULL, team_a TEXT NOT NULL, team_b TEXT NOT NULL, goal_limit INTEGER NOT NULL CHECK(goal_limit BETWEEN 1 AND 99), status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','finished','cancelled')), version INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL, created_by TEXT NOT NULL, author TEXT NOT NULL, finished TEXT, cancelled_reason TEXT, FOREIGN KEY(round_date) REFERENCES rounds(date), FOREIGN KEY(team_a) REFERENCES stat_teams(id), FOREIGN KEY(team_b) REFERENCES stat_teams(id), CHECK(team_a<>team_b))");
    $db->exec('CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(round_date,created)');
    // Confrontos diferentes podem ser registrados ao mesmo tempo. Cada um é
    // protegido pelo próprio id e version, sem um bloqueio global por rodada.
    $db->exec('DROP INDEX IF EXISTS idx_match_open_round');
    $db->exec("CREATE INDEX IF NOT EXISTS idx_matches_open_round ON matches(round_date,status) WHERE status='open'");
    $db->exec("CREATE TABLE IF NOT EXISTS match_goals (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, match_id TEXT NOT NULL, team_id TEXT NOT NULL, player_id TEXT NOT NULL, own_goal INTEGER NOT NULL DEFAULT 0, assistant_id TEXT, created TEXT NOT NULL, created_by TEXT NOT NULL, author TEXT NOT NULL, cancelled_at TEXT, cancelled_by TEXT, FOREIGN KEY(match_id) REFERENCES matches(id), FOREIGN KEY(team_id,player_id) REFERENCES stat_members(team_id,player_id), FOREIGN KEY(team_id,assistant_id) REFERENCES stat_members(team_id,player_id))");
    $db->exec('CREATE INDEX IF NOT EXISTS idx_match_goals_match ON match_goals(match_id,created)');
    $db->exec('CREATE TABLE IF NOT EXISTS match_stat_links (event_id INTEGER PRIMARY KEY, match_id TEXT NOT NULL, FOREIGN KEY(event_id) REFERENCES stat_events(id), FOREIGN KEY(match_id) REFERENCES matches(id))');
    $db->exec('CREATE INDEX IF NOT EXISTS idx_match_stat_links_match ON match_stat_links(match_id)');
    // O regulamento atual usa dois gols por time como teto. Confrontos já encerrados
    // preservam o limite histórico; jogos ainda abertos passam a seguir a regra.
    $db->exec("UPDATE matches SET goal_limit=2 WHERE status='open' AND goal_limit<>2");
}

function matchAccess(string $date, array $user): void
{
    if (!empty($user['limited'])) {
        if (!scorekeeper())
            fail('A senha foi alterada ou desativada. Entre novamente.', 401);
        if (!scorekeeperCanAccessRound($date))
            fail('Este acesso permite alterar somente rodadas publicadas.', 403);
    }
}

function matchTeam(string $date, int $index, array $formation): string
{
    $id = query('SELECT id FROM stat_teams WHERE round_date=? AND team_index=?', [$date, $index])->fetchColumn();
    if ($id)
        return $id;
    $id = identifier();
    query('INSERT INTO stat_teams(id,round_date,team_index) VALUES (?,?,?)', [$id, $date, $index]);
    foreach ($formation as $p)
        query('INSERT INTO stat_members(team_id,player_id,name,guest) VALUES (?,?,?,?)', [$id, $p['id'], $p['name'], !empty($p['guest']) ? 1 : 0]);
    return $id;
}

function matchScore(array $match): array
{
    $score = [$match['team_a'] => 0, $match['team_b'] => 0];
    foreach (rows('SELECT team_id,own_goal FROM match_goals WHERE match_id=? AND cancelled_at IS NULL', [$match['id']]) as $g) {
        $credited = $g['own_goal'] ? ($g['team_id'] === $match['team_a'] ? $match['team_b'] : $match['team_a']) : $g['team_id'];
        $score[$credited]++;
    }
    return $score;
}

function matchList(string $date, bool $public = false, ?array $user = null): array
{
    $hide = $public || !empty($user['limited']);
    $matches = rows(
        'SELECT m.* FROM matches m JOIN rounds r ON r.date=m.round_date WHERE m.round_date=?'
        . ($public ? ' AND r.published=1' : '')
        . ($hide ? " AND m.status<>'cancelled'" : '')
        . ' ORDER BY m.created,m.rowid',
        [$date]
    );
    foreach ($matches as &$m) {
        $m['version'] = (int) $m['version'];
        $m['goal_limit'] = (int) $m['goal_limit'];
        $m['score'] = matchScore($m);
        $m['teams'] = [];
        foreach ([$m['team_a'], $m['team_b']] as $tid) {
            $t = query('SELECT id,team_index FROM stat_teams WHERE id=?', [$tid])->fetch();
            $t['members'] = rows('SELECT player_id AS id,name,guest FROM stat_members WHERE team_id=? ORDER BY name', [$tid]);
            $m['teams'][] = $t;
        }
        $m['goals'] = rows(
            'SELECT g.id,g.match_id,g.team_id,g.player_id,g.own_goal,g.created,g.created_by,g.author,g.cancelled_at,g.cancelled_by,p.name AS player_name FROM match_goals g JOIN stat_members p ON p.team_id=g.team_id AND p.player_id=g.player_id WHERE g.match_id=?'
            . ($hide ? ' AND g.cancelled_at IS NULL' : '')
            . ' ORDER BY g.created,g.rowid',
            [$m['id']]
        );
        foreach ($m['goals'] as &$g) {
            $g['own_goal'] = (bool) $g['own_goal'];
            $g['can_edit'] = $user && $m['status'] === 'open' && !$g['cancelled_at'] && (empty($user['limited']) || $g['created_by'] === $user['id']);
            if ($public || !empty($user['limited']))
                unset($g['request_id'], $g['created_by'], $g['author'], $g['cancelled_by']);
        }
        unset($g);
        $m['can_cancel'] = $user && $m['status'] !== 'cancelled' && (empty($user['limited']) || ($m['status'] === 'open' && $m['created_by'] === $user['id']));
        $m['can_delete'] = $user && empty($user['limited']) && $m['status'] === 'cancelled';
        if ($public || !empty($user['limited']))
            unset($m['request_id'], $m['created_by'], $m['can_delete']);
        if ($public)
            unset($m['author']);
    }
    unset($m);
    return $matches;
}

function mutateMatch(string $action, array $b, array $user): never
{
    if ($action === 'matchDelete')
        deleteMatch($b, $user);
    database()->exec('BEGIN IMMEDIATE');
    if ($action === 'matchCreate') {
        $date = textValue($b['date'] ?? '', 10);
        matchAccess($date, $user);
        $a = $b['teamA'] ?? null;
        $c = $b['teamB'] ?? null;
        if (!is_int($a) || !is_int($c) || $a < 0 || $a > 2 || $c < 0 || $c > 2 || $a === $c)
            fail('Escolha dois times diferentes.');
        $request = textValue($b['requestId'] ?? '', 80);
        $old = query('SELECT m.*,a.team_index AS a_index,b.team_index AS b_index FROM matches m JOIN stat_teams a ON a.id=m.team_a JOIN stat_teams b ON b.id=m.team_b WHERE m.request_id=?', [$request])->fetch();
        if ($old) {
            if ($old['round_date'] !== $date || (int) $old['a_index'] !== $a || (int) $old['b_index'] !== $c || $old['created_by'] !== $user['id'])
                fail('Identificador de jogo já utilizado.', 409);
            database()->exec('COMMIT');
            result(['ok' => true, 'id' => $old['id']]);
        }
        $round = query('SELECT data FROM rounds WHERE date=?', [$date])->fetchColumn();
        if (!$round)
            fail('Salve os times desta rodada primeiro.', 404);
        $teams = json_decode($round, true)['teams'];
        $id = identifier();
        query('INSERT INTO matches(id,request_id,round_date,team_a,team_b,goal_limit,created,created_by,author) VALUES (?,?,?,?,?,?,?,?,?)', [$id, $request, $date, matchTeam($date, $a, $teams[$a]), matchTeam($date, $c, $teams[$c]), 2, gmdate('c'), $user['id'], $user['name']]);
        database()->exec('COMMIT');
        result(['ok' => true, 'id' => $id]);
    }
    $id = textValue($b['matchId'] ?? '', 40);
    $match = query('SELECT * FROM matches WHERE id=?', [$id])->fetch();
    if (!$match)
        fail('Jogo não encontrado.', 404);
    matchAccess($match['round_date'], $user);
    if ($action === 'matchFinish' && $match['status'] === 'finished') {
        database()->exec('COMMIT');
        result(['ok' => true]);
    }
    if ($action === 'matchGoal') {
        $request = textValue($b['requestId'] ?? '', 80);
        $old = query('SELECT * FROM match_goals WHERE request_id=?', [$request])->fetch();
        if ($old) {
            if ($old['match_id'] !== $id || $old['team_id'] !== ($b['teamId'] ?? null) || $old['player_id'] !== ($b['playerId'] ?? null) || (bool) $old['own_goal'] !== ($b['ownGoal'] ?? false) || $old['created_by'] !== $user['id'])
                fail('Identificador de gol já utilizado.', 409);
            database()->exec('COMMIT');
            result(['ok' => true]);
        }
    }
    if (($b['version'] ?? null) !== (int) $match['version'])
        fail('Este jogo mudou em outro acesso. Atualize antes de continuar.', 409);
    if ($action === 'matchCancel') {
        if ($match['status'] === 'cancelled')
            fail('Jogo já cancelado.', 409);
        if (!empty($user['limited']) && ($match['status'] !== 'open' || $match['created_by'] !== $user['id']))
            fail('Somente a organização pode cancelar este jogo.', 403);
        $reason = textValue($b['reason'] ?? '', 250);
        query("UPDATE matches SET status='cancelled',cancelled_reason=?,version=version+1 WHERE id=?", [$reason, $id]);
        query('UPDATE stat_events SET cancelled_at=?,cancelled_by=?,cancel_reason=? WHERE id IN (SELECT event_id FROM match_stat_links WHERE match_id=?) AND cancelled_at IS NULL', [gmdate('c'), $user['id'], $reason, $id]);
        database()->exec('COMMIT');
        result(['ok' => true]);
    }
    if ($match['status'] !== 'open')
        fail('Este jogo já foi encerrado ou cancelado.', 409);
    $score = matchScore($match);
    if ($action === 'matchGoal') {
        $tid = $b['teamId'] ?? '';
        $pid = $b['playerId'] ?? '';
        if (!is_string($tid) || !is_string($pid) || !in_array($tid, [$match['team_a'], $match['team_b']], true))
            fail('Time inválido.');
        if (!query('SELECT player_id FROM stat_members WHERE team_id=? AND player_id=?', [$tid, $pid])->fetch())
            fail('Escolha um jogador deste time.');
        $own = $b['ownGoal'] ?? false;
        if (!is_bool($own))
            fail('Tipo de gol inválido.');
        $credited = $own ? ($tid === $match['team_a'] ? $match['team_b'] : $match['team_a']) : $tid;
        if ($score[$credited] >= (int) $match['goal_limit'])
            fail('Este time atingiu o limite de gols. Confira os lances e encerre o jogo.', 409);
        query('INSERT INTO match_goals(id,request_id,match_id,team_id,player_id,own_goal,created,created_by,author) VALUES (?,?,?,?,?,?,?,?,?)', [identifier(), $request, $id, $tid, $pid, $own ? 1 : 0, gmdate('c'), $user['id'], $user['name']]);
    } elseif ($action === 'matchUndoGoal') {
        $gid = textValue($b['goalId'] ?? '', 40);
        $goal = query('SELECT * FROM match_goals WHERE id=? AND match_id=? AND cancelled_at IS NULL', [$gid, $id])->fetch();
        if (!$goal)
            fail('Gol não encontrado.', 404);
        if (!empty($user['limited']) && $goal['created_by'] !== $user['id'])
            fail('Você pode corrigir apenas seus próprios lances.', 403);
        query('UPDATE match_goals SET cancelled_at=?,cancelled_by=? WHERE id=?', [gmdate('c'), $user['id'], $gid]);
    } elseif ($action === 'matchFinish') {
        $a = $score[$match['team_a']];
        $c = $score[$match['team_b']];
        foreach (rows('SELECT g.*,p.guest FROM match_goals g JOIN stat_members p ON p.team_id=g.team_id AND p.player_id=g.player_id WHERE match_id=? AND cancelled_at IS NULL', [$id]) as $g) {
            if (!$g['own_goal'] && !$g['guest'])
                matchStatistic($id, $g['team_id'], $g['player_id'], 'goal', $g['created_by'], $g['author']);
        }
        matchStatistic($id, $match['team_a'], null, $a === $c ? 'draw' : ($a > $c ? 'win' : 'loss'), $user['id'], $user['name']);
        matchStatistic($id, $match['team_b'], null, $a === $c ? 'draw' : ($c > $a ? 'win' : 'loss'), $user['id'], $user['name']);
        query("UPDATE matches SET status='finished',finished=? WHERE id=?", [gmdate('c'), $id]);
    } else
        fail('Operação de jogo inválida.', 404);
    query('UPDATE matches SET version=version+1 WHERE id=?', [$id]);
    database()->exec('COMMIT');
    result(['ok' => true, 'id' => $id]);
}

function deleteMatch(array $b, array $user): never
{
    if (!empty($user['limited']))
        fail('Somente um administrador pode excluir confrontos.', 403);
    $id = textValue($b['matchId'] ?? '', 40);
    $match = query('SELECT id,round_date,status,version FROM matches WHERE id=?', [$id])->fetch();
    if (!$match)
        fail('Jogo não encontrado.', 404);
    if ($match['status'] !== 'cancelled')
        fail('Cancele o confronto antes de excluí-lo.', 409);
    if (($b['version'] ?? null) !== (int) $match['version'])
        fail('Este jogo mudou em outro acesso. Atualize antes de continuar.', 409);

    automaticBackup();
    database()->exec('BEGIN IMMEDIATE');
    try {
        $eventIds = array_column(rows('SELECT event_id FROM match_stat_links WHERE match_id=?', [$id]), 'event_id');
        query('DELETE FROM match_stat_links WHERE match_id=?', [$id]);
        foreach ($eventIds as $eventId)
            query('DELETE FROM stat_events WHERE id=?', [$eventId]);
        query('DELETE FROM match_goals WHERE match_id=?', [$id]);
        query('DELETE FROM matches WHERE id=?', [$id]);
        releaseUnusedStatisticTeams($match['round_date']);
        database()->exec('COMMIT');
    } catch (Throwable $e) {
        if (database()->inTransaction())
            database()->exec('ROLLBACK');
        throw $e;
    }
    result(['ok' => true]);
}

function matchStatistic(string $mid, string $team, ?string $player, string $kind, string $authorId, string $author): void
{
    query('INSERT INTO stat_events(request_id,team_id,player_id,kind,quantity,created,created_by,author) VALUES (?,?,?,?,1,?,?,?)', [identifier(), $team, $player, $kind, gmdate('c'), $authorId, $author]);
    query('INSERT INTO match_stat_links(event_id,match_id) VALUES (?,?)', [database()->lastInsertId(), $mid]);
}
