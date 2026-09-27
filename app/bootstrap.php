<?php

declare(strict_types=1);
const OWNER_EMAIL = 'pablohalves99@gmail.com';
function configuration(): array
{
    static $config;
    return $config ??= array_merge(['storage_path' => dirname(__DIR__) . '/storage'], is_file(dirname(__DIR__) . '/config.local.php') ? require dirname(__DIR__) . '/config.local.php' : []);
}
function database(): PDO
{
    static $db;
    if ($db) return $db;
    $c = configuration();
    if (!is_dir($c['storage_path'])) mkdir($c['storage_path'], 0700, true);
    $db = new PDO('sqlite:' . $c['storage_path'] . '/LaRemontada.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $db->exec('PRAGMA busy_timeout=5000');
    $db->exec('PRAGMA foreign_keys=ON');
    initialize($db);
    return $db;
}
function initialize(PDO $db): void
{
    foreach (
        [
            'CREATE TABLE IF NOT EXISTS admins (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, owner INTEGER NOT NULL DEFAULT 0)',
            "CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL, position TEXT NOT NULL DEFAULT '', frequent INTEGER NOT NULL DEFAULT 1, provisional TEXT NULL, active INTEGER NOT NULL DEFAULT 1)",
            'CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, label TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, evaluator TEXT NOT NULL, label TEXT NOT NULL, scores TEXT NOT NULL, created TEXT NOT NULL)',
            'CREATE INDEX IF NOT EXISTS idx_reviews_player ON reviews(player_id,evaluator,id)',
            'CREATE TABLE IF NOT EXISTS rounds (date TEXT PRIMARY KEY, data TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0, updated TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS attendance (round_date TEXT NOT NULL, player_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'confirmed\', updated TEXT NOT NULL, PRIMARY KEY (round_date,player_id), FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE)',
            'CREATE INDEX IF NOT EXISTS idx_attendance_player ON attendance(player_id,round_date)',
            'CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS login_attempts (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, started INTEGER NOT NULL)'
        ] as $sql
    ) $db->exec($sql);
    migrateManagement($db);
}
function query(string $sql, array $params = []): PDOStatement
{
    $s = database()->prepare($sql);
    $s->execute($params);
    return $s;
}
function rows(string $sql, array $params = []): array
{
    return query($sql, $params)->fetchAll();
}
function encode($value): string
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}
function setting(string $id, $default = null)
{
    $r = query('SELECT value FROM settings WHERE id=?', [$id])->fetch();
    return $r ? json_decode($r['value'], true) : $default;
}
function putSetting(string $id, $value): void
{
    query('INSERT INTO settings (id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value', [$id, encode($value)]);
}
function identifier(): string
{
    return bin2hex(random_bytes(16));
}
function fail(string $message, int $status = 400): never
{
    http_response_code($status);
    echo encode(['error' => $message]);
    exit;
}
function result($value): never
{
    echo encode($value);
    exit;
}
function textValue($value, int $max = 100): string
{
    if (!is_string($value) || mb_strlen(trim($value)) < 1 || mb_strlen($value) > $max) fail('Preencha os campos corretamente.');
    return trim($value);
}
function scores($value, bool $nullable = false): ?array
{
    if ($nullable && $value === null) return null;
    if (!is_array($value) || count($value) !== 5) fail('Informe as cinco notas.');
    foreach ($value as $n) if (!is_int($n) || $n < 1 || $n > 5) fail('Use notas inteiras de 1 a 5.');
    return array_values($value);
}
function allPlayers(): array
{
    $players = rows('SELECT * FROM players ORDER BY name');
    $reviews = rows('SELECT * FROM reviews WHERE active=1 ORDER BY id ASC');
    $latest = [];
    foreach ($reviews as $r) $latest[$r['player_id']][$r['evaluator']] = $r;
    foreach ($players as &$p) {
        $p['provisional'] = $p['provisional'] ? json_decode($p['provisional'], true) : null;
        $rs = array_values($latest[$p['id']] ?? []);
        $p['count'] = count($rs);
        $p['scores'] = $rs ? array_fill(0, 5, 0) : $p['provisional'];
        foreach ($rs as $r) foreach (json_decode($r['scores'], true) as $i => $v) $p['scores'][$i] += $v / count($rs);
        $p['frequent'] = (bool)$p['frequent'];
        $p['active'] = (bool)$p['active'];
    }
    unset($p);
    return $players;
}
function allRounds(bool $public = false): array
{
    $rs = rows('SELECT * FROM rounds' . ($public ? ' WHERE published=1' : '') . ' ORDER BY date DESC');
    return array_map(function ($r) use ($public) {
        $data = json_decode($r['data'], true);
        $data['date'] = $r['date'];
        $data['published'] = (bool)$r['published'];
        $data['updated'] = $r['updated'];
        if ($public) $data['teams'] = array_map(fn($t) => array_map(fn($p) => ['id' => $p['id'], 'name' => $p['name'], 'position' => $p['position'] ?? '', 'guest' => $p['guest'] ?? false], $t), $data['teams']);
        return $data;
    }, $rs);
}
function attendanceFor(string $date): array
{
    return rows('SELECT player_id,status FROM attendance WHERE round_date=? ORDER BY player_id', [$date]);
}
function attendanceStats(): array
{
    return rows("SELECT p.id, COUNT(a.player_id) AS confirmed FROM players p LEFT JOIN attendance a ON a.player_id=p.id AND a.status='confirmed' GROUP BY p.id");
}
function automaticBackup(): void
{
    $dir = configuration()['storage_path'] . '/automatic-backups';
    if (!is_dir($dir)) mkdir($dir, 0700, true);
    $file = $dir . '/before-change-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.sqlite';
    database()->exec('VACUUM INTO ' . database()->quote($file));
    $files = glob($dir . '/*.sqlite') ?: [];
    usort($files, fn($a, $b) => filemtime($b) <=> filemtime($a));
    foreach (array_slice($files, 12) as $old) unlink($old);
}
function admin(): array
{
    $id = $_SESSION['admin'] ?? '';
    $user = $id ? query('SELECT id,email,name,owner,active FROM admins WHERE id=? AND active=1', [$id])->fetch() : false;
    if (!$user) fail('Entre como administrador para continuar.', 401);
    return $user;
}
function master(array $user): bool
{
    return !empty($user['owner']) && strtolower((string)$user['email']) === OWNER_EMAIL;
}
function invite(string $token): array
{
    if (strlen($token) !== 64) fail('Link de avaliação inválido.', 404);
    $r = query('SELECT * FROM invites WHERE id=? AND active=1', [hash('sha256', $token)])->fetch();
    if (!$r) fail('Este link foi desativado ou não existe.', 404);
    return $r;
}
function startSession(): void
{
    $sessionPath = configuration()['storage_path'] . '/sessions';
    if (!is_dir($sessionPath)) mkdir($sessionPath, 0700, true);
    session_save_path($sessionPath);
    ini_set('session.use_strict_mode', '1');
    session_name('remontada');
    session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite' => 'Lax', 'path' => rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/') . '/']);
    session_start();
    if (!isset($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
}

function migrateManagement(PDO $db): void
{
    $changes = ['admins' => ['active' => 'INTEGER NOT NULL DEFAULT 1'], 'reviews' => ['active' => 'INTEGER NOT NULL DEFAULT 1', 'edited_by' => "TEXT NOT NULL DEFAULT ''", 'edited_at' => "TEXT NOT NULL DEFAULT ''"]];
    foreach ($changes as $table => $columns) {
        $present = array_column($db->query("PRAGMA table_info($table)")->fetchAll(), 'name');
        if (!array_diff(array_keys($columns), $present)) continue;
        $db->exec('BEGIN IMMEDIATE');
        try {
            $present = array_column($db->query("PRAGMA table_info($table)")->fetchAll(), 'name');
            foreach ($columns as $name => $type) if (!in_array($name, $present, true)) $db->exec("ALTER TABLE $table ADD COLUMN $name $type");
            $db->exec('COMMIT');
        } catch (Throwable $e) {
            $db->exec('ROLLBACK');
            throw $e;
        }
    }
}
