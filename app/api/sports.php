<?php

declare(strict_types=1);

/**
 * Dispatches ranking, statistics and match endpoints.
 * Unrecognized actions return control to the main API dispatcher.
 */
function handleSportsRoutes(string $action, array $body): void
{
    if ($action === 'ranking') {
        database();
        result(statistics(true, (string) ($_GET['date'] ?? '')));
    }

    if ($action === 'publicMatches') {
        database();
        $date = textValue($_GET['date'] ?? '', 10);
        result(['matches' => matchList($date, true)]);
    }

    $matchActions = [
        'matches',
        'matchCreate',
        'matchGoal',
        'matchUndoGoal',
        'matchFinish',
        'matchCancel',
        'matchDelete',
    ];
    if (in_array($action, $matchActions, true)) {
        $user = statisticsUser();
        if ($action === 'matches') {
            $date = textValue($_GET['date'] ?? '', 10);
            matchAccess($date, $user);
            result([
                // Acesso por senha continua autenticado: dados operacionais,
                // como o responsável pelo jogo, podem ser exibidos. O próprio
                // domínio ainda oculta cancelados e campos internos.
                'matches' => matchList($date, false, $user),
                'goalLimit' => 2,
            ]);
        }
        postOnly();
        mutateMatch($action, $body, $user);
    }

    $statisticActions = ['statistics', 'statAdd', 'statCancel', 'scoringRounds'];
    if (!in_array($action, $statisticActions, true)) return;

    $user = statisticsUser();
    if ($action === 'scoringRounds') {
        result([
            // A ordenação decrescente de allRounds deixa a mais recente como padrão.
            'rounds' => allRounds(!empty($user['limited'])),
        ]);
    }
    if ($action === 'statistics') {
        $requestedDate = (string) ($_GET['date'] ?? '');
        if (!empty($user['limited']) && $requestedDate !== '' && !scorekeeperCanAccessRound($requestedDate))
            fail('Este acesso permite consultar somente rodadas publicadas.', 403);
        if (!empty($user['limited']) && !scorekeeperDefaultRound()) {
            result(['players' => [], 'teams' => [], 'events' => [], 'dates' => []]);
        }
        $stats = statistics(!empty($user['limited']), $requestedDate);
        if (!empty($user['limited'])) {
            $ownIds = array_column(
                rows('SELECT id FROM stat_events WHERE created_by=?', [$user['id']]),
                'id',
            );
            foreach ($stats['events'] as &$event) {
                $event['can_cancel'] = in_array($event['id'], $ownIds, true);
            }
            unset($event);
        }
        result($stats);
    }

    postOnly();
    if (!empty($user['limited'])) {
        fail('Use um confronto para registrar ou corrigir os lances.', 403);
    }
    if ($action === 'statAdd') recordStatistic($body, $user);
    cancelStatistic($body, $user);
}
