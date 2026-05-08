# Vacanza App

Gestione spese di gruppo per le vacanze. Stack: PHP + SQLite + PWA mobile-first.

## Avvio locale
```bash
cd ~/vacanza-app
php -S localhost:8105
```
Apri http://localhost:8105

## Persone (8)
Thomas (admin), Syria, Riccardo, Massimo, Mirko, Stefano, Adriana, Michelle.
Per entrare basta toccare il proprio nome — nessun PIN richiesto.

## Funzionalità
- 🍽️ **Ristorante / Bar / Shopping**: ognuno digita la propria quota (cosa ha ordinato)
- ⚖️ **Spese in equa divisione**: taxi, noleggio, escursioni, alloggio…
- ✏️ **Divisione personalizzata**: chi paga quanto liberamente
- 💰 **Budget personale**: ognuno imposta il bonifico inviato a Thomas
- 📊 **Riepiloghi**: per persona, per categoria, totali gruppo
- 💳 **Saldi**: suggerimenti automatici di chi deve quanto a chi
- 👥 **Gestione persone**: aggiungi/modifica membri (solo admin)

## Deploy su Hostinger
1. Crea un database MySQL da hPanel (Databases → Management) e annota nome/user/pass.
2. In hPanel → Advanced → Git, collega questo repo (branch `main`) alla cartella `public_html`.
3. Apri **File Manager** → nella cartella del sito carica un file `secrets.php` con le credenziali reali (vedi `secrets.example.php` per il formato). Questo file NON è nel repo, quindi i deploy successivi non lo sovrascrivono.
4. Apri il sito → al primo accesso lo schema viene creato e i membri seed inseriti automaticamente.
5. `.htaccess` blocca file DB, forza HTTPS e gestisce DirectoryIndex.

**Locale**: lascia `config.local.php` o niente → usa SQLite per dev.
**Produzione**: `secrets.php` (gitignored) con credenziali MySQL Hostinger.

PHP richiesto: ≥ 7.4 con `pdo_mysql` (locale: anche `pdo_sqlite`).
