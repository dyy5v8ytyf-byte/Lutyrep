# Lutyrep – Installation & Hosting

Lutyrep ist die Reparatur-Auftragsverwaltung für Wwtec: ein kleiner Server mit echter Datenbank, den alle Mitarbeiter im Browser öffnen. Wer immer den Server erreicht, sieht denselben, aktuellen Stand – Aufträge, Mitarbeiterliste, Lagerbestand und gemerkte Einträge liegen zentral in einer Datei (`data/lutyrep.db`), nicht mehr im Browser des einzelnen Nutzers.

Getestet wurden: Auftrag anlegen, Mitarbeiter erfassen, Fehlerbeschreibungen, Ersatzteil-Entnahme mit Lagerabgleich, Kostenvoranschlag-Berechnung (inkl. Sperre bei fehlenden Zeiten), Statusanzeige im Dashboard – jeweils mit zwei gleichzeitigen „Nutzern", die sich gegenseitig sofort bzw. nach Neuladen sehen.

## 1. Installation auf einem Windows-Rechner

Das ist der Rechner, der als **Server** läuft – also der eine Rechner, auf dem Lutyrep dauerhaft an sein sollte (z. B. ein Büro-PC oder ein kleiner immer laufender Rechner).

1. Falls noch nicht vorhanden: **Node.js** installieren – kostenlos unter [nodejs.org](https://nodejs.org/), die Version mit der Aufschrift „LTS" herunterladen und mit „Weiter, Weiter, Fertig" installieren.
2. Den Ordner „Lutyrep" an einen festen Ort kopieren, z. B. `C:\Lutyrep`.
3. Doppelklick auf **`install_lutyrep.bat`**. Das richtet das Programm einmalig ein und legt eine Verknüpfung **„Lutyrep"** auf dem Desktop an.
4. Ab jetzt reicht ein Doppelklick auf die Desktop-Verknüpfung **„Lutyrep"** – das startet den Server und öffnet automatisch den Browser mit der Auftragsübersicht.

Der Server läuft in einem kleinen, minimierten Fenster „Lutyrep-Server" weiter, solange der Rechner an ist. Wird dieses Fenster geschlossen, ist Lutyrep für alle nicht mehr erreichbar – der Rechner sollte also während der Arbeitszeit durchlaufen.

## 2. Installation auf Mac/Linux

Node.js installieren (falls nötig), dann im Terminal:

```
cd /pfad/zu/Lutyrep
./start_lutyrep.sh
```

Beenden mit `./stop_lutyrep.sh`.

## 3. Wie erreichen Kolleginnen und Kollegen Lutyrep?

Solange alle im selben Firmennetz (WLAN/LAN) sind, reicht im Browser:

```
http://NAME-ODER-IP-DES-SERVER-PCs:3000
```

Den Rechnernamen bzw. die IP-Adresse des Server-PCs findet man z. B. mit `ipconfig` (Windows, Zeile „IPv4-Adresse"). Diese Adresse kann jeder Kollege als Lesezeichen speichern.

**Wichtig:** Die Windows-Firewall fragt beim ersten Start eventuell, ob Node.js im Netzwerk kommunizieren darf – das muss erlaubt werden (für „Private Netzwerke"), sonst können andere Rechner nicht zugreifen.

## 4. Ehrlich gesagt: Was „Cloud-basiert, immer aktuell" tatsächlich bedeutet

„Immer aktuell für alle" ist mit dem jetzigen Aufbau bereits erreicht – *sobald* alle denselben Server erreichen können. Das Programm selbst kann ich in dieser Sitzung fertig bauen und testen, aber **einen dauerhaft erreichbaren Server kann ich nicht selbst für Sie einrichten oder bezahlen** – das ist eine Entscheidung, die Wwtec treffen muss. Hier die realistischen Optionen, ohne Beschönigung:

**Option A – Lokal im Firmennetz (kostenlos)**
Ein Rechner im Büro läuft mit Lutyrep dauerhaft. Alle im selben Netzwerk (Büro-WLAN/LAN) können zugreifen. Kein Zugriff von unterwegs oder aus dem Homeoffice, außer es gibt bereits eine VPN-Lösung ins Firmennetz. Aufwand: gering, kein zusätzliches Konto nötig.

**Option B – Kleiner Cloud-Server / VPS (ca. 4–8 €/Monat)**
Anbieter wie Hetzner, Netcup oder IONOS vermieten kleine virtuelle Server. Lutyrep würde dort dauerhaft laufen und wäre von überall erreichbar. Erfordert: ein Konto bei einem solchen Anbieter (mit Zahlungsdaten) sowie etwas Einrichtungsaufwand (Server mieten, Node.js installieren, Lutyrep hochladen, Firewall/HTTPS einrichten). Ich kann bei der technischen Einrichtung anleiten bzw. Schritt für Schritt begleiten, sobald ein Zugang besteht – das Konto selbst muss aber jemand bei Wwtec anlegen.

**Option C – Einfacher Hosting-Dienst (z. B. Railway, Render; oft ca. 5–20 $/Monat)**
Etwas einfacher einzurichten als ein eigener Server, der Code (dieser Lutyrep-Ordner) lässt sich dort mit wenigen Klicks hochladen und läuft dann dauerhaft online. Auch hier: Konto und ggf. Zahlungsdaten sind bei Wwtec anzulegen, danach kann ich beim Hochladen/Einrichten helfen.

**Meine Einschätzung:** Für den Start würde ich zu **Option A** raten – kostenlos, sofort nutzbar, und man merkt schnell, ob das Werkzeug im Alltag passt. Wenn absehbar ist, dass auch von unterwegs oder aus einer zweiten Werkstatt zugegriffen werden muss, ist **Option B oder C** der nächste sinnvolle Schritt.

## 5. Wichtige Einschränkung: (noch) kein Benutzer-Login

Aktuell gibt es **keine Anmeldung** – wer die Adresse (z. B. `http://...:3000`) erreicht, kann alle Aufträge sehen und bearbeiten. Im internen Firmennetz ist das meist unkritisch. Sobald Lutyrep über das Internet erreichbar wäre (Option B/C), sollte vorher ein einfacher Passwortschutz ergänzt werden – das ist technisch machbar, aber noch nicht eingebaut. Bitte Bescheid geben, falls das für die gewählte Hosting-Option gebraucht wird, dann baue ich das nach.

## 6. Datensicherung

Alle Daten liegen in **einer einzigen Datei**: `data/lutyrep.db` (im Lutyrep-Ordner auf dem Server-Rechner). Diese Datei sollte regelmäßig gesichert werden (z. B. Kopie auf einen USB-Stick oder in einen Cloud-Speicher-Ordner) – geht sie verloren, sind alle Aufträge, der Lagerbestand und die gemerkten Einträge weg.

## 7. Inhalt des Lutyrep-Ordners

- `install_lutyrep.bat` – einmalige Einrichtung (Windows) + Desktop-Verknüpfung
- `start_lutyrep.bat` / `start_lutyrep.sh` – Programm starten
- `stop_lutyrep.sh` – Programm beenden (Mac/Linux)
- `server.js`, `db.js` – der eigentliche Server samt Datenbank-Anbindung
- `public/` – die Weboberfläche (Übersicht, Reparatur-Checkliste, Lagerbestand-Verwaltung)
- `data/` – hier entsteht beim ersten Start die Datenbank-Datei

## Update 10/2026 (v1.1)
- **Automatische Sicherung:** Bei jedem Programmstart wird die Datenbank unverändert nach `<DATA_DIR>/backups/` kopiert (max. 10 Sicherungen bzw. 150 MB, unveränderte Stände werden nicht doppelt gesichert). Wiederherstellen: Server stoppen, gewünschte Sicherung als `lutyrep.json` zurückkopieren, Server starten.
- **Papierkorb:** „löschen" auf der Übersicht verschiebt Aufträge nur in den Papierkorb (wiederherstellbar). Leere, nie ausgefüllte Aufträge wandern nach 24 Std. automatisch dorthin.
- **Mindestbestand / Bestellbedarf:** neue Spalte auf der Lagerbestand-Seite; Teile mit Bestand ≤ Mindestbestand erscheinen auf der Übersicht.
- **Schritt 1 – Defekte Komponenten:** Ja/Nein-Abfrage, bei Ja Beschreibung + max. 2 Fotos.
- **Bearbeitungsmodus ohne Passwort:** Umgebungsvariable `LUTYREP_AUTH=off` schaltet den Login ab. **Nur lokal verwenden, nie auf Railway setzen.**
- **Schritt 2:** Ergebnis i.O./n.i.O. für Sichtprüfung und Funktionstest; elektrische Sicherheitsprüfung vor Inbetriebnahme (Schutzklasse, R_PE, R_ISO, Prüfgerät) – Funktionstest unter Spannung erst nach bestandener Prüfung; Kundenfreigabe nur mit Nachweis (Datum, Art, entgegengenommen von).
- **Einstellungen (`einstellungen.html`):** Fehlerkategorien und Messgrößen für Schritt 2 pflegen. Werden leer ausgeliefert; Einträge nur deaktivierbar, nicht löschbar.
- **Schritt 3 – Lager:** Ersatzteile werden bei der Diagnose nur **reserviert** und erst bei „Komponenten ausgetauscht" abgebucht (serverseitig per Differenzbuchung, mit Lagerjournal `/api/lagerbewegungen`). Entfernen eines abgebuchten Teils bucht zurück. Fehlende Mengen werden gemeldet und erscheinen als Bestellbedarf („fehlt für Aufträge"). Altaufträge gelten als bereits abgebucht.
- **Schritt 3 – KV:** Stundensatz netto, änderbar unter Einstellungen (Standard 120 €). Freigegebener Betrag wird festgehalten; weicht ein neu erstellter KV ab, wird gefragt, ob eine neue Kundenfreigabe nötig ist.
- **Zeiterfassung:** je Schritt zusätzliche Zeiteinträge (weiterer Mitarbeiter / erneuter Durchlauf), werden addiert.
- **Schritt 3 – Prüfung:** Sicherheitsprüfung nach Instandsetzung (R_PE, R_ISO, Schutzleiter-/Berührungsstrom, Prüfgerät) und Messwerte; „Test insgesamt i.O." nur bei bestandener Prüfung und i.O.-Einzeltests.
- **Schritt 4:** Abschluss nur über „Auftrag abschließen & archivieren" und erst, wenn Test, Sicherheitsprüfung, Endkontrolle (i.O.), Vollständigkeit (Abgleich mit Eingang), Verpackung sowie Versanddatum/-art erfasst sind. Bereits abgeschlossene Altaufträge können jederzeit nachgedruckt werden. Pro Auftrag ein Archiveintrag; ein erneuter Abschluss aktualisiert ihn und bewahrt den alten Stand als Version.
- **Auftrag zurücksetzen:** legt vorher eine vollständige Kopie im Papierkorb an und bucht abgebuchte Teile zurück.
- **Kunden-Prüfprotokoll (`protokoll.html`):** ohne EK/VK-Preise und interne Notizen, mit Messwerten der Sicherheitsprüfung; KV-Betrag (netto) optional zuschaltbar. Logo: offizielle STEER.E-Kompassrose (Brass/Navy).
- **Lager/Archiv:** manuelle Bestandskorrekturen erscheinen im Lagerjournal; Archivsuche auch nach WAWI-Nr.
