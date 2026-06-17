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
  // Allarga la colonna avatar per ospitare le foto profilo (data URL base64) — solo MySQL, idempotente
  if (driver_name($pdo) === 'mysql') {
    $t = $pdo->query("SELECT DATA_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'member' AND column_name = 'avatar'")->fetch();
    $dt = $t ? strtolower($t['DATA_TYPE']) : '';
    if ($t && $dt !== 'mediumtext' && $dt !== 'text' && $dt !== 'longtext') {
      $pdo->exec("ALTER TABLE member MODIFY avatar MEDIUMTEXT");
    }
  }
  // Foto profilo fornite via repo (asset committati) — impostate solo se l'avatar è vuoto, idempotente
  $avatarSeeds = [
    'Thomas'   => 'assets/avatars/thomas.jpg',
    'Syria'    => 'assets/avatars/syria.jpg',
    'Riccardo' => 'assets/avatars/riccardo.jpg',
    'Massimo'  => 'assets/avatars/massimo.jpg',
    'Mirko'    => 'assets/avatars/mirko.jpg',
    'Stefano'  => 'assets/avatars/stefano.jpg',
    'Adriana'  => 'assets/avatars/adriana.jpg',
    'Michelle' => 'assets/avatars/michelle.jpg',
  ];
  $upd = $pdo->prepare("UPDATE member SET avatar = ? WHERE trip_id = 1 AND name = ? AND (avatar IS NULL OR avatar = '')");
  foreach ($avatarSeeds as $name => $path) {
    $upd->execute([$path, $name]);
  }

  // Seed iniziale ristoranti (Tre Fratelli) se non presenti — idempotente, gira anche su DB già esistenti
  seed_restaurants($pdo);
}

