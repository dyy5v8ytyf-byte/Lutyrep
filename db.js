// db.js – Datenspeicher für Lutyrep (Wwtec Reparatur-Auftragsverwaltung)
// Alle Daten liegen in EINER Datei (data/lutyrep.json) auf dem Server.
// Jeder Nutzer, der die Web-Oberfläche öffnet, greift auf dieselbe Datenbank zu
// -> das ist der Mechanismus für "immer aktuell, egal welcher Nutzer".
//
// Bewusst als reine JSON-Datei (kein natives Zusatzmodul wie better-sqlite3):
// so läuft Lutyrep mit jedem mitgelieferten Node.js-Programm ohne Kompilieren/
// Installieren, auch als fertiges "nur Start drücken"-Programm auf Mac/Windows.

const path = require('path');
const fs = require('fs');

// DATA_DIR per Umgebungsvariable überschreibbar (wichtig für Cloud-Hosting wie
// Railway: dort soll die Datei auf einem dauerhaften "Volume" liegen, z. B.
// gemountet unter /data, statt im flüchtigen Programm-Ordner, der bei jedem
// Deploy neu aufgebaut wird).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA_FILE = path.join(DATA_DIR, 'lutyrep.json');

const MEMORY_KATEGORIEN = ['fehler_kunde', 'fehler_techniker', 'fehlerbild_ruecklauf', 'komponenten_eingang', 'austausch_komponenten', 'arbeitszeiten'];

// Seed: Lagerbestand aus Lagerabgleich_Ersatzteile.xlsx (nur beim allerersten Start)
const seedLager = {
  "Netzkabel":            { bestand:24, ekPreis:null },
  "HF-Kabel":             { bestand:15, ekPreis:null },
  "Erdungskabel":         { bestand:9,  ekPreis:null },
  "Steuerungskabel 1":    { bestand:6,  ekPreis:null },
  "Steuerungskabel 2":    { bestand:3,  ekPreis:null },
  "SP/USP 340":           { bestand:4,  ekPreis:null },
  "SP640V2":              { bestand:2,  ekPreis:null },
  "Al-Koffer":            { bestand:12, ekPreis:null },
  "Schallkopf Typ A":     { bestand:3,  ekPreis:null },
  "Schallkopf Typ B":     { bestand:1,  ekPreis:null },
  "Schallkopf Typ C":     { bestand:5,  ekPreis:null },
  "Sonotrode Standard":   { bestand:7,  ekPreis:null },
  "Sonotrode Spezial":    { bestand:2,  ekPreis:null },
  "Netzteil intern":      { bestand:5,  ekPreis:null },
  "Steuerplatine":        { bestand:2,  ekPreis:null },
  "Sicherung 2A":         { bestand:40, ekPreis:null },
  "Gehäusedeckel":        { bestand:6,  ekPreis:null },
  "Reset-Taster":         { bestand:8,  ekPreis:null }
};

function defaultData() {
  const lager = {};
  Object.entries(seedLager).forEach(([name, v]) => { lager[name] = { bestand: v.bestand, ekPreis: v.ekPreis }; });
  const memory = {};
  MEMORY_KATEGORIEN.forEach(k => { memory[k] = []; });
  return { mitarbeiter: [], lager, memory, auftraege: [], nextAuftragId: 1 };
}

let data;
if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('[Lutyrep] Datenbankdatei beschädigt, sichere sie und starte neu:', e.message);
    try { fs.copyFileSync(DATA_FILE, DATA_FILE + '.beschaedigt-' + Date.now() + '.bak'); } catch (_) {}
    data = defaultData();
  }
} else {
  data = defaultData();
}

// Robustheit gegen ältere/unvollständige Datendateien
data.mitarbeiter = Array.isArray(data.mitarbeiter) ? data.mitarbeiter : [];
data.lager = data.lager && typeof data.lager === 'object' ? data.lager : {};
data.memory = data.memory && typeof data.memory === 'object' ? data.memory : {};
MEMORY_KATEGORIEN.forEach(k => { if (!Array.isArray(data.memory[k])) data.memory[k] = []; });
data.auftraege = Array.isArray(data.auftraege) ? data.auftraege : [];
data.nextAuftragId = data.nextAuftragId || (data.auftraege.reduce((m, a) => Math.max(m, a.id || 0), 0) + 1);
data.archiv = Array.isArray(data.archiv) ? data.archiv : [];
data.nextArchivId = data.nextArchivId || (data.archiv.reduce((m, a) => Math.max(m, a.id || 0), 0) + 1);

