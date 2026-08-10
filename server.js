// server.js – Lutyrep: gemeinsam genutzte Reparatur-Auftragsverwaltung (Wwtec)
// Ein Server, eine Datenbank -> alle Nutzer im Netzwerk sehen denselben, aktuellen Stand.

const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
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
app.get('/api/lager', (req, res) => {
  res.json(db.getLager());
});

app.put('/api/lager/:name', (req, res) => {
  const { bestand, ekPreis } = req.body;
  res.json(db.putLager(req.params.name, bestand, ekPreis));
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
