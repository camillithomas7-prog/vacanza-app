<?php
require_once __DIR__ . '/db.php';
session_start();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

try {
  switch ($action) {

    // ---------------- AUTH ----------------
    case 'me': {
      if (empty($_SESSION['member_id'])) json_response(['member' => null]);
      $stmt = db()->prepare("SELECT m.*, t.name as trip_name, t.currency FROM member m JOIN trip t ON t.id = m.trip_id WHERE m.id = ?");
      $stmt->execute([$_SESSION['member_id']]);
      json_response(['member' => $stmt->fetch()]);
    }

    case 'members_public': {
      // For login screen: list of members + has_pin (no PIN itself)
      $rows = db()->query("SELECT id, name, avatar, is_admin FROM member WHERE trip_id = 1 ORDER BY id")->fetchAll();
      json_response(['members' => $rows]);
    }

    case 'login': {
      $b = body();
      $id = (int)($b['member_id'] ?? 0);
      $stmt = db()->prepare("SELECT * FROM member WHERE id = ? AND trip_id = 1");
      $stmt->execute([$id]);
      $m = $stmt->fetch();
      if (!$m) json_response(['error' => 'Persona non trovata'], 404);
      $_SESSION['member_id'] = $m['id'];
      json_response(['member' => $m]);
    }

    case 'logout': {
      $_SESSION = [];
      session_destroy();
      json_response(['ok' => true]);
    }

    // ---------------- TRIP ----------------
    case 'trip': {
      require_member();
      $trip = db()->query("SELECT * FROM trip WHERE id = 1")->fetch();
      json_response(['trip' => $trip]);
    }

    case 'trip_update': {
      require_admin();
      $b = body();
      $stmt = db()->prepare("UPDATE trip SET name = ?, destination = ?, date_start = ?, date_end = ?, currency = ?, payer_member_id = ? WHERE id = 1");
      $stmt->execute([
        $b['name'] ?? 'Vacanza',
        $b['destination'] ?? null,
        $b['date_start'] ?? null,
        $b['date_end'] ?? null,
        $b['currency'] ?? 'EUR',
        (int)($b['payer_member_id'] ?? 1),
      ]);
      json_response(['ok' => true]);
    }

    // ---------------- MEMBERS ----------------
    case 'members': {
      $me = require_member();
      if ($me['is_admin']) {
        $rows = db()->query("SELECT id, name, avatar, budget, budget_paid, is_admin FROM member WHERE trip_id = 1 ORDER BY id")->fetchAll();
      } else {
        // Non-admin: vede nomi/avatar di tutti (per le label "pagato da X") ma niente budget altrui
        $rows = db()->query("SELECT id, name, avatar, is_admin FROM member WHERE trip_id = 1 ORDER BY id")->fetchAll();
        $stmt = db()->prepare("SELECT budget, budget_paid FROM member WHERE id = ?");
        $stmt->execute([$me['id']]);
        $own = $stmt->fetch();
        foreach ($rows as &$r) {
          if ((int)$r['id'] === (int)$me['id']) {
            $r['budget'] = (float)$own['budget'];
            $r['budget_paid'] = (int)$own['budget_paid'];
          } else {
            $r['budget'] = 0;
            $r['budget_paid'] = 0;
          }
        }
        unset($r);
      }
      json_response(['members' => $rows]);
    }

    case 'member_update': {
      $me = require_member();
      $b = body();
      $id = (int)($b['id'] ?? $me['id']);
      // only admin can edit others
      if ($id !== (int)$me['id'] && !$me['is_admin']) json_response(['error' => 'forbidden'], 403);
      $fields = [];
      $vals = [];
      foreach (['name', 'pin', 'avatar'] as $f) {
        if (array_key_exists($f, $b)) { $fields[] = "$f = ?"; $vals[] = $b[$f]; }
      }
      if (array_key_exists('budget', $b) && $me['is_admin']) { $fields[] = "budget = ?"; $vals[] = (float)$b['budget']; }
      if (array_key_exists('budget_paid', $b) && $me['is_admin']) { $fields[] = "budget_paid = ?"; $vals[] = (int)!!$b['budget_paid']; }
      if (!$fields) json_response(['ok' => true]);
      $vals[] = $id;
      $stmt = db()->prepare("UPDATE member SET " . implode(', ', $fields) . " WHERE id = ?");
      $stmt->execute($vals);
      json_response(['ok' => true]);
    }

    case 'member_add': {
      require_admin();
      $b = body();
      $stmt = db()->prepare("INSERT INTO member (trip_id, name, pin, budget) VALUES (1, ?, '', ?)");
      $stmt->execute([$b['name'] ?? 'Nuovo', (float)($b['budget'] ?? 0)]);
      json_response(['id' => db()->lastInsertId()]);
    }

    case 'member_delete': {
      require_admin();
      $b = body();
      $id = (int)($b['id'] ?? 0);
      $stmt = db()->prepare("DELETE FROM member WHERE id = ? AND trip_id = 1");
      $stmt->execute([$id]);
      json_response(['ok' => true]);
    }

    // ---------------- EXPENSES ----------------
    case 'expenses': {
      $me = require_member();
      if ($me['is_admin']) {
        $rows = db()->query("
          SELECT e.*, m.name as paid_by_name
          FROM expense e
          LEFT JOIN member m ON m.id = e.paid_by_member_id
          WHERE e.trip_id = 1
          ORDER BY e.occurred_at DESC, e.id DESC
        ")->fetchAll();
        $stmt = db()->prepare("
          SELECT s.*, m.name as member_name
          FROM expense_share s JOIN member m ON m.id = s.member_id
          WHERE s.expense_id = ?
          ORDER BY s.id
        ");
        foreach ($rows as &$e) {
          $stmt->execute([$e['id']]);
          $e['shares'] = $stmt->fetchAll();
        }
        unset($e);
      } else {
        // Non-admin: solo spese che lo coinvolgono, e solo la propria quota
        $stmt = db()->prepare("
          SELECT DISTINCT e.*, m.name as paid_by_name
          FROM expense e
          LEFT JOIN member m ON m.id = e.paid_by_member_id
          JOIN expense_share s ON s.expense_id = e.id AND s.member_id = ?
          WHERE e.trip_id = 1
          ORDER BY e.occurred_at DESC, e.id DESC
        ");
        $stmt->execute([$me['id']]);
        $rows = $stmt->fetchAll();
        $sharesStmt = db()->prepare("
          SELECT s.*, m.name as member_name
          FROM expense_share s JOIN member m ON m.id = s.member_id
          WHERE s.expense_id = ? AND s.member_id = ?
        ");
        foreach ($rows as &$e) {
          $sharesStmt->execute([$e['id'], $me['id']]);
          $e['shares'] = $sharesStmt->fetchAll();
        }
        unset($e);
      }
      json_response(['expenses' => $rows]);
    }

    case 'expense_create': {
      $me = require_member();
      $b = body();

      // Non-admin: forziamo modalità "personale" — single share = self, paid by treasurer
      if (!$me['is_admin']) {
        $title    = trim($b['title'] ?? '');
        $category = $b['category'] ?? 'altro';
        $total    = round((float)($b['total'] ?? 0), 2);
        $notes    = $b['notes'] ?? null;
        $occurredAt = $b['occurred_at'] ?? null;
        if ($total <= 0 || !$title) json_response(['error' => 'Inserisci descrizione e importo'], 400);

        $tripRow = db()->query("SELECT payer_member_id FROM trip WHERE id = 1")->fetch();
        $treasurerId = (int)($tripRow['payer_member_id'] ?? 0);
        if (!$treasurerId) $treasurerId = 1;

        $pdo = db();
        $pdo->beginTransaction();
        try {
          $stmt = $pdo->prepare("INSERT INTO expense (trip_id, title, category, total, paid_by_member_id, split_mode, notes, occurred_at, created_by_member_id) VALUES (1, ?, ?, ?, ?, 'custom', ?, COALESCE(?, CURRENT_TIMESTAMP), ?)");
          $stmt->execute([$title, $category, $total, $treasurerId, $notes, $occurredAt, $me['id']]);
          $expenseId = $pdo->lastInsertId();
          $shareStmt = $pdo->prepare("INSERT INTO expense_share (expense_id, member_id, amount) VALUES (?, ?, ?)");
          $shareStmt->execute([$expenseId, $me['id'], $total]);
          $pdo->commit();
          json_response(['id' => $expenseId]);
        } catch (Exception $e) {
          $pdo->rollBack();
          json_response(['error' => $e->getMessage()], 400);
        }
      }

      // Admin: flusso completo (equa/items/custom)
      $title    = trim($b['title'] ?? '');
      $category = $b['category'] ?? 'altro';
      $total    = round((float)($b['total'] ?? 0), 2);
      $paidBy   = (int)($b['paid_by_member_id'] ?? $me['id']);
      $splitMode = $b['split_mode'] ?? 'equal';
      $shares   = $b['shares'] ?? [];
      $notes    = $b['notes'] ?? null;
      $occurredAt = $b['occurred_at'] ?? null;

      if ($total <= 0 || !$title) json_response(['error' => 'Dati non validi'], 400);

      $pdo = db();
      $pdo->beginTransaction();
      try {
        $stmt = $pdo->prepare("INSERT INTO expense (trip_id, title, category, total, paid_by_member_id, split_mode, notes, occurred_at, created_by_member_id) VALUES (1, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)");
        $stmt->execute([$title, $category, $total, $paidBy, $splitMode, $notes, $occurredAt, $me['id']]);
        $expenseId = $pdo->lastInsertId();

        // Build shares list
        if ($splitMode === 'equal') {
          $ids = $b['member_ids'] ?? [];
          if (!$ids) {
            $ids = array_map(fn($r) => (int)$r['id'], $pdo->query("SELECT id FROM member WHERE trip_id = 1")->fetchAll());
          }
          $n = count($ids);
          if ($n === 0) throw new Exception('Nessun partecipante');
          $base = floor(($total * 100) / $n);
          $remainder = round($total * 100) - $base * $n;
          $shareStmt = $pdo->prepare("INSERT INTO expense_share (expense_id, member_id, amount) VALUES (?, ?, ?)");
          foreach ($ids as $i => $mid) {
            $cents = $base + ($i < $remainder ? 1 : 0);
            $shareStmt->execute([$expenseId, (int)$mid, $cents / 100]);
          }
        } else if ($splitMode === 'custom' || $splitMode === 'items') {
          // shares: [{member_id, amount, label?}]
          $sum = 0;
          $shareStmt = $pdo->prepare("INSERT INTO expense_share (expense_id, member_id, amount, label) VALUES (?, ?, ?, ?)");
          foreach ($shares as $s) {
            $amt = round((float)$s['amount'], 2);
            $sum += $amt;
            $shareStmt->execute([$expenseId, (int)$s['member_id'], $amt, $s['label'] ?? null]);
          }
          if (abs($sum - $total) > 0.05) {
            throw new Exception("La somma delle quote (€" . number_format($sum, 2) . ") non corrisponde al totale (€" . number_format($total, 2) . ")");
          }
        } else {
          throw new Exception('split_mode non valido');
        }
        $pdo->commit();
        json_response(['id' => $expenseId]);
      } catch (Exception $e) {
        $pdo->rollBack();
        json_response(['error' => $e->getMessage()], 400);
      }
    }

    case 'expense_update': {
      $me = require_member();
      $b = body();
      $id = (int)($b['id'] ?? 0);
      $stmt = db()->prepare("SELECT * FROM expense WHERE id = ? AND trip_id = 1");
      $stmt->execute([$id]);
      $e = $stmt->fetch();
      if (!$e) json_response(['error' => 'not found'], 404);

      // Non-admin: solo le proprie spese personali (single-share = self)
      if (!$me['is_admin']) {
        if ((int)$e['created_by_member_id'] !== (int)$me['id']) {
          json_response(['error' => 'Puoi modificare solo le tue spese'], 403);
        }
        $cnt = db()->prepare("SELECT COUNT(*) AS n FROM expense_share WHERE expense_id = ?");
        $cnt->execute([$id]);
        if ((int)$cnt->fetch()['n'] !== 1) {
          json_response(['error' => 'Le spese di gruppo le modifica solo l\'admin'], 403);
        }
      }

      $title    = trim($b['title'] ?? $e['title']);
      $category = $b['category'] ?? $e['category'];
      $total    = round((float)($b['total'] ?? $e['total']), 2);
      $notes    = array_key_exists('notes', $b) ? $b['notes'] : $e['notes'];
      if ($total <= 0 || !$title) json_response(['error' => 'Dati non validi'], 400);

      $pdo = db();
      $pdo->beginTransaction();
      try {
        $u = $pdo->prepare("UPDATE expense SET title = ?, category = ?, total = ?, notes = ? WHERE id = ?");
        $u->execute([$title, $category, $total, $notes, $id]);

        // Se è una spesa personale (single share), aggiorno anche la quota
        $cnt = $pdo->prepare("SELECT COUNT(*) AS n FROM expense_share WHERE expense_id = ?");
        $cnt->execute([$id]);
        if ((int)$cnt->fetch()['n'] === 1) {
          $us = $pdo->prepare("UPDATE expense_share SET amount = ? WHERE expense_id = ?");
          $us->execute([$total, $id]);
        }
        $pdo->commit();
        json_response(['ok' => true]);
      } catch (Exception $ex) {
        $pdo->rollBack();
        json_response(['error' => $ex->getMessage()], 400);
      }
    }

    case 'expense_delete': {
      $me = require_member();
      $b = body();
      $id = (int)($b['id'] ?? 0);
      $stmt = db()->prepare("SELECT * FROM expense WHERE id = ? AND trip_id = 1");
      $stmt->execute([$id]);
      $e = $stmt->fetch();
      if (!$e) json_response(['error' => 'not found'], 404);
      if (!$me['is_admin'] && (int)$e['created_by_member_id'] !== (int)$me['id']) {
        json_response(['error' => 'Puoi eliminare solo le tue spese'], 403);
      }
      $stmt = db()->prepare("DELETE FROM expense WHERE id = ?");
      $stmt->execute([$id]);
      json_response(['ok' => true]);
    }

    // ---------------- SETTLEMENTS ----------------
    case 'settlements': {
      $me = require_member();
      $sql = "
        SELECT s.*, mf.name as from_name, mt.name as to_name
        FROM settlement s
        JOIN member mf ON mf.id = s.from_member_id
        JOIN member mt ON mt.id = s.to_member_id
        WHERE s.trip_id = 1
      ";
      $params = [];
      if (!$me['is_admin']) {
        $sql .= " AND (s.from_member_id = ? OR s.to_member_id = ?)";
        $params = [$me['id'], $me['id']];
      }
      $sql .= " ORDER BY s.created_at DESC";
      $stmt = db()->prepare($sql);
      $stmt->execute($params);
      json_response(['settlements' => $stmt->fetchAll()]);
    }

    case 'settlement_create': {
      $me = require_member();
      $b = body();
      $fromId = (int)($b['from_member_id'] ?? 0);
      $toId = (int)($b['to_member_id'] ?? 0);
      if (!$me['is_admin'] && $fromId !== (int)$me['id']) {
        json_response(['error' => 'Puoi registrare solo i tuoi acconti'], 403);
      }
      $stmt = db()->prepare("INSERT INTO settlement (trip_id, from_member_id, to_member_id, amount, category, note) VALUES (1, ?, ?, ?, ?, ?)");
      $stmt->execute([
        $fromId,
        $toId,
        round((float)($b['amount'] ?? 0), 2),
        $b['category'] ?? null,
        $b['note'] ?? null,
      ]);
      json_response(['id' => db()->lastInsertId()]);
    }

    case 'settlement_delete': {
      $me = require_member();
      $b = body();
      $id = (int)($b['id'] ?? 0);
      $stmt = db()->prepare("SELECT * FROM settlement WHERE id = ? AND trip_id = 1");
      $stmt->execute([$id]);
      $s = $stmt->fetch();
      if (!$s) json_response(['error' => 'not found'], 404);
      if (!$me['is_admin'] && (int)$s['from_member_id'] !== (int)$me['id']) {
        json_response(['error' => 'Solo chi ha registrato l\'acconto (o l\'admin) può eliminarlo'], 403);
      }
      $stmt = db()->prepare("DELETE FROM settlement WHERE id = ?");
      $stmt->execute([$id]);
      json_response(['ok' => true]);
    }

    case 'settlement_update': {
      $me = require_member();
      $b = body();
      $id = (int)($b['id'] ?? 0);
      $stmt = db()->prepare("SELECT * FROM settlement WHERE id = ? AND trip_id = 1");
      $stmt->execute([$id]);
      $s = $stmt->fetch();
      if (!$s) json_response(['error' => 'not found'], 404);
      if (!$me['is_admin'] && (int)$s['from_member_id'] !== (int)$me['id']) {
        json_response(['error' => 'Solo chi ha registrato l\'acconto (o l\'admin) può modificarlo'], 403);
      }
      $fields = []; $vals = [];
      if (array_key_exists('amount', $b))   { $fields[] = "amount = ?";   $vals[] = round((float)$b['amount'], 2); }
      if (array_key_exists('category', $b)) { $fields[] = "category = ?"; $vals[] = $b['category']; }
      if (array_key_exists('note', $b))     { $fields[] = "note = ?";     $vals[] = $b['note']; }
      if (!$fields) json_response(['ok' => true]);
      $vals[] = $id;
      $stmt = db()->prepare("UPDATE settlement SET " . implode(', ', $fields) . " WHERE id = ?");
      $stmt->execute($vals);
      json_response(['ok' => true]);
    }

    // ---------------- SUMMARY ----------------
    case 'summary': {
      $me = require_member();
      $pdo = db();
      $trip = $pdo->query("SELECT * FROM trip WHERE id = 1")->fetch();
      $members = $pdo->query("SELECT id, name, budget, budget_paid FROM member WHERE trip_id = 1 ORDER BY id")->fetchAll();

      // Per-member: spent (sum of own shares), paid (sum of expenses they paid), settled_to (paid back to anyone)
      $perMember = [];
      foreach ($members as $m) {
        $perMember[$m['id']] = [
          'id' => (int)$m['id'],
          'name' => $m['name'],
          'budget' => (float)$m['budget'],
          'budget_paid' => (int)$m['budget_paid'],
          'spent' => 0,        // quota spese a suo carico
          'paid' => 0,         // soldi anticipati per il gruppo
          'settled_paid' => 0, // bonifici inviati
          'settled_received' => 0, // bonifici ricevuti
        ];
      }
      $shares = $pdo->query("
        SELECT s.member_id, SUM(s.amount) as total
        FROM expense_share s JOIN expense e ON e.id = s.expense_id
        WHERE e.trip_id = 1
        GROUP BY s.member_id
      ")->fetchAll();
      foreach ($shares as $s) {
        if (isset($perMember[$s['member_id']])) $perMember[$s['member_id']]['spent'] = (float)$s['total'];
      }
      $paid = $pdo->query("
        SELECT paid_by_member_id, SUM(total) as total FROM expense WHERE trip_id = 1 GROUP BY paid_by_member_id
      ")->fetchAll();
      foreach ($paid as $p) {
        if (isset($perMember[$p['paid_by_member_id']])) $perMember[$p['paid_by_member_id']]['paid'] = (float)$p['total'];
      }
      $sentSettle = $pdo->query("SELECT from_member_id, SUM(amount) as t FROM settlement WHERE trip_id=1 GROUP BY from_member_id")->fetchAll();
      foreach ($sentSettle as $s) if (isset($perMember[$s['from_member_id']])) $perMember[$s['from_member_id']]['settled_paid'] = (float)$s['t'];
      $recvSettle = $pdo->query("SELECT to_member_id, SUM(amount) as t FROM settlement WHERE trip_id=1 GROUP BY to_member_id")->fetchAll();
      foreach ($recvSettle as $s) if (isset($perMember[$s['to_member_id']])) $perMember[$s['to_member_id']]['settled_received'] = (float)$s['t'];

      // Net balance (positive = others owe them, negative = they owe)
      foreach ($perMember as &$m) {
        $m['balance'] = round($m['paid'] - $m['spent'] + $m['settled_paid'] - $m['settled_received'], 2);
        $m['budget_remaining'] = round($m['budget'] - $m['spent'], 2);
      }
      unset($m);

      // Per-category totals
      $byCat = $pdo->query("SELECT category, SUM(total) as total, COUNT(*) as n FROM expense WHERE trip_id=1 GROUP BY category ORDER BY total DESC")->fetchAll();
      $totalSpent = (float)($pdo->query("SELECT COALESCE(SUM(total),0) as t FROM expense WHERE trip_id=1")->fetch()['t']);

      // Settlement suggestions: simple greedy
      $debtors = []; $creditors = [];
      foreach ($perMember as $m) {
        $b = round($m['balance'], 2);
        if ($b < -0.01) $debtors[] = ['id' => $m['id'], 'name' => $m['name'], 'amt' => -$b];
        elseif ($b > 0.01) $creditors[] = ['id' => $m['id'], 'name' => $m['name'], 'amt' => $b];
      }
      $suggestions = [];
      $i = 0; $j = 0;
      while ($i < count($debtors) && $j < count($creditors)) {
        $pay = min($debtors[$i]['amt'], $creditors[$j]['amt']);
        $suggestions[] = [
          'from_id' => $debtors[$i]['id'], 'from_name' => $debtors[$i]['name'],
          'to_id' => $creditors[$j]['id'], 'to_name' => $creditors[$j]['name'],
          'amount' => round($pay, 2),
        ];
        $debtors[$i]['amt'] -= $pay;
        $creditors[$j]['amt'] -= $pay;
        if ($debtors[$i]['amt'] < 0.01) $i++;
        if ($creditors[$j]['amt'] < 0.01) $j++;
      }

      if (!$me['is_admin']) {
        $perMember = array_filter($perMember, fn($m) => (int)$m['id'] === (int)$me['id']);
        $suggestions = array_filter($suggestions, fn($s) => $s['from_id'] === (int)$me['id'] || $s['to_id'] === (int)$me['id']);
        // Per non-admin, byCategory e totalSpent diventano "le tue spese"
        $stmt = $pdo->prepare("
          SELECT e.category, SUM(s.amount) AS total, COUNT(DISTINCT e.id) AS n
          FROM expense_share s JOIN expense e ON e.id = s.expense_id
          WHERE e.trip_id = 1 AND s.member_id = ?
          GROUP BY e.category
          ORDER BY total DESC
        ");
        $stmt->execute([$me['id']]);
        $byCat = $stmt->fetchAll();
        $totalSpent = 0;
        foreach ($byCat as $c) $totalSpent += (float)$c['total'];
      }

      json_response([
        'trip' => $trip,
        'members' => array_values($perMember),
        'by_category' => $byCat,
        'total_spent' => $totalSpent,
        'suggestions' => array_values($suggestions),
      ]);
    }

    // ---------------- RISTORANTI ----------------
    case 'restaurants': {
      require_member();
      $rows = db()->query("SELECT * FROM restaurant WHERE trip_id = 1 AND active = 1 ORDER BY id")->fetchAll();
      json_response(['restaurants' => $rows]);
    }

    case 'restaurant_menu': {
      require_member();
      $rid = (int)($_GET['restaurant_id'] ?? 0);
      $r = db()->prepare("SELECT * FROM restaurant WHERE id = ?");
      $r->execute([$rid]);
      $rest = $r->fetch();
      if (!$rest) json_response(['error' => 'Ristorante non trovato'], 404);
      $stmt = db()->prepare("SELECT * FROM menu_item WHERE restaurant_id = ? AND active = 1 ORDER BY sort, id");
      $stmt->execute([$rid]);
      json_response(['restaurant' => $rest, 'items' => $stmt->fetchAll()]);
    }

    case 'restaurant_save': {
      require_admin();
      $b = body();
      $id = (int)($b['id'] ?? 0);
      if ($id) {
        $stmt = db()->prepare("UPDATE restaurant SET name = ?, currency = ?, emoji = ?, note = ? WHERE id = ?");
        $stmt->execute([$b['name'] ?? 'Ristorante', $b['currency'] ?? 'L.E', $b['emoji'] ?? '🍝', $b['note'] ?? null, $id]);
        json_response(['id' => $id]);
      } else {
        $stmt = db()->prepare("INSERT INTO restaurant (trip_id, name, currency, emoji, note, active) VALUES (1, ?, ?, ?, ?, 1)");
        $stmt->execute([$b['name'] ?? 'Ristorante', $b['currency'] ?? 'L.E', $b['emoji'] ?? '🍝', $b['note'] ?? null]);
        json_response(['id' => db()->lastInsertId()]);
      }
    }

    case 'restaurant_delete': {
      require_admin();
      $b = body();
      $stmt = db()->prepare("UPDATE restaurant SET active = 0 WHERE id = ?");
      $stmt->execute([(int)($b['id'] ?? 0)]);
      json_response(['ok' => true]);
    }

    case 'menu_item_save': {
      require_admin();
      $b = body();
      $id = (int)($b['id'] ?? 0);
      $price = round((float)($b['price'] ?? 0), 2);
      if ($id) {
        $stmt = db()->prepare("UPDATE menu_item SET section = ?, name = ?, description = ?, price = ? WHERE id = ?");
        $stmt->execute([$b['section'] ?? 'Menù', $b['name'] ?? '', $b['description'] ?? null, $price, $id]);
        json_response(['id' => $id]);
      } else {
        $rid = (int)($b['restaurant_id'] ?? 0);
        $maxSort = (int)(db()->query("SELECT COALESCE(MAX(sort),0) AS m FROM menu_item WHERE restaurant_id = " . $rid)->fetch()['m']);
        $stmt = db()->prepare("INSERT INTO menu_item (restaurant_id, section, name, description, price, sort, active) VALUES (?, ?, ?, ?, ?, ?, 1)");
        $stmt->execute([$rid, $b['section'] ?? 'Menù', $b['name'] ?? '', $b['description'] ?? null, $price, $maxSort + 1]);
        json_response(['id' => db()->lastInsertId()]);
      }
    }

    case 'menu_item_delete': {
      require_admin();
      $b = body();
      $stmt = db()->prepare("UPDATE menu_item SET active = 0 WHERE id = ?");
      $stmt->execute([(int)($b['id'] ?? 0)]);
      json_response(['ok' => true]);
    }

    // ---------------- TAVOLATE (dining sessions) ----------------
    case 'dining_sessions': {
      require_member();
      $rows = db()->query("
        SELECT ds.*, r.name AS restaurant_name, r.currency, r.emoji
        FROM dining_session ds JOIN restaurant r ON r.id = ds.restaurant_id
        WHERE ds.trip_id = 1
        ORDER BY (ds.status = 'open') DESC, ds.id DESC
      ")->fetchAll();
      // totale per ogni tavolata
      $tot = db()->prepare("SELECT COALESCE(SUM(unit_price * qty),0) AS t FROM dining_order WHERE session_id = ?");
      $cnt = db()->prepare("SELECT COUNT(DISTINCT member_id) AS n FROM dining_order WHERE session_id = ?");
      foreach ($rows as &$s) {
        $tot->execute([$s['id']]); $s['grand_total'] = (float)$tot->fetch()['t'];
        $cnt->execute([$s['id']]); $s['people'] = (int)$cnt->fetch()['n'];
      }
      unset($s);
      json_response(['sessions' => $rows]);
    }

    case 'dining_session_create': {
      $me = require_member();
      $b = body();
      $rid = (int)($b['restaurant_id'] ?? 0);
      if (!$rid) json_response(['error' => 'Scegli un ristorante'], 400);
      $stmt = db()->prepare("INSERT INTO dining_session (trip_id, restaurant_id, title, dined_on, status, created_by_member_id) VALUES (1, ?, ?, ?, 'open', ?)");
      $stmt->execute([$rid, $b['title'] ?? null, $b['dined_on'] ?? null, $me['id']]);
      json_response(['id' => db()->lastInsertId()]);
    }

    case 'dining_session_get': {
      $me = require_member();
      $id = (int)($_GET['id'] ?? 0);
      $stmt = db()->prepare("
        SELECT ds.*, r.name AS restaurant_name, r.currency, r.emoji, r.note AS restaurant_note
        FROM dining_session ds JOIN restaurant r ON r.id = ds.restaurant_id
        WHERE ds.id = ? AND ds.trip_id = 1
      ");
      $stmt->execute([$id]);
      $session = $stmt->fetch();
      if (!$session) json_response(['error' => 'Tavolata non trovata'], 404);

      $ordStmt = db()->prepare("
        SELECT o.*, m.name AS member_name
        FROM dining_order o JOIN member m ON m.id = o.member_id
        WHERE o.session_id = ? ORDER BY o.member_id, o.id
      ");
      $ordStmt->execute([$id]);
      $orders = $ordStmt->fetchAll();

      $paidStmt = db()->prepare("SELECT member_id, amount FROM dining_paid WHERE session_id = ?");
      $paidStmt->execute([$id]);
      $paidMap = [];
      foreach ($paidStmt->fetchAll() as $p) $paidMap[(int)$p['member_id']] = (float)$p['amount'];

      // raggruppa per membro
      $byMember = [];
      foreach ($orders as $o) {
        $mid = (int)$o['member_id'];
        if (!isset($byMember[$mid])) {
          $byMember[$mid] = ['member_id' => $mid, 'name' => $o['member_name'], 'items' => [], 'total' => 0];
        }
        $line = (float)$o['unit_price'] * (int)$o['qty'];
        $byMember[$mid]['items'][] = [
          'id' => (int)$o['id'], 'name' => $o['name'], 'menu_item_id' => $o['menu_item_id'] ? (int)$o['menu_item_id'] : null,
          'unit_price' => (float)$o['unit_price'], 'qty' => (int)$o['qty'], 'line_total' => $line,
        ];
        $byMember[$mid]['total'] += $line;
      }
      foreach ($byMember as &$mm) {
        $mm['paid'] = isset($paidMap[$mm['member_id']]);
        $mm['paid_amount'] = $paidMap[$mm['member_id']] ?? 0;
      }
      unset($mm);

      $grand = 0; $collected = 0;
      foreach ($byMember as $mm) { $grand += $mm['total']; if ($mm['paid']) $collected += $mm['total']; }

      json_response([
        'session' => $session,
        'members' => array_values($byMember),
        'grand_total' => round($grand, 2),
        'collected' => round($collected, 2),
        'me_id' => (int)$me['id'],
        'treasurer_id' => (int)(db()->query("SELECT payer_member_id FROM trip WHERE id = 1")->fetch()['payer_member_id'] ?? 1),
      ]);
    }

    case 'dining_order_add': {
      $me = require_member();
      $b = body();
      $sid = (int)($b['session_id'] ?? 0);
      $targetId = (int)($b['member_id'] ?? $me['id']);
      // Non-admin può aggiungere solo per sé stesso
      if ($targetId !== (int)$me['id'] && !$me['is_admin']) json_response(['error' => 'Puoi aggiungere solo i tuoi piatti'], 403);

      $sess = db()->prepare("SELECT * FROM dining_session WHERE id = ? AND trip_id = 1");
      $sess->execute([$sid]);
      $session = $sess->fetch();
      if (!$session) json_response(['error' => 'Tavolata non trovata'], 404);
      if ($session['status'] !== 'open') json_response(['error' => 'Tavolata già chiusa'], 400);

      $items = $b['items'] ?? [];
      if (!$items) json_response(['error' => 'Nessun piatto selezionato'], 400);

      $pdo = db();
      $pdo->beginTransaction();
      try {
        foreach ($items as $it) {
          $qty = max(1, (int)($it['qty'] ?? 1));
          if (!empty($it['menu_item_id'])) {
            $mi = $pdo->prepare("SELECT * FROM menu_item WHERE id = ?");
            $mi->execute([(int)$it['menu_item_id']]);
            $mItem = $mi->fetch();
            if (!$mItem) continue;
            // merge: se già presente la stessa voce per questo membro, incrementa qty
            $ex = $pdo->prepare("SELECT id, qty FROM dining_order WHERE session_id = ? AND member_id = ? AND menu_item_id = ?");
            $ex->execute([$sid, $targetId, (int)$it['menu_item_id']]);
            $row = $ex->fetch();
            if ($row) {
              $up = $pdo->prepare("UPDATE dining_order SET qty = qty + ? WHERE id = ?");
              $up->execute([$qty, $row['id']]);
            } else {
              $ins = $pdo->prepare("INSERT INTO dining_order (session_id, member_id, menu_item_id, name, unit_price, qty) VALUES (?, ?, ?, ?, ?, ?)");
              $ins->execute([$sid, $targetId, (int)$it['menu_item_id'], $mItem['name'], (float)$mItem['price'], $qty]);
            }
          } else {
            // voce libera (fuori menù)
            $name = trim($it['name'] ?? '');
            $price = round((float)($it['price'] ?? 0), 2);
            if ($name === '') continue;
            $ins = $pdo->prepare("INSERT INTO dining_order (session_id, member_id, menu_item_id, name, unit_price, qty) VALUES (?, ?, NULL, ?, ?, ?)");
            $ins->execute([$sid, $targetId, $name, $price, $qty]);
          }
        }
        $pdo->commit();
        json_response(['ok' => true]);
      } catch (Throwable $e) {
        $pdo->rollBack();
        json_response(['error' => $e->getMessage()], 400);
      }
    }

    case 'dining_order_remove': {
      $me = require_member();
      $b = body();
      $oid = (int)($b['id'] ?? 0);
      $stmt = db()->prepare("SELECT o.*, ds.status FROM dining_order o JOIN dining_session ds ON ds.id = o.session_id WHERE o.id = ?");
      $stmt->execute([$oid]);
      $o = $stmt->fetch();
      if (!$o) json_response(['error' => 'not found'], 404);
      if ((int)$o['member_id'] !== (int)$me['id'] && !$me['is_admin']) json_response(['error' => 'Puoi togliere solo i tuoi piatti'], 403);
      if ($o['status'] !== 'open') json_response(['error' => 'Tavolata chiusa'], 400);
      // diminuisci qty o elimina
      if ((int)$o['qty'] > 1) {
        db()->prepare("UPDATE dining_order SET qty = qty - 1 WHERE id = ?")->execute([$oid]);
      } else {
        db()->prepare("DELETE FROM dining_order WHERE id = ?")->execute([$oid]);
      }
      json_response(['ok' => true]);
    }

    case 'dining_paid_toggle': {
      $me = require_member();
      $b = body();
      $sid = (int)($b['session_id'] ?? 0);
      $mid = (int)($b['member_id'] ?? $me['id']);
      $treasurerId = (int)(db()->query("SELECT payer_member_id FROM trip WHERE id = 1")->fetch()['payer_member_id'] ?? 1);
      // Può segnare: sé stesso, oppure il tesoriere/admin per chiunque
      if ($mid !== (int)$me['id'] && !$me['is_admin'] && (int)$me['id'] !== $treasurerId) {
        json_response(['error' => 'Non puoi modificare il pagamento altrui'], 403);
      }
      $ex = db()->prepare("SELECT 1 FROM dining_paid WHERE session_id = ? AND member_id = ?");
      $ex->execute([$sid, $mid]);
      if ($ex->fetch()) {
        db()->prepare("DELETE FROM dining_paid WHERE session_id = ? AND member_id = ?")->execute([$sid, $mid]);
        json_response(['paid' => false]);
      } else {
        $t = db()->prepare("SELECT COALESCE(SUM(unit_price * qty),0) AS t FROM dining_order WHERE session_id = ? AND member_id = ?");
        $t->execute([$sid, $mid]);
        $amt = (float)$t->fetch()['t'];
        db()->prepare("INSERT INTO dining_paid (session_id, member_id, amount) VALUES (?, ?, ?)")->execute([$sid, $mid, $amt]);
        json_response(['paid' => true]);
      }
    }

    case 'dining_session_close': {
      $me = require_member();
      $b = body();
      $id = (int)($b['id'] ?? 0);
      $sess = db()->prepare("SELECT * FROM dining_session WHERE id = ? AND trip_id = 1");
      $sess->execute([$id]);
      $session = $sess->fetch();
      if (!$session) json_response(['error' => 'not found'], 404);
      if (!$me['is_admin'] && (int)$session['created_by_member_id'] !== (int)$me['id']) {
        json_response(['error' => 'Solo chi ha creato la tavolata (o l\'admin) può chiuderla'], 403);
      }
      $status = ($b['reopen'] ?? false) ? 'open' : 'closed';
      db()->prepare("UPDATE dining_session SET status = ? WHERE id = ? AND trip_id = 1")->execute([$status, $id]);
      json_response(['ok' => true, 'status' => $status]);
    }

    case 'dining_session_delete': {
      $me = require_member();
      $b = body();
      $id = (int)($b['id'] ?? 0);
      $sess = db()->prepare("SELECT * FROM dining_session WHERE id = ? AND trip_id = 1");
      $sess->execute([$id]);
      $session = $sess->fetch();
      if (!$session) json_response(['error' => 'not found'], 404);
      if (!$me['is_admin'] && (int)$session['created_by_member_id'] !== (int)$me['id']) {
        json_response(['error' => 'Solo chi ha creato la tavolata (o l\'admin) può eliminarla'], 403);
      }
      $pdo = db();
      $pdo->prepare("DELETE FROM dining_paid WHERE session_id = ?")->execute([$id]);
      $pdo->prepare("DELETE FROM dining_order WHERE session_id = ?")->execute([$id]);
      $pdo->prepare("DELETE FROM dining_session WHERE id = ? AND trip_id = 1")->execute([$id]);
      json_response(['ok' => true]);
    }

    default:
      json_response(['error' => 'Azione sconosciuta: ' . $action], 404);
  }
} catch (Throwable $e) {
  json_response(['error' => $e->getMessage()], 500);
}
