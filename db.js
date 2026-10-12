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

// ---- Automatische Sicherungskopie bei jedem Programmstart ----
// Bevor irgendeine Migration läuft, wird die vorhandene Datenbankdatei unverändert nach
// DATA_DIR/backups/ kopiert. So ist nach jedem Update (neuer Code) der Stand von vorher
// jederzeit wiederherstellbar. Platzschutz (Railway-Volume ist begrenzt, Aufträge mit Fotos
// machen die Datei groß): max. 10 Sicherungen und zusammen höchstens 150 MB - die jeweils
// neueste bleibt immer erhalten. Ist die Datei seit der letzten Sicherung unverändert
// (z. B. reiner Neustart), wird keine weitere Kopie angelegt.
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUPS_BEHALTEN = 10;
const BACKUPS_MAX_BYTES = 150 * 1024 * 1024;
function sicherungAnlegen() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const vorhandene = () => fs.readdirSync(BACKUP_DIR).filter(f => /^lutyrep-.*\.json$/.test(f)).sort();
    const letzte = vorhandene().pop();
    if (letzte) {
      const a = fs.readFileSync(DATA_FILE);
      const b = fs.readFileSync(path.join(BACKUP_DIR, letzte));
      if (a.equals(b)) return;
    }
    const stempel = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, 'lutyrep-' + stempel + '.json'));
    let alle = vorhandene();
    // nach Anzahl kürzen
    alle.slice(0, Math.max(0, alle.length - BACKUPS_BEHALTEN)).forEach(f => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (_) {}
    });
    // nach Gesamtgröße kürzen (älteste zuerst, neueste bleibt immer)
    alle = vorhandene();
    let summe = alle.reduce((s, f) => s + fs.statSync(path.join(BACKUP_DIR, f)).size, 0);
    while (summe > BACKUPS_MAX_BYTES && alle.length > 1) {
      const f = alle.shift();
      summe -= fs.statSync(path.join(BACKUP_DIR, f)).size;
      try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (_) {}
    }
  } catch (e) {
    console.error('[Lutyrep] Sicherungskopie konnte nicht angelegt werden:', e.message);
  }
}
sicherungAnlegen();

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
// Update 10/2026 (nur ergänzend, bestehende Werte bleiben unverändert):
// - Papierkorb für gelöschte Aufträge (statt endgültigem Löschen)
// - Mindestbestand je Artikel (für "Bestellbedarf"); null = keine Überwachung
data.papierkorb = Array.isArray(data.papierkorb) ? data.papierkorb : [];
// Einstellungen (vorbereitet für Fehlerbild-/Mustererkennung): Messgrößen und Fehler-
// kategorien werden bewusst LEER ausgeliefert und von wwtec selbst gepflegt. Einträge werden
// nie gelöscht, nur deaktiviert - damit alte Aufträge ihre Werte/Namen behalten.
data.config = data.config && typeof data.config === 'object' ? data.config : {};
if (!Array.isArray(data.config.messgroessen)) data.config.messgroessen = [];
if (!Array.isArray(data.config.fehlerkategorien)) data.config.fehlerkategorien = [];
data.config.nextId = data.config.nextId || 1;
// Stundensatz (netto, €/Std.) für den Kostenvoranschlag - bisher fest 120 im Programm
if (typeof data.config.stundensatz !== 'number' || !(data.config.stundensatz > 0)) data.config.stundensatz = 120;
// Lagerjournal: jede Bestandsbuchung aus einem Auftrag wird protokolliert (wer/wann/warum)
data.lagerbewegungen = Array.isArray(data.lagerbewegungen) ? data.lagerbewegungen : [];
Object.values(data.lager).forEach(entry => { if (entry && !('mindestbestand' in entry)) entry.mindestbestand = null; });

