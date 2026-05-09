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
      require_member();
      $rows = db()->query("SELECT id, name, avatar, budget, budget_paid, is_admin FROM member WHERE trip_id = 1 ORDER BY id")->fetchAll();
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
      require_member();
      $rows = db()->query("
        SELECT e.*, m.name as paid_by_name
        FROM expense e
        LEFT JOIN member m ON m.id = e.paid_by_member_id
        WHERE e.trip_id = 1
        ORDER BY datetime(e.occurred_at) DESC, e.id DESC
      ")->fetchAll();
      // attach shares
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
      json_response(['expenses' => $rows]);
    }

    case 'expense_create': {
      $me = require_member();
      $b = body();
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

    case 'expense_delete': {
      $me = require_member();
      $b = body();
      $id = (int)($b['id'] ?? 0);
      $stmt = db()->prepare("SELECT * FROM expense WHERE id = ? AND trip_id = 1");
      $stmt->execute([$id]);
      $e = $stmt->fetch();
      if (!$e) json_response(['error' => 'not found'], 404);
      if (!$me['is_admin'] && (int)$e['created_by_member_id'] !== (int)$me['id']) {
        json_response(['error' => 'forbidden'], 403);
      }
      $stmt = db()->prepare("DELETE FROM expense WHERE id = ?");
      $stmt->execute([$id]);
      json_response(['ok' => true]);
    }

    // ---------------- SETTLEMENTS ----------------
    case 'settlements': {
      require_member();
      $rows = db()->query("
        SELECT s.*, mf.name as from_name, mt.name as to_name
        FROM settlement s
        JOIN member mf ON mf.id = s.from_member_id
        JOIN member mt ON mt.id = s.to_member_id
        WHERE s.trip_id = 1
        ORDER BY datetime(s.created_at) DESC
      ")->fetchAll();
      json_response(['settlements' => $rows]);
    }

    case 'settlement_create': {
      require_member();
      $b = body();
      $stmt = db()->prepare("INSERT INTO settlement (trip_id, from_member_id, to_member_id, amount, category, note) VALUES (1, ?, ?, ?, ?, ?)");
      $stmt->execute([
        (int)($b['from_member_id'] ?? 0),
        (int)($b['to_member_id'] ?? 0),
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
      require_member();
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

      json_response([
        'trip' => $trip,
        'members' => array_values($perMember),
        'by_category' => $byCat,
        'total_spent' => $totalSpent,
        'suggestions' => $suggestions,
      ]);
    }

    default:
      json_response(['error' => 'Azione sconosciuta: ' . $action], 404);
  }
} catch (Throwable $e) {
  json_response(['error' => $e->getMessage()], 500);
}