// ============ RISTORANTI: menù Tre Fratelli (prezzi in L.E) ============
function tre_fratelli_menu() {
  return [
    'Antipasti' => [
      ['Bruschetta al Pomodoro (3 pezzi)', 90, null],
      ['Cocktail di Gamberetti', 220, null],
      ['Bresaola Rucola e Grana', 250, null],
      ['Carpaccio di Manzo Rucola e Grana', 220, null],
      ['Vongole al Pomodoro', 270, null],
      ['Carpaccio di Salmone', 300, null],
      ['Antipasto 3 Fratelli', 150, 'Bruschetta al salmone, con mozzarella di bufala, alla bresaola'],
    ],
    'Zuppe' => [
      ['Zuppa di Frutti di Mare', 300, null],
      ['Zuppa di Pomodoro', 100, null],
      ['Zuppa di Pollo', 150, null],
    ],
    'Insalate' => [
      ['Insalata Mista', 100, 'Lattuga, pomodoro, rucola, cetrioli'],
      ['Insalata Greca', 150, 'Lattuga, pomodoro, rucola, cetrioli'],
      ['Mozzarella di Bufala', 200, 'Mozzarella di bufala, pomodoro'],
      ['Insalata di Tonno', 185, null],
      ['Insalata Frutti di Mare', 300, 'Cappuccia, frutti di mare'],
      ['Insalata 3 Fratelli', 200, 'Lattuga, mais, uovo, tonno, mozzarella di bufala'],
    ],
    'Pizza' => [
      ['Pizza Stria Rosmarino', 140, null],
      ['Pizza Margherita', 225, null],
      ['Pizza Buffala', 310, null],
      ['Pizza Napoli', 275, 'Pomodoro, formaggio, acciughe'],
      ['Pizza Romana', 280, 'Pomodoro, formaggio, acciughe, capperi'],
      ['Pizza Vegetariana', 265, null],
      ['Pizza Quattro Formaggi', 300, null],
      ['Pizza Quattro Stagioni', 300, 'Verdure, salame, olive, funghi'],
      ['Pizza Tonno e Cipolle', 300, null],
      ['Pizza Frutti di Mare', 330, null],
      ['Pizza Bresaola Rucola e Grana', 330, null],
      ['Calzone Bolognese', 300, null],
      ['Pizza Bolognese', 300, null],
      ['Pizza Wurstel', 300, null],
      ['Pizza Salame', 300, null],
      ['Pizza Pollo', 310, null],
      ['Pizza Funghi', 300, null],
      ['Pizza Gamberi', 330, null],
    ],
    'Pasta' => [
      ['Spaghetti al Pomodoro', 180, null],
      ['Spaghetti Bolognese', 250, null],
      ['Spaghetti ai Frutti di Mare', 330, 'Al pomodoro o aglio e olio'],
      ['Spaghetti alle Vongole', 330, null],
      ['Spaghetti al Granchio', 330, null],
      ["Penne all'Arrabbiata", 180, null],
      ['Penne al Salmone', 330, null],
      ['Penne al Tonno', 265, null],
      ['Penne Pollo e Funghi', 200, null],
      ['Tagliatelle Panna e Gamberi', 330, null],
      ['Tagliatelle al Pesto', 250, null],
      ['Ravioli Burro e Parmigiano', 300, null],
      ['Ravioli Crema di Pomodoro', 300, null],
      ['Ravioli Crema di Funghi', 330, null],
      ['Gnocchi al Gorgonzola', 300, null],
      ['Gnocchi Gamberetti e Zucchine', 340, null],
      ['Lasagne alla Bolognese', 270, null],
    ],
    'Secondi - Carne' => [
      ['Filetto di Manzo alla Griglia', 480, 'Con contorno a scelta'],
      ['Filetto di Manzo (salsa)', 520, 'Salsa ai funghi, al pepe o ai formaggi · con contorno'],
      ['Tagliata di Manzo con Rucola e Grana', 480, 'Con contorno a scelta'],
      ['Tagliata di Manzo con Gorgonzola', 520, 'Con contorno a scelta'],
      ["Costolette d'Agnello alla Griglia", 600, 'Con contorno a scelta'],
      ['Straccetti di Manzo', 360, 'Balsamico, rucola e parmigiano · con contorno'],
      ['Straccetti di Pollo', 300, 'Balsamico, rucola e parmigiano · con contorno'],
      ['Cotoletta alla Milanese', 400, 'Con contorno a scelta'],
      ['Cotoletta di Pollo', 320, 'Con contorno a scelta'],
      ['Pollo alla Griglia', 300, 'Con contorno a scelta'],
      ['Pollo ai Funghi', 340, 'Con contorno a scelta'],
      ['Pollo al Limone', 330, 'Con contorno a scelta'],
    ],
    'Secondi - Pesce' => [
      ['Filetto di Pesce Fritto', 380, 'Con contorno a scelta'],
      ['Gamberi al Limone', 480, 'Con contorno a scelta'],
      ['Gamberi (Fritti o alla Griglia)', 480, 'Con contorno a scelta'],
      ['Calamari (Fritti o alla Griglia)', 400, 'Con contorno a scelta'],
      ['Misto di Pesce (Fritto o alla Griglia)', 520, 'Con contorno a scelta'],
    ],
  ];
}

