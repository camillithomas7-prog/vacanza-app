<?php
$cssV = @filemtime(__DIR__ . '/assets/styles.css') ?: time();
$jsV  = @filemtime(__DIR__ . '/assets/app.js')   ?: time();
header('Cache-Control: no-cache, must-revalidate');
?>
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
  <meta name="theme-color" content="#0b1220" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="manifest" href="manifest.json" />
  <link rel="stylesheet" href="assets/styles.css?v=<?= $cssV ?>" />
  <title>Vacanza</title>
</head>
<body>
  <div id="app"></div>

  <!-- ============== LOGIN VIEW ============== -->
  <template id="tpl-login">
    <div class="login-screen">
      <div class="login-card">
        <div class="login-hero">
          <div class="login-emoji">🏝️</div>
          <h1 id="loginTripName">Vacanza</h1>
          <p class="muted">Tocca il tuo nome per entrare</p>
        </div>
        <div class="member-grid" id="memberGrid"></div>
        <div class="error" id="loginError"></div>
      </div>
    </div>
  </template>

  <!-- ============== APP SHELL ============== -->
  <template id="tpl-shell">
    <div class="shell">
      <header class="topbar">
        <div class="topbar-left">
          <div class="avatar-circle" id="meAvatar"></div>
          <div>
            <div class="topbar-trip" id="topTrip">Vacanza</div>
            <div class="topbar-me" id="topMe"></div>
          </div>
        </div>
        <button class="icon-btn" id="logoutBtn" title="Esci">⏻</button>
      </header>
      <main class="screen" id="screen"></main>
      <nav class="tabbar">
        <button data-route="home"><span>🏠</span><b>Home</b></button>
        <button data-route="expenses"><span>📋</span><b>Spese</b></button>
        <button data-route="new" class="fab-tab"><span>➕</span></button>
        <button data-route="people"><span>👥</span><b>Persone</b></button>
        <button data-route="settle"><span>💳</span><b>Saldi</b></button>
      </nav>
    </div>
  </template>

  <script src="assets/app.js?v=<?= $jsV ?>"></script>
</body>
</html>
