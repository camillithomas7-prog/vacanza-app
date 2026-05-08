<?php
// Caricatore di configurazione.
// Le credenziali reali NON stanno in questo file: arrivano da secrets.php (gitignored)
// o da variabili d'ambiente. secrets.example.php mostra il formato.

$secrets = __DIR__ . '/secrets.php';
if (file_exists($secrets)) {
  return require $secrets;
}

// Fallback: env vars (per chi vuole configurare via .htaccess SetEnv o pannello hosting)
if (getenv('DB_DRIVER') === 'mysql') {
  return [
    'driver'  => 'mysql',
    'host'    => getenv('DB_HOST') ?: 'localhost',
    'port'    => (int)(getenv('DB_PORT') ?: 3306),
    'dbname'  => getenv('DB_NAME') ?: '',
    'user'    => getenv('DB_USER') ?: '',
    'pass'    => getenv('DB_PASS') ?: '',
    'charset' => 'utf8mb4',
  ];
}

// Default: SQLite locale (dev)
return [
  'driver' => 'sqlite',
  'path'   => __DIR__ . '/data.db',
];
