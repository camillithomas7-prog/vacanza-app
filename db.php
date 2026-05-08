<?php

function load_config() {
  $local = __DIR__ . '/config.local.php';
  $prod  = __DIR__ . '/config.php';
  if (file_exists($local)) return require $local;
  if (file_exists($prod))  return require $prod;
  return ['driver' => 'sqlite', 'path' => __DIR__ . '/data.db'];
}

function db() {
  static $pdo = null;
  if ($pdo) return $pdo;
  $cfg = load_config();
  $isNew = false;

  if (($cfg['driver'] ?? 'sqlite') === 'mysql') {
    $dsn = "mysql:host={$cfg['host']};port=" . ($cfg['port'] ?? 3306) . ";dbname={$cfg['dbname']};charset=" . ($cfg['charset'] ?? 'utf8mb4');
    $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $isNew = (int)($pdo->query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'trip'")->fetch()['n']) === 0;
    create_schema_mysql($pdo);
  } else {
    $path = $cfg['path'] ?? (__DIR__ . '/data.db');
    $isNew = !file_exists($path);
    $pdo = new PDO('sqlite:' . $path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    create_schema_sqlite($pdo);
  }

  migrate($pdo);
  if ($isNew) seed($pdo);
  return $pdo;
}

function driver_name($pdo) { return $pdo->getAttribute(PDO::ATTR_DRIVER_NAME); }

function has_column($pdo, $table, $col) {
  if (driver_name($pdo) === 'mysql') {
    $stmt = $pdo->prepare("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?");
    $stmt->execute([$table, $col]);
    return (int)$stmt->fetch()['n'] > 0;
  }
  $rows = $pdo->query("PRAGMA table_info(" . $table . ")")->fetchAll();
  foreach ($rows as $r) if ($r['name'] === $col) return true;
  return false;
}

function migrate($pdo) {
  if (!has_column($pdo, 'settlement', 'category')) {
    $pdo->exec("ALTER TABLE settlement ADD COLUMN category " . (driver_name($pdo) === 'mysql' ? 'VARCHAR(50)' : 'TEXT'));
  }
}

function create_schema_sqlite($pdo) {
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS trip (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      destination TEXT,
      date_start TEXT,
      date_end TEXT,
      currency TEXT DEFAULT 'EUR',
      payer_member_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS member (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      avatar TEXT,
      budget REAL DEFAULT 0,
      budget_paid INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trip(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS expense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      total REAL NOT NULL,
      paid_by_member_id INTEGER NOT NULL,
      split_mode TEXT NOT NULL DEFAULT 'equal',
      notes TEXT,
      occurred_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_by_member_id INTEGER,
      FOREIGN KEY (trip_id) REFERENCES trip(id) ON DELETE CASCADE,
      FOREIGN KEY (paid_by_member_id) REFERENCES member(id)
    );
    CREATE TABLE IF NOT EXISTS expense_share (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      label TEXT,
      FOREIGN KEY (expense_id) REFERENCES expense(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES member(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS settlement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      from_member_id INTEGER NOT NULL,
      to_member_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      category TEXT,
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trip(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_expense_trip ON expense(trip_id);
    CREATE INDEX IF NOT EXISTS idx_share_expense ON expense_share(expense_id);
    CREATE INDEX IF NOT EXISTS idx_share_member ON expense_share(member_id);
    CREATE INDEX IF NOT EXISTS idx_member_trip ON member(trip_id);
  ");
}

function create_schema_mysql($pdo) {
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS trip (
      id INT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      destination VARCHAR(255),
      date_start DATE,
      date_end DATE,
      currency VARCHAR(10) DEFAULT 'EUR',
      payer_member_id INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  ");
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS member (
      id INT PRIMARY KEY AUTO_INCREMENT,
      trip_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      pin VARCHAR(20) NOT NULL DEFAULT '',
      avatar VARCHAR(255),
      budget DECIMAL(10,2) DEFAULT 0,
      budget_paid TINYINT(1) DEFAULT 0,
      is_admin TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_member_trip (trip_id),
      FOREIGN KEY (trip_id) REFERENCES trip(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  ");
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS expense (
      id INT PRIMARY KEY AUTO_INCREMENT,
      trip_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(50) NOT NULL,
      total DECIMAL(10,2) NOT NULL,
      paid_by_member_id INT NOT NULL,
      split_mode VARCHAR(20) NOT NULL DEFAULT 'equal',
      notes TEXT,
      occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by_member_id INT,
      INDEX idx_expense_trip (trip_id),
      FOREIGN KEY (trip_id) REFERENCES trip(id) ON DELETE CASCADE,
      FOREIGN KEY (paid_by_member_id) REFERENCES member(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  ");
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS expense_share (
      id INT PRIMARY KEY AUTO_INCREMENT,
      expense_id INT NOT NULL,
      member_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      label VARCHAR(255),
      INDEX idx_share_expense (expense_id),
      INDEX idx_share_member (member_id),
      FOREIGN KEY (expense_id) REFERENCES expense(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES member(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  ");
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS settlement (
      id INT PRIMARY KEY AUTO_INCREMENT,
      trip_id INT NOT NULL,
      from_member_id INT NOT NULL,
      to_member_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      category VARCHAR(50),
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trip(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  ");
}

function seed($pdo) {
  $pdo->exec("INSERT INTO trip (id, name, destination, date_start, date_end, currency)
              VALUES (1, 'Vacanza 2026', 'Da definire', '2026-07-01', '2026-07-08', 'EUR')");
  $names = ['Thomas', 'Syria', 'Riccardo', 'Massimo', 'Mirko', 'Stefano', 'Adriana', 'Michelle'];
  $stmt = $pdo->prepare("INSERT INTO member (trip_id, name, pin, is_admin) VALUES (1, ?, '', ?)");
  foreach ($names as $i => $n) {
    $stmt->execute([$n, $i === 0 ? 1 : 0]);
  }
  $pdo->exec("UPDATE trip SET payer_member_id = 1 WHERE id = 1");
}

function json_response($data, $code = 200) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function body() {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function require_member() {
  if (session_status() === PHP_SESSION_NONE) session_start();
  if (empty($_SESSION['member_id'])) json_response(['error' => 'unauthenticated'], 401);
  $stmt = db()->prepare("SELECT * FROM member WHERE id = ?");
  $stmt->execute([$_SESSION['member_id']]);
  $m = $stmt->fetch();
  if (!$m) json_response(['error' => 'unauthenticated'], 401);
  return $m;
}

function require_admin() {
  $m = require_member();
  if (!$m['is_admin']) json_response(['error' => 'forbidden'], 403);
  return $m;
}
