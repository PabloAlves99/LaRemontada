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
                'matches' => matchList($date, !empty($user['limited']), $user),
                'goalLimit' => 2,
            ]);
        }
        postOnly();
        mutateMatch($action, $body, $user);
    }

    $statisticActions = ['statistics', 'statAdd', 'statCancel', 'scoringRounds'];
    if (!in_array($action, $statisticActions, true)) return;

    $user = statisticsUser();
    $limitedDate = !empty($user['limited']) ? scorekeeperRound() : null;
    if ($action === 'scoringRounds') {
        result([
            'rounds' => array_values(array_filter(
                allRounds(true),
                fn($round) => empty($user['limited']) || $round['date'] === $limitedDate,
            )),
        ]);
    }
    if ($action === 'statistics') {
        if (!empty($user['limited']) && !$limitedDate) {
            result(['players' => [], 'teams' => [], 'events' => [], 'dates' => []]);
        }
        $stats = statistics(!empty($user['limited']), $limitedDate ?? '');
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
