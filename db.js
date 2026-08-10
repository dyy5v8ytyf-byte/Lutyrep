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
// ekPreis = Einkaufspreis (was Wwtec zahlt), vkPreis = Verkaufspreis (was dem Kunden
// im Kostenvoranschlag berechnet wird) - beide getrennt erfassbar.
// Diese 18 Teile haben keine echte Artikelnummer aus dem ERP - sie bekommen daher eine
// "manuelle" ID (M1, M2, ...) statt einer Artikelnummer (siehe Schema-Erklärung unten).
const seedLagerNamen = [
  ["Netzkabel", 24], ["HF-Kabel", 15], ["Erdungskabel", 9],
  ["Steuerungskabel 1", 6], ["Steuerungskabel 2", 3], ["SP/USP 340", 4],
  ["SP640V2", 2], ["Al-Koffer", 12], ["Schallkopf Typ A", 3],
  ["Schallkopf Typ B", 1], ["Schallkopf Typ C", 5], ["Sonotrode Standard", 7],
  ["Sonotrode Spezial", 2], ["Netzteil intern", 5], ["Steuerplatine", 2],
  ["Sicherung 2A", 40], ["Gehäusedeckel", 6], ["Reset-Taster", 8]
];

// ---- Lagerbestand-Schema (Version 2) ----
// Jedes Ersatzteil hat eine eindeutige interne ID:
// - Artikel aus einem ERP-/CSV-Import mit Artikelnummer: id = Artikelnummer (z. B. "01/0019")
// - Manuell angelegte Artikel ohne Artikelnummer: id = "M" + laufende Nummer
// Grund: Der reine Name (Bezeichnung/Kurzbezeichnung) ist NICHT eindeutig genug - im echten
// Ersatzteilkatalog kommen viele Kurzbezeichnungen mehrfach vor (baugleiche Teile
// unterschiedlicher Hersteller). Ein Import, der nur nach Namen matcht, würde solche
// Artikel gegenseitig überschreiben. Die Artikelnummer ist dagegen (fast) immer eindeutig.
function defaultData() {
  const lager = {};
  let nextManualLagerId = 1;
  seedLagerNamen.forEach(([name, bestand]) => {
    const id = 'M' + (nextManualLagerId++);
    lager[id] = { id, nummer: null, name, bestand, ekPreis: null, vkPreis: null };
  });
  const memory = {};
  MEMORY_KATEGORIEN.forEach(k => { memory[k] = []; });
  return { mitarbeiter: [], lager, lagerSchemaVersion: 2, nextManualLagerId, memory, auftraege: [], nextAuftragId: 1 };
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
// Migration: ältere Datendateien kennen "vkPreis" noch nicht - Feld nachrüsten
Object.values(data.lager).forEach(entry => { if (entry && !('vkPreis' in entry)) entry.vkPreis = null; });
// Migration auf Schema Version 2: altes Lager war direkt nach Bezeichnung (Name) verschlüsselt
// ({ "Netzkabel": {bestand,ekPreis,vkPreis} }). Da Namen nicht eindeutig genug sind (siehe
// oben), wird jedem Eintrag jetzt eine stabile ID zugewiesen - alle vorhandenen Werte
// (Bestand, Preise) bleiben dabei unverändert erhalten, es ändert sich nur der Schlüssel.
let lagerMigriert = false;
if (!data.lagerSchemaVersion || data.lagerSchemaVersion < 2) {
  const altesLager = data.lager;
  const neuesLager = {};
  let nextManualLagerId = data.nextManualLagerId || 1;
  Object.entries(altesLager).forEach(([key, v]) => {
    if (v && typeof v === 'object' && v.id) {
      // bereits im neuen Schema (z. B. schon migrierter Eintrag) - unverändert übernehmen
      neuesLager[v.id] = v;
    } else {
      const id = 'M' + (nextManualLagerId++);
      neuesLager[id] = { id, nummer: null, name: key, bestand: (v && v.bestand) || 0, ekPreis: (v && v.ekPreis) ?? null, vkPreis: (v && v.vkPreis) ?? null };
    }
  });
  data.lager = neuesLager;
  data.nextManualLagerId = nextManualLagerId;
  data.lagerSchemaVersion = 2;
  lagerMigriert = true;
}
data.nextManualLagerId = data.nextManualLagerId || 1;
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
// beim allerersten Start (neue Datei) direkt sichern, damit die Seed-Werte auf Platte liegen -
// ebenso sofort sichern, wenn oben eine Schema-Migration stattgefunden hat, damit die neue
// Struktur auch wirklich auf der Platte ankommt und nicht bei jedem Neustart erneut nur im
// Arbeitsspeicher migriert wird.
if (!fs.existsSync(DATA_FILE) || lagerMigriert) persist();

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
  // Schema Version 2 (siehe oben): jeder Eintrag hat eine eindeutige ID (id), zusätzlich zum
  // Namen (name) und einer optionalen Artikelnummer (nummer, aus ERP-Importen).
  getLager() {
    const out = {};
    Object.keys(data.lager).sort((a, b) => (data.lager[a].name || '').localeCompare(data.lager[b].name || '', 'de', { sensitivity: 'base' })).forEach(id => {
      out[id] = { ...data.lager[id] };
    });
    return out;
  },
  // Neuen Artikel manuell anlegen (z. B. über "+ Hinzufügen" in lager.html oder beim
  // Hinzufügen eines noch unbekannten Ersatzteils in einem Auftrag). Ohne Artikelnummer
  // bekommt der Eintrag eine automatisch vergebene "M<n>"-ID.
  addLager(name, bestand, ekPreis, vkPreis, nummer) {
    const trimmedNummer = (nummer ? String(nummer).trim() : '') || null;
    const id = trimmedNummer || ('M' + (data.nextManualLagerId++));
    data.lager[id] = {
      id,
      nummer: trimmedNummer,
      name: (name || id).trim(),
      bestand: (bestand === undefined || bestand === null || isNaN(Number(bestand))) ? 0 : Number(bestand),
      ekPreis: (ekPreis === undefined || ekPreis === null || ekPreis === '') ? null : Number(ekPreis),
      vkPreis: (vkPreis === undefined || vkPreis === null || vkPreis === '') ? null : Number(vkPreis)
    };
    persist();
    return { ...data.lager[id] };
  },
  putLager(id, bestand, ekPreis, vkPreis) {
    const current = data.lager[id];
    if (!current) return null;
    const newBestand = (bestand === undefined || bestand === null) ? current.bestand : bestand;
    const newEkPreis = (ekPreis === undefined || ekPreis === null) ? current.ekPreis : ekPreis;
    const newVkPreis = (vkPreis === undefined || vkPreis === null) ? current.vkPreis : vkPreis;
    data.lager[id] = { ...current, bestand: newBestand, ekPreis: newEkPreis, vkPreis: newVkPreis };
    persist();
    return { ...data.lager[id] };
  },
  // Ersatzteil-/Preisimport aus CSV (siehe lager.html): bewusst NUR ergänzend/aktualisierend,
  // niemals überschreibend im Sinne von "alles löschen und neu anlegen" - damit ein Import
  // niemals versehentlich vorhandene Lagerdaten verliert.
  // - Zeile MIT Artikelnummer: die Artikelnummer ist die eindeutige ID.
  //   - Existiert die ID schon: Bezeichnung wird aktualisiert (ERP ist hier führend), aber
  //     NUR EK-/VK-Preis werden aus der Datei übernommen - der live gepflegte Lagerbestand
  //     bleibt unangetastet (Nutzerentscheidung, um zu verhindern, dass ein reiner
  //     Preis-Import den aktuellen Bestand überschreibt).
  //   - Existiert die ID noch nicht: neuer Artikel, mit Bestand aus der Datei (falls
  //     angegeben, sonst 0) und den Preisen.
  // - Zeile OHNE Artikelnummer (z. B. einfaches Bezeichnung/Bestand/EK/VK-Format ohne
  //   Nummer-Spalte): wie bisher per Name gematcht, aber NUR gegen andere Artikel ohne
  //   eigene Artikelnummer - damit ein Namens-Treffer nicht versehentlich einen ERP-Artikel
  //   mit eigener Artikelnummer überschreibt.
  importLager(rows) {
    const result = { neu: [], aktualisiert: [], fehler: [] };
    if (!Array.isArray(rows)) return result;
    let changed = false;
    const nameIndex = new Map();
    Object.values(data.lager).forEach(e => { if (!e.nummer) nameIndex.set(e.name, e.id); });

    rows.forEach(r => {
      const name = (r && r.name ? String(r.name) : '').trim();
      const nummer = (r && r.nummer ? String(r.nummer) : '').trim() || null;
      if (!name && !nummer) { result.fehler.push('Zeile ohne Bezeichnung/Artikelnummer übersprungen'); return; }
      const ekPreis = (r.ekPreis === undefined || r.ekPreis === null || r.ekPreis === '') ? null : Number(r.ekPreis);
      const vkPreis = (r.vkPreis === undefined || r.vkPreis === null || r.vkPreis === '') ? null : Number(r.vkPreis);
      if ((ekPreis !== null && isNaN(ekPreis)) || (vkPreis !== null && isNaN(vkPreis))) {
        result.fehler.push((name || nummer) + ': ungültiger Preis');
        return;
      }
      const label = name || nummer;

      let id = nummer || nameIndex.get(name) || null;
      if (id && data.lager[id]) {
        if (name) data.lager[id].name = name;
        if (ekPreis !== null) data.lager[id].ekPreis = ekPreis;
        if (vkPreis !== null) data.lager[id].vkPreis = vkPreis;
        result.aktualisiert.push(label);
        changed = true;
      } else {
        const bRaw = (r.bestand === undefined || r.bestand === null || r.bestand === '') ? 0 : Number(r.bestand);
        const bestand = isNaN(bRaw) ? 0 : bRaw;
        const newId = nummer || ('M' + (data.nextManualLagerId++));
        data.lager[newId] = { id: newId, nummer, name: name || newId, bestand, ekPreis, vkPreis };
        if (!nummer) nameIndex.set(data.lager[newId].name, newId);
        result.neu.push(label);
        changed = true;
      }
    });
    if (changed) persist();
    return result;
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