function persist() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}
// beim allerersten Start (neue Datei) direkt sichern, damit die Seed-Werte auf Platte liegen
if (!fs.existsSync(DATA_FILE)) persist();

module.exports = {
  // ---- Mitarbeiter ----
  getMitarbeiter() {
    return [...data.mitarbeiter].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
  },
  addMitarbeiter(name) {
    if (name && !data.mitarbeiter.some(n => n.toLowerCase() === name.toLowerCase())) {
      data.mitarbeiter.push(name);
      persist();
    }
    return this.getMitarbeiter();
  },

  // ---- Lager ----
  getLager() {
    const out = {};
    Object.keys(data.lager).sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' })).forEach(name => {
      out[name] = { ...data.lager[name] };
    });
    return out;
  },
  putLager(name, bestand, ekPreis) {
    const current = data.lager[name] || { bestand: 0, ekPreis: null };
    const newBestand = (bestand === undefined || bestand === null) ? current.bestand : bestand;
    const newEkPreis = (ekPreis === undefined || ekPreis === null) ? current.ekPreis : ekPreis;
    data.lager[name] = { bestand: newBestand, ekPreis: newEkPreis };
    persist();
    return { name, ...data.lager[name] };
  },

  // ---- Memory (Fehlerbeschreibungen, Komponenten, Arbeitszeiten) ----
  MEMORY_KATEGORIEN,
  getMemory() {
    const out = {};
    MEMORY_KATEGORIEN.forEach(k => { out[k] = [...data.memory[k]]; });
    out.arbeitszeiten.sort((a, b) => Number(a) - Number(b));
    return out;
  },
  addMemory(kategorie, wert) {
    if (!MEMORY_KATEGORIEN.includes(kategorie)) return;
    if (!data.memory[kategorie].includes(wert)) {
      data.memory[kategorie].push(wert);
      persist();
    }
  },

  // ---- Aufträge ----
  listAuftraege() {
    return [...data.auftraege]
      .sort((a, b) => new Date(b.aktualisiertAm) - new Date(a.aktualisiertAm))
      .map(a => ({ id: a.id, kunde: a.kunde, geraet: a.geraet, serien: a.serien, wawi: a.wawi, status: a.status, erstelltAm: a.erstelltAm, aktualisiertAm: a.aktualisiertAm }));
  },
  getAuftrag(id) {
    const a = data.auftraege.find(x => x.id === Number(id));
    return a ? { ...a } : null;
  },
  createAuftrag(daten) {
    const now = new Date().toISOString();
    const a = { id: data.nextAuftragId++, kunde: '', geraet: '', serien: '', wawi: '', status: 'Neuer Auftrag', erstelltAm: now, aktualisiertAm: now, daten: daten || {} };
    data.auftraege.push(a);
    persist();
    return a.id;
  },
  updateAuftrag(id, fields) {
    const a = data.auftraege.find(x => x.id === Number(id));
    if (!a) return false;
    a.kunde = fields.kunde || '';
    a.geraet = fields.geraet || '';
    a.serien = fields.serien || '';
    a.wawi = fields.wawi || '';
    a.status = fields.status || 'Neuer Auftrag';
    a.daten = fields.daten || {};
    a.aktualisiertAm = new Date().toISOString();
    persist();
    return true;
  },
  deleteAuftrag(id) {
    const idx = data.auftraege.findIndex(x => x.id === Number(id));
    if (idx >= 0) { data.auftraege.splice(idx, 1); persist(); }
  },

  // ---- Archiv (abgeschlossene, gedruckte Checklisten – nach Seriennummer auffindbar) ----
  addArchiv(entry) {
    const a = {
      id: data.nextArchivId++,
      auftragId: entry.auftragId ?? null,
      serien: (entry.serien || '').trim(),
      kunde: entry.kunde || '',
      geraet: entry.geraet || '',
      wawi: entry.wawi || '',
      status: entry.status || '',
      daten: entry.daten || {},
      archiviertAm: new Date().toISOString()
    };
    data.archiv.push(a);
    persist();
    return a;
  },
  listArchiv() {
    return [...data.archiv]
      .sort((a, b) => new Date(b.archiviertAm) - new Date(a.archiviertAm))
      .map(a => ({ id: a.id, auftragId: a.auftragId, serien: a.serien, kunde: a.kunde, geraet: a.geraet, wawi: a.wawi, status: a.status, archiviertAm: a.archiviertAm }));
  },
  getArchivEintrag(id) {
    const a = data.archiv.find(x => x.id === Number(id));
    return a ? { ...a } : null;
  }
};