// Ein Auftrag gilt als "leer", wenn noch keinerlei Kopfdaten, Texte oder Fotos erfasst wurden
// (typisch: "+ Neuer Auftrag" geklickt und dann abgebrochen).
function istLeererAuftrag(a) {
  if ((a.kunde || '').trim() || (a.geraet || '').trim() || (a.serien || '').trim() || (a.wawi || '').trim()) return false;
  if (a.status && a.status !== 'Neuer Auftrag') return false;
  const d = a.daten || {};
  if (Array.isArray(d.fotos) && d.fotos.length) return false;
  if (Array.isArray(d.defektFotos) && d.defektFotos.length) return false;
  if (Array.isArray(d.ersatzteile) && d.ersatzteile.length) return false;
  if (d.texts && Object.values(d.texts).some(t => String(t || '').trim())) return false;
  return true;
}
const LEER_AUFRAEUMEN_NACH_MS = 24 * 60 * 60 * 1000;

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
      vkPreis: (vkPreis === undefined || vkPreis === null || vkPreis === '') ? null : Number(vkPreis),
      mindestbestand: null
    };
    persist();
    return { ...data.lager[id] };
  },
  // mindestbestand: undefined = unverändert lassen, null = Überwachung aus, Zahl = setzen
  putLager(id, bestand, ekPreis, vkPreis, mindestbestand) {
    const current = data.lager[id];
    if (!current) return null;
    const newBestand = (bestand === undefined || bestand === null) ? current.bestand : bestand;
    const newEkPreis = (ekPreis === undefined || ekPreis === null) ? current.ekPreis : ekPreis;
    const newVkPreis = (vkPreis === undefined || vkPreis === null) ? current.vkPreis : vkPreis;
    let newMin = current.mindestbestand ?? null;
    if (mindestbestand !== undefined) newMin = (mindestbestand === null || mindestbestand === '' || isNaN(Number(mindestbestand))) ? null : Number(mindestbestand);
    data.lager[id] = { ...current, bestand: newBestand, ekPreis: newEkPreis, vkPreis: newVkPreis, mindestbestand: newMin };
    // Manuelle Bestandskorrektur (Lagerseite / Inventur) ebenfalls im Lagerjournal festhalten
    if (Number(newBestand) !== Number(current.bestand)) {
      data.lagerbewegungen.push({
        zeit: new Date().toISOString(), artikelId: id, name: current.name,
        vorher: Number(current.bestand) || 0, nachher: Number(newBestand) || 0,
        angefordert: (Number(newBestand) || 0) - (Number(current.bestand) || 0),
        gebucht: (Number(newBestand) || 0) - (Number(current.bestand) || 0), fehlmenge: 0,
        auftragId: null, grund: 'Manuelle Korrektur (Bestand direkt gesetzt)'
      });
    }
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
        // Mindestbestand nur übernehmen, wenn in der Datei angegeben (Ist-Bestand bleibt unberührt)
        if (r.mindestbestand !== undefined && r.mindestbestand !== null && r.mindestbestand !== '' && !isNaN(Number(r.mindestbestand))) data.lager[id].mindestbestand = Number(r.mindestbestand);
        result.aktualisiert.push(label);
        changed = true;
      } else {
        const bRaw = (r.bestand === undefined || r.bestand === null || r.bestand === '') ? 0 : Number(r.bestand);
        const bestand = isNaN(bRaw) ? 0 : bRaw;
        const newId = nummer || ('M' + (data.nextManualLagerId++));
        const minRaw = (r.mindestbestand === undefined || r.mindestbestand === null || r.mindestbestand === '') ? null : Number(r.mindestbestand);
        data.lager[newId] = { id: newId, nummer, name: name || newId, bestand, ekPreis, vkPreis, mindestbestand: (minRaw === null || isNaN(minRaw)) ? null : minRaw };
        if (!nummer) nameIndex.set(data.lager[newId].name, newId);
        result.neu.push(label);
        changed = true;
      }
    });
    if (changed) persist();
    return result;
  },

  // Bestellbedarf: alle Artikel mit gesetztem Mindestbestand, deren Ist-Bestand den
  // Mindestbestand erreicht oder unterschritten hat. Artikel ohne Mindestbestand (z. B. die
  // große Masse aus dem ERP-Import) werden bewusst nicht gemeldet.
  // Zusätzlich zählen Reservierungen: Ersatzteile, die in offenen Aufträgen eingeplant, aber
  // noch nicht verbaut/abgebucht sind (gebucht === false). Reicht der Bestand dafür nicht,
  // ist das Teil Bestellbedarf - unabhängig davon, ob ein Mindestbestand gepflegt ist.
  getReservierungen() {
    const res = {};
    data.auftraege.forEach(a => {
      const teile = (a.daten && Array.isArray(a.daten.ersatzteile)) ? a.daten.ersatzteile : [];
      teile.forEach(p => {
        if (p && p.id && p.gebucht === false) {
          res[p.id] = res[p.id] || { menge: 0, auftraege: [], jeAuftrag: {} };
          res[p.id].menge += Number(p.qty) || 0;
          res[p.id].jeAuftrag[a.id] = (res[p.id].jeAuftrag[a.id] || 0) + (Number(p.qty) || 0);
          if (!res[p.id].auftraege.includes(a.id)) res[p.id].auftraege.push(a.id);
        }
      });
    });
    return res;
  },
  getBestellbedarf() {
    const res = this.getReservierungen();
    return Object.values(data.lager)
      .map(e => {
        if (!e) return null;
        const bestand = Number(e.bestand) || 0;
        const reserviert = res[e.id] ? res[e.id].menge : 0;
        const verfuegbar = bestand - reserviert;
        const hatMin = e.mindestbestand !== null && e.mindestbestand !== undefined;
        const unterMin = hatMin && verfuegbar <= Number(e.mindestbestand);
        const fehltFuerAuftraege = reserviert > bestand;
        if (!unterMin && !fehltFuerAuftraege) return null;
        const ziel = hatMin ? Number(e.mindestbestand) : 0;
        return {
          id: e.id, nummer: e.nummer, name: e.name, bestand, reserviert, verfuegbar,
          mindestbestand: hatMin ? e.mindestbestand : null,
          fehlmenge: Math.max(0, ziel - verfuegbar, reserviert - bestand),
          grund: fehltFuerAuftraege ? 'fehlt für Aufträge' : 'unter Mindestbestand',
          auftraege: res[e.id] ? res[e.id].auftraege : []
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' }));
  },
  // Bestandsbuchung als Differenz (z. B. -2 = Entnahme, +1 = Rückbuchung). Wird auf dem
  // Server gerechnet statt einen absoluten Wert vom Browser zu übernehmen - so überschreiben
  // sich zwei gleichzeitig arbeitende Nutzer nicht gegenseitig. Bestand fällt nie unter 0;
  // was fehlte, wird als "fehlmenge" zurückgemeldet und im Journal vermerkt.
  bucheLager(id, delta, info) {
    const e = data.lager[id];
    if (!e) return null;
    const d = Number(delta) || 0;
    const vorher = Number(e.bestand) || 0;
    const nachher = Math.max(0, vorher + d);
    const fehlmenge = (vorher + d) < 0 ? -(vorher + d) : 0;
    e.bestand = nachher;
    data.lagerbewegungen.push({
      zeit: new Date().toISOString(), artikelId: id, name: e.name, vorher, nachher,
      angefordert: d, gebucht: nachher - vorher, fehlmenge,
      auftragId: info && info.auftragId != null ? Number(info.auftragId) : null,
      grund: (info && info.grund) ? String(info.grund).slice(0, 200) : ''
    });
    persist();
    return { ...e, fehlmenge };
  },
  getLagerbewegungen(artikelId) {
    const liste = artikelId ? data.lagerbewegungen.filter(b => b.artikelId === artikelId) : data.lagerbewegungen;
    return liste.slice(-500).reverse();
  },

  // ---- Einstellungen: Messgrößen / Fehlerkategorien ----
  getConfig() {
    return { messgroessen: data.config.messgroessen.map(x => ({ ...x })), fehlerkategorien: data.config.fehlerkategorien.map(x => ({ ...x })), stundensatz: data.config.stundensatz };
  },
  setStundensatz(wert) {
    const w = Number(wert);
    if (!(w > 0) || w > 10000) return false;
    data.config.stundensatz = Math.round(w * 100) / 100;
    persist();
    return true;
  },
  addConfigEintrag(liste, name, einheit) {
    if (!['messgroessen', 'fehlerkategorien'].includes(liste)) return null;
    const n = String(name || '').trim();
    if (!n) return null;
    if (data.config[liste].some(x => x.name.toLowerCase() === n.toLowerCase())) return null;
    const eintrag = { id: (liste === 'messgroessen' ? 'MG' : 'FK') + (data.config.nextId++), name: n, aktiv: true };
    if (liste === 'messgroessen') eintrag.einheit = String(einheit || '').trim();
    data.config[liste].push(eintrag);
    persist();
    return { ...eintrag };
  },
  setConfigAktiv(liste, id, aktiv) {
    if (!['messgroessen', 'fehlerkategorien'].includes(liste)) return false;
    const e = data.config[liste].find(x => x.id === id);
    if (!e) return false;
    e.aktiv = !!aktiv;
    persist();
    return true;
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
    this.leereAuftraegeAufraeumen();
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
  // Löschen = in den Papierkorb verschieben (Grundsatz "Daten nie verlieren"). Der komplette
  // Datensatz bleibt erhalten und ist über restoreAuftrag jederzeit wiederherstellbar.
  deleteAuftrag(id, grund) {
    const idx = data.auftraege.findIndex(x => x.id === Number(id));
    if (idx < 0) return false;
    const [a] = data.auftraege.splice(idx, 1);
    data.papierkorb.push({ ...a, geloeschtAm: new Date().toISOString(), loeschGrund: grund || 'manuell gelöscht' });
    persist();
    return true;
  },
  // Vollständige Kopie eines Auftrags in den Papierkorb legen (z. B. vor "Auftrag
  // zurücksetzen"), mit eigener neuer ID - wiederherstellbar als separater Auftrag.
  sichereAuftragKopie(id, grund) {
    const a = data.auftraege.find(x => x.id === Number(id));
    if (!a) return null;
    const kopie = JSON.parse(JSON.stringify(a));
    kopie.id = data.nextAuftragId++;
    kopie.kopieVon = a.id;
    kopie.geloeschtAm = new Date().toISOString();
    kopie.loeschGrund = grund || ('Sicherung von Auftrag ' + a.id);
    data.papierkorb.push(kopie);
    persist();
    return kopie.id;
  },
  listPapierkorb() {
    return [...data.papierkorb]
      .sort((a, b) => new Date(b.geloeschtAm) - new Date(a.geloeschtAm))
      .map(a => ({ id: a.id, kunde: a.kunde, geraet: a.geraet, serien: a.serien, wawi: a.wawi, status: a.status, geloeschtAm: a.geloeschtAm, loeschGrund: a.loeschGrund }));
  },
  restoreAuftrag(id) {
    const idx = data.papierkorb.findIndex(x => x.id === Number(id));
    if (idx < 0) return false;
    const [a] = data.papierkorb.splice(idx, 1);
    delete a.geloeschtAm; delete a.loeschGrund;
    // ID-Kollision ausschließen (sollte nie vorkommen, da IDs nie neu vergeben werden)
    if (data.auftraege.some(x => x.id === a.id)) a.id = data.nextAuftragId++;
    data.auftraege.push(a);
    persist();
    return true;
  },
  // Leere Aufträge (siehe istLeererAuftrag), die älter als 24 Std. sind, wandern automatisch in
  // den Papierkorb - wiederherstellbar, also kein Datenverlust.
  leereAuftraegeAufraeumen() {
    const jetzt = Date.now();
    const kandidaten = data.auftraege.filter(a => istLeererAuftrag(a) && (jetzt - new Date(a.aktualisiertAm || a.erstelltAm).getTime()) > LEER_AUFRAEUMEN_NACH_MS);
    if (!kandidaten.length) return 0;
    kandidaten.forEach(a => {
      const idx = data.auftraege.indexOf(a);
      data.auftraege.splice(idx, 1);
      data.papierkorb.push({ ...a, geloeschtAm: new Date().toISOString(), loeschGrund: 'automatisch: leer, nie ausgefüllt' });
    });
    persist();
    return kandidaten.length;
  },

  // ---- Archiv (abgeschlossene, gedruckte Checklisten – nach Seriennummer auffindbar) ----
  // Ein Auftrag hat genau EINEN Archiveintrag: wird er erneut abgeschlossen/nachgedruckt,
  // wird der bestehende Eintrag aktualisiert und der vorherige Stand unter "versionen"
  // aufbewahrt (nichts geht verloren). Bereits vorhandene Doppel-Einträge aus älteren
  // Versionen bleiben unangetastet.
  addArchiv(entry) {
    let auftragId = entry.auftragId ?? null;
    if (auftragId !== null && auftragId !== '' && !isNaN(Number(auftragId))) auftragId = Number(auftragId);
    if (auftragId === '') auftragId = null;
    if (auftragId !== null) {
      const vorhandene = data.archiv.filter(x => x.auftragId !== null && String(x.auftragId) === String(auftragId));
      if (vorhandene.length) {
        const a = vorhandene.sort((x, y) => new Date(y.archiviertAm) - new Date(x.archiviertAm))[0];
        const { versionen, ...alterStand } = a;
        a.versionen = Array.isArray(versionen) ? versionen : [];
        a.versionen.push(alterStand);
        a.serien = (entry.serien || '').trim();
        a.kunde = entry.kunde || '';
        a.geraet = entry.geraet || '';
        a.wawi = entry.wawi || '';
        a.status = entry.status || '';
        a.daten = entry.daten || {};
        a.aktualisiertAm = new Date().toISOString();
        persist();
        return a;
      }
    }
    const a = {
      id: data.nextArchivId++,
      auftragId,
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
      .map(a => ({ id: a.id, auftragId: a.auftragId, serien: a.serien, kunde: a.kunde, geraet: a.geraet, wawi: a.wawi, status: a.status, archiviertAm: a.archiviertAm, aktualisiertAm: a.aktualisiertAm || null, versionen: Array.isArray(a.versionen) ? a.versionen.length : 0 }));
  },
  getArchivEintrag(id) {
    const a = data.archiv.find(x => x.id === Number(id));
    return a ? { ...a } : null;
  }
};