function seed_restaurants($pdo) {
  $n = (int)$pdo->query("SELECT COUNT(*) AS n FROM restaurant")->fetch()['n'];
  if ($n > 0) return;
  $pdo->beginTransaction();
  try {
    $stmt = $pdo->prepare("INSERT INTO restaurant (trip_id, name, currency, emoji, note, active) VALUES (1, ?, 'L.E', '🍝', ?, 1)");
    $stmt->execute(['Tre Fratelli', 'Menù italiano · tutti i secondi sono serviti con un contorno a scelta (patatine fritte, patate al forno o verdure grigliate)']);
    $rid = (int)$pdo->lastInsertId();
    $itemStmt = $pdo->prepare("INSERT INTO menu_item (restaurant_id, section, name, description, price, sort, active) VALUES (?, ?, ?, ?, ?, ?, 1)");
    $sort = 0;
    foreach (tre_fratelli_menu() as $section => $items) {
      foreach ($items as $it) {
        $itemStmt->execute([$rid, $section, $it[0], $it[2], $it[1], $sort++]);
      }
    }
    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
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

    CREATE TABLE IF NOT EXISTS restaurant (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      currency TEXT DEFAULT 'L.E',
      emoji TEXT DEFAULT '🍝',
      note TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS menu_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      section TEXT NOT NULL DEFAULT 'Menù',
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      sort INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      FOREIGN KEY (restaurant_id) REFERENCES restaurant(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS dining_session (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL DEFAULT 1,
      restaurant_id INTEGER NOT NULL,
      title TEXT,
      dined_on TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_by_member_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurant(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS dining_order (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      menu_item_id INTEGER,
      name TEXT NOT NULL,
      unit_price REAL NOT NULL DEFAULT 0,
      qty INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES dining_session(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS dining_paid (
      session_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, member_id)
    );
    CREATE INDEX IF NOT EXISTS idx_menu_restaurant ON menu_item(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_dsession_trip ON dining_session(trip_id);
    CREATE INDEX IF NOT EXISTS idx_dorder_session ON dining_order(session_id);

    CREATE TABLE IF NOT EXISTS poker_meta (
      trip_id INTEGER PRIMARY KEY,
      quota REAL NOT NULL DEFAULT 0,
      hands INTEGER NOT NULL DEFAULT 0,
      published_by_member_id INTEGER,
      published_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS poker_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL DEFAULT 1,
      member_id INTEGER,
      name TEXT NOT NULL,
      net REAL NOT NULL DEFAULT 0,
      won INTEGER NOT NULL DEFAULT 0,
      paid INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_poker_ledger_trip ON poker_ledger(trip_id);
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
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS restaurant (
      id INT PRIMARY KEY AUTO_INCREMENT,
      trip_id INT NOT NULL DEFAULT 1,
      name VARCHAR(255) NOT NULL,
      currency VARCHAR(10) DEFAULT 'L.E',
      emoji VARCHAR(16) DEFAULT '🍝',
      note TEXT,
      active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  ");
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS menu_item (
      id INT PRIMARY KEY AUTO_INCREMENT,
      restaurant_id INT NOT NULL,
      section VARCHAR(100) NOT NULL DEFAULT 'Menù',
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      sort INT DEFAULT 0,
      active TINYINT(1) DEFAULT 1,
      INDEX idx_menu_restaurant (restaurant_id),
      FOREIGN KEY (restaurant_id) REFERENCES restaurant(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  ");
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS dining_session (
      id INT PRIMARY KEY AUTO_INCREMENT,
      trip_id INT NOT NULL DEFAULT 1,
      restaurant_id INT NOT NULL,
      title VARCHAR(255),
      dined_on DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      created_by_member_id INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dsession_trip (trip_id),
      FOREIGN KEY (restaurant_id) REFERENCES restaurant(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  ");
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS dining_order (
      id INT PRIMARY KEY AUTO_INCREMENT,
      session_id INT NOT NULL,
      member_id INT NOT NULL,
      menu_item_id INT,
      name VARCHAR(255) NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      qty INT NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dorder_session (session_id),
      FOREIGN KEY (session_id) REFERENCES dining_session(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  ");
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS dining_paid (
      session_id INT NOT NULL,
      member_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, member_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS poker_meta (
      trip_id INT PRIMARY KEY,
      quota DECIMAL(10,2) NOT NULL DEFAULT 0,
      hands INT NOT NULL DEFAULT 0,
      published_by_member_id INT,
      published_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS poker_ledger (
      id INT AUTO_INCREMENT PRIMARY KEY,
      trip_id INT NOT NULL DEFAULT 1,
      member_id INT,
      name VARCHAR(120) NOT NULL,
      net DECIMAL(10,2) NOT NULL DEFAULT 0,
      won INT NOT NULL DEFAULT 0,
      paid TINYINT NOT NULL DEFAULT 0,
      paid_at DATETIME,
      INDEX idx_poker_ledger_trip (trip_id)
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
