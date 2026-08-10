// server.js – Lutyrep: gemeinsam genutzte Reparatur-Auftragsverwaltung (Wwtec)
// Ein Server, eine Datenbank -> alle Nutzer im Netzwerk sehen denselben, aktuellen Stand.

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Einfacher Passwortschutz (HTTP Basic Auth) für die gesamte App ----------
// Schützt jede Seite und jede API-Route, inkl. statischer Dateien. Zugangsdaten über
// Umgebungsvariablen LUTYREP_USER / LUTYREP_PASS konfigurierbar (bei Cloud-Hosting z. B.
// auf Railway gesetzt). Ohne gesetzte Variablen gilt ein Standard-Login (siehe Warnung
// unten) - bitte bei Erstinbetriebnahme unbedingt ändern, sonst kennt jeder das Passwort,
// der diesen Code irgendwo sieht.
const LUTYREP_USER = process.env.LUTYREP_USER || 'wwtec';
const LUTYREP_PASS = process.env.LUTYREP_PASS || 'wwtec2026';
if (!process.env.LUTYREP_USER || !process.env.LUTYREP_PASS) {
  console.warn('WARNUNG: LUTYREP_USER/LUTYREP_PASS nicht per Umgebungsvariable gesetzt - Standard-Zugangsdaten aktiv (Benutzername "wwtec"). Bitte ändern!');
}
function sicherVergleichen(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
app.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  const [scheme, encoded] = auth.split(' ');
  if (scheme === 'Basic' && encoded) {
    let decoded = '';
    try { decoded = Buffer.from(encoded, 'base64').toString('utf8'); } catch (_) {}
    const sepIdx = decoded.indexOf(':');
    if (sepIdx !== -1) {
      const user = decoded.slice(0, sepIdx);
      const pass = decoded.slice(sepIdx + 1);
      if (sicherVergleichen(user, LUTYREP_USER) && sicherVergleichen(pass, LUTYREP_PASS)) {
        return next();
      }
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="Lutyrep", charset="UTF-8"');
  res.status(401).send('Zugang verweigert. Bitte Benutzername und Passwort eingeben.');
});

// Limit hochgesetzt (Standard bei Express ist nur 100kb): Aufträge mit Fotos
// (Wareneingang, bis zu 3 Stück als Base64-JPEG) überschreiten 100kb sehr leicht,
// wodurch Speichern/Archivieren sonst mit "413 Payload Too Large" fehlschlägt -
// das war die Ursache dafür, dass abgeschlossene Aufträge mit Fotos nicht im
// Archiv ankamen.
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Mitarbeiter ----------
app.get('/api/mitarbeiter', (req, res) => {
  res.json(db.getMitarbeiter());
});

app.post('/api/mitarbeiter', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name fehlt' });
  res.json(db.addMitarbeiter(name));
});

// ---------- Lager ----------
// Jeder Artikel hat eine eindeutige ID (Artikelnummer aus dem ERP oder "M<n>" für manuell
// angelegte Teile ohne Artikelnummer) - siehe db.js für die Schema-Erklärung.
app.get('/api/lager', (req, res) => {
  res.json(db.getLager());
});

app.post('/api/lager', (req, res) => {
  const { name, bestand, ekPreis, vkPreis, nummer } = req.body;
  if (!name && !nummer) return res.status(400).json({ error: 'name oder nummer fehlt' });
  res.json(db.addLager(name, bestand, ekPreis, vkPreis, nummer));
});

app.put('/api/lager/:id', (req, res) => {
  const { bestand, ekPreis, vkPreis } = req.body;
  const result = db.putLager(req.params.id, bestand, ekPreis, vkPreis);
  if (!result) return res.status(404).json({ error: 'Artikel nicht gefunden' });
  res.json(result);
});

// CSV-Import (Artikel/Preise) aus lager.html - siehe db.importLager für die genaue
// "nicht überschreiben, nur ergänzen/Preise aktualisieren"-Logik.
app.post('/api/lager/import', (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  res.json(db.importLager(rows));
});

// ---------- Memory (Fehlerbeschreibungen, Komponenten, Arbeitszeiten) ----------
app.get('/api/memory', (req, res) => {
  res.json(db.getMemory());
});

app.post('/api/memory', (req, res) => {
  const kategorie = req.body.kategorie;
  const wert = String(req.body.wert ?? '').trim();
  if (!kategorie || !wert || !db.MEMORY_KATEGORIEN.includes(kategorie)) {
    return res.status(400).json({ error: 'kategorie/wert ungültig' });
  }
  db.addMemory(kategorie, wert);
  res.json({ ok: true });
});

// ---------- Aufträge ----------
app.get('/api/auftraege', (req, res) => {
  res.json(db.listAuftraege());
});

app.get('/api/auftraege/:id', (req, res) => {
  const row = db.getAuftrag(req.params.id);
  if (!row) return res.status(404).json({ error: 'nicht gefunden' });
  res.json(row);
});

app.post('/api/auftraege', (req, res) => {
  const id = db.createAuftrag(req.body.daten || {});
  res.json({ id });
});

app.put('/api/auftraege/:id', (req, res) => {
  const ok = db.updateAuftrag(req.params.id, req.body);
  if (!ok) return res.status(404).json({ error: 'nicht gefunden' });
  res.json({ ok: true });
});

app.delete('/api/auftraege/:id', (req, res) => {
  db.deleteAuftrag(req.params.id);
  res.json({ ok: true });
});

// ---------- Archiv (abgeschlossene, gedruckte Checklisten – nach Seriennummer auffindbar) ----------
app.get('/api/archiv', (req, res) => {
  res.json(db.listArchiv());
});

app.get('/api/archiv/:id', (req, res) => {
  const row = db.getArchivEintrag(req.params.id);
  if (!row) return res.status(404).json({ error: 'nicht gefunden' });
  res.json(row);
});

app.post('/api/archiv', (req, res) => {
  const entry = db.addArchiv(req.body || {});
  res.json({ ok: true, id: entry.id });
});

app.listen(PORT, () => {
  console.log(`Lutyrep läuft auf http://localhost:${PORT}`);
});
