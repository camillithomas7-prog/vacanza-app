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
  <meta name="theme-color" content="#04070A" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="manifest" href="manifest.json" />
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png?v=<?= @filemtime(__DIR__ . '/assets/apple-touch-icon.png') ?: time() ?>" />
  <link rel="icon" type="image/png" href="assets/icon-192.png?v=<?= @filemtime(__DIR__ . '/assets/icon-192.png') ?: time() ?>" />

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300..800&family=Geist+Mono:wght@300..600&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="assets/styles.css?v=<?= $cssV ?>" />

  <!-- Tabellone freccette neon (canvas 2D leggero, carica all'istante) -->
  <script src="assets/dartsboard.js?v=<?= @filemtime(__DIR__ . '/assets/dartsboard.js') ?: time() ?>"></script>

  <title>Vacanza</title>
</head>
<body>
  <canvas id="bgfx" aria-hidden="true"></canvas>
  <div id="app"></div>

  <!-- ============== LOGIN VIEW ============== -->
  <template id="tpl-login">
    <div class="login-screen">
      <div class="login-card">
        <div class="login-hero">
          <div class="login-emoji"><img src="assets/logo.gif?v=<?= @filemtime(__DIR__ . '/assets/logo.gif') ?: time() ?>" alt="" /></div>
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
        <button class="icon-btn" id="logoutBtn" title="Esci" aria-label="Esci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
      </header>
      <main class="screen" id="screen"></main>
      <nav class="tabbar">
        <button data-route="home"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg></span><b>Home</b></button>
        <button data-route="dining"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z"/><path d="M21 15v7"/></svg></span><b>Cene</b></button>
        <button data-route="new" class="fab-tab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button>
        <button data-route="expenses"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5 4 2Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg></span><b>Spese</b></button>
        <button data-route="settle"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg></span><b>Saldi</b></button>
      </nav>
    </div>
  </template>

  <script src="assets/app.js?v=<?= $jsV ?>"></script>
</body>
</html>
