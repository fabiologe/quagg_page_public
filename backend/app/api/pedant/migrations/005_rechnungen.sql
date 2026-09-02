-- 005_rechnungen.sql — Rechnungsstellung mit XRechnung (FAHRPLAN Kap. 5+7).
--
-- Kernidee Lueckenlosigkeit: ein ENTWURF hat KEINE Nummer (re_jahr/re_lfd NULL).
-- Die Nummer wird atomar beim Stellen vergeben; verworfen werden kann nur ein
-- Entwurf ohne Nummer (CHECK unten). Damit ist die fortlaufende, lueckenlose
-- Rechnungsnummer konstruktiv garantiert — nicht per Konvention.

-- Eigene Firmendaten (Verkaeufer der XRechnung): genau EINE Zeile, per
-- Migration leer angelegt, wird ueber die UI gefuellt. Die Pflichtpruefung
-- (BR-DE-2: USt-ID ODER Steuernummer; BR-DE-5/6/7: Kontakt inkl. E-Mail)
-- passiert erst beim Stellen.
CREATE TABLE firmendaten (
    id                SMALLINT PRIMARY KEY CHECK (id = 1),
    name              TEXT NOT NULL DEFAULT '',
    rechtsform_zusatz TEXT NOT NULL DEFAULT '',
    strasse           TEXT NOT NULL DEFAULT '',
    plz               TEXT NOT NULL DEFAULT '',
    ort               TEXT NOT NULL DEFAULT '',
    land              TEXT NOT NULL DEFAULT 'DE',
    steuernummer      TEXT NOT NULL DEFAULT '',
    ust_id            TEXT NOT NULL DEFAULT '',
    iban              TEXT NOT NULL DEFAULT '',
    bic               TEXT NOT NULL DEFAULT '',
    bank_name         TEXT NOT NULL DEFAULT '',
    email             TEXT NOT NULL DEFAULT '',
    telefon           TEXT NOT NULL DEFAULT '',
    ansprechpartner   TEXT NOT NULL DEFAULT '',
    aktualisiert_am   TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO firmendaten (id) VALUES (1);

CREATE TABLE auftraggeber (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            TEXT NOT NULL CHECK (btrim(name) <> ''),
    strasse         TEXT NOT NULL DEFAULT '',
    plz             TEXT NOT NULL DEFAULT '',
    ort             TEXT NOT NULL DEFAULT '',
    land            TEXT NOT NULL DEFAULT 'DE',
    leitweg_id      TEXT NOT NULL,
    portal          TEXT NOT NULL CHECK (portal IN ('zre_rlp', 'zre_bw')),  -- RLP auch Saarland
    email           TEXT NOT NULL DEFAULT '',
    telefon         TEXT NOT NULL DEFAULT '',
    ansprechpartner TEXT NOT NULL DEFAULT '',
    notiz           TEXT NOT NULL DEFAULT '',
    aktiv           BOOLEAN NOT NULL DEFAULT TRUE,
    angelegt_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
    aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rechnungen (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    re_jahr          SMALLINT NULL,
    re_lfd           INTEGER NULL,
    rechnungsnummer  TEXT GENERATED ALWAYS AS (CASE WHEN re_jahr IS NOT NULL
        THEN 'RE-' || re_jahr || '-' || lpad(re_lfd::text, 4, '0') END) STORED,
    auftraggeber_id  BIGINT NOT NULL REFERENCES auftraggeber (id),
    auftrag_referenz TEXT NOT NULL DEFAULT '',            -- BT-13, optional
    leitweg_id       TEXT NULL,                           -- Snapshot beim Stellen (BT-10)
    rechnungsdatum   DATE NOT NULL,
    leistung_von     DATE NOT NULL,
    leistung_bis     DATE NOT NULL,
    -- Bewusst eng: die Journal-Buchung ist fix "1200 an 4400 Erloese 19 %".
    -- 7 % braeuchte Konto 4300, 0 % ein Befreiungsgrund-Konzept (BT-120/121) —
    -- erweitern erst bei realem Bedarf.
    steuersatz       SMALLINT NOT NULL DEFAULT 19 CHECK (steuersatz = 19),
    zahlungsziel_tage SMALLINT NOT NULL DEFAULT 30 CHECK (zahlungsziel_tage BETWEEN 0 AND 90),
    status           TEXT NOT NULL DEFAULT 'entwurf'
        CHECK (status IN ('entwurf', 'gestellt', 'bezahlt', 'verworfen')),
    netto_cent       BIGINT NULL,                         -- Snapshot beim Stellen
    steuer_cent      BIGINT NULL,
    brutto_cent      BIGINT NULL,
    gestellt_am      TIMESTAMPTZ NULL,
    bezahlt_am       DATE NULL,
    versand_weg      TEXT NULL CHECK (versand_weg IN ('zre_rlp', 'zre_bw')),
    versand_am       TIMESTAMPTZ NULL,
    xml_pfad         TEXT NULL,
    xml_sha256       CHAR(64) NULL,
    bericht_pfad     TEXT NULL,
    buchung_lfd_nr   BIGINT NULL UNIQUE REFERENCES buchungssaetze (lfd_nr),
    verworfen_grund  TEXT NULL,
    angelegt_am      TIMESTAMPTZ NOT NULL DEFAULT now(),
    aktualisiert_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (re_jahr, re_lfd),
    CHECK (leistung_bis >= leistung_von),
    CHECK ((re_jahr IS NULL) = (re_lfd IS NULL)),
    CHECK (status NOT IN ('gestellt', 'bezahlt') OR (re_lfd IS NOT NULL
        AND leitweg_id IS NOT NULL AND netto_cent IS NOT NULL
        AND steuer_cent IS NOT NULL AND brutto_cent IS NOT NULL
        AND xml_pfad IS NOT NULL AND xml_sha256 IS NOT NULL
        AND bericht_pfad IS NOT NULL AND buchung_lfd_nr IS NOT NULL
        AND gestellt_am IS NOT NULL)),
    CHECK (status <> 'bezahlt' OR bezahlt_am IS NOT NULL),
    CHECK (status <> 'verworfen' OR verworfen_grund IS NOT NULL),
    CHECK (status <> 'verworfen' OR re_lfd IS NULL)       -- Lueckenlosigkeit
);
CREATE INDEX rechnungen_status ON rechnungen (status);

CREATE TABLE rechnungspositionen (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rechnung_id       BIGINT NOT NULL REFERENCES rechnungen (id),
    pos_nr            SMALLINT NOT NULL CHECK (pos_nr > 0),
    bezeichnung       TEXT NOT NULL CHECK (btrim(bezeichnung) <> ''),
    -- Mengen als Tausendstel-Ganzzahl (2,5 h = 2500): exakte Integer-Arithmetik
    -- wie ueberall im Pedanten, kein Float, kein NUMERIC.
    menge_tausendstel BIGINT NOT NULL CHECK (menge_tausendstel > 0),
    einheit           TEXT NOT NULL CHECK (einheit IN ('HUR', 'C62', 'H87')),
    einzelpreis_cent  BIGINT NOT NULL CHECK (einzelpreis_cent >= 0),
    -- DIE Rundungswahrheit: kaufmaennisch je Position, BIGINT-Division
    -- truncated bei positiven Werten = floor((m*p+500)/1000).
    betrag_cent       BIGINT GENERATED ALWAYS AS
        ((menge_tausendstel * einzelpreis_cent + 500) / 1000) STORED,
    UNIQUE (rechnung_id, pos_nr)
);

-- ── Rechte (Lektion aus 002: REVOKE ALL FROM PUBLIC — alles explizit) ────────
GRANT SELECT, UPDATE                 ON firmendaten        TO pedant_app;
GRANT SELECT, INSERT, UPDATE         ON auftraggeber       TO pedant_app;
GRANT SELECT, INSERT, UPDATE         ON rechnungen         TO pedant_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON rechnungspositionen TO pedant_app;
-- DELETE nur fuer Entwurfs-Positionen — der Trigger unten sichert das.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pedant_app;  -- neue IDENTITYs

-- ── Loeschen verboten; firmendaten bleibt einzeilig ─────────────────────────
CREATE TRIGGER firmendaten_fest    BEFORE INSERT OR DELETE ON firmendaten
    FOR EACH ROW EXECUTE FUNCTION sperre_mutation();
CREATE TRIGGER auftraggeber_kein_delete BEFORE DELETE ON auftraggeber
    FOR EACH ROW EXECUTE FUNCTION sperre_mutation();
CREATE TRIGGER rechnung_kein_delete BEFORE DELETE ON rechnungen
    FOR EACH ROW EXECUTE FUNCTION sperre_mutation();

-- ── Zeitstempel-Pflege fuer Stammdaten ──────────────────────────────────────
CREATE OR REPLACE FUNCTION stempel_aktualisiert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.aktualisiert_am := now();
    RETURN NEW;
END
$$;
CREATE TRIGGER firmendaten_stempel  BEFORE UPDATE ON firmendaten
    FOR EACH ROW EXECUTE FUNCTION stempel_aktualisiert();
CREATE TRIGGER auftraggeber_stempel BEFORE UPDATE ON auftraggeber
    FOR EACH ROW EXECUTE FUNCTION stempel_aktualisiert();

-- ── Statusmaschine der Rechnung ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pruefe_rechnung_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'verworfen' THEN
        RAISE EXCEPTION 'rechnung %: verworfen ist endgueltig', OLD.id;
    END IF;
    IF NEW.angelegt_am <> OLD.angelegt_am THEN
        RAISE EXCEPTION 'rechnung %: angelegt_am ist unveraenderlich', OLD.id;
    END IF;
    -- Nummer: nur der Uebergang NULL -> Wert ist erlaubt, nie aendern/zurueck.
    IF OLD.re_lfd IS NOT NULL AND (NEW.re_lfd IS DISTINCT FROM OLD.re_lfd
                                   OR NEW.re_jahr IS DISTINCT FROM OLD.re_jahr) THEN
        RAISE EXCEPTION 'rechnung %: die rechnungsnummer ist unveraenderlich', OLD.rechnungsnummer;
    END IF;
    IF OLD.re_lfd IS NOT NULL AND NEW.auftraggeber_id <> OLD.auftraggeber_id THEN
        RAISE EXCEPTION 'rechnung %: auftraggeber ist nach nummernvergabe fest', OLD.rechnungsnummer;
    END IF;
    IF NEW.status <> OLD.status AND NOT (
         (OLD.status = 'entwurf'  AND NEW.status IN ('gestellt', 'verworfen'))
      OR (OLD.status = 'gestellt' AND NEW.status = 'bezahlt')
      OR (OLD.status = 'bezahlt'  AND NEW.status = 'gestellt')) THEN
        RAISE EXCEPTION 'rechnung %: uebergang % -> % ist verboten',
            OLD.id, OLD.status, NEW.status;
    END IF;
    -- Nach dem Stellen ist alles eingefroren ausser Statuspflege
    -- (bezahlt/versand) — das XML ist die Wahrheit.
    IF OLD.status IN ('gestellt', 'bezahlt') THEN
        IF ROW(NEW.auftraggeber_id, NEW.auftrag_referenz, NEW.leitweg_id,
               NEW.rechnungsdatum, NEW.leistung_von, NEW.leistung_bis,
               NEW.steuersatz, NEW.zahlungsziel_tage, NEW.netto_cent,
               NEW.steuer_cent, NEW.brutto_cent, NEW.gestellt_am,
               NEW.xml_pfad, NEW.xml_sha256, NEW.bericht_pfad,
               NEW.buchung_lfd_nr, NEW.verworfen_grund)
           IS DISTINCT FROM
           ROW(OLD.auftraggeber_id, OLD.auftrag_referenz, OLD.leitweg_id,
               OLD.rechnungsdatum, OLD.leistung_von, OLD.leistung_bis,
               OLD.steuersatz, OLD.zahlungsziel_tage, OLD.netto_cent,
               OLD.steuer_cent, OLD.brutto_cent, OLD.gestellt_am,
               OLD.xml_pfad, OLD.xml_sha256, OLD.bericht_pfad,
               OLD.buchung_lfd_nr, OLD.verworfen_grund) THEN
            RAISE EXCEPTION 'rechnung %: nach dem stellen sind nur noch status,'
                ' bezahlt_am und versand_* aenderbar', OLD.rechnungsnummer;
        END IF;
    END IF;
    NEW.aktualisiert_am := now();
    RETURN NEW;
END
$$;
CREATE TRIGGER rechnung_update_regeln BEFORE UPDATE ON rechnungen
    FOR EACH ROW EXECUTE FUNCTION pruefe_rechnung_update();

-- ── Positionen: nur solange die Rechnung Entwurf ist ────────────────────────
CREATE OR REPLACE FUNCTION pruefe_position_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    eltern_status TEXT;
BEGIN
    SELECT status INTO eltern_status FROM rechnungen
        WHERE id = COALESCE(NEW.rechnung_id, OLD.rechnung_id);
    IF eltern_status IS DISTINCT FROM 'entwurf' THEN
        RAISE EXCEPTION 'positionen sind nur im entwurf veraenderbar (rechnung ist %)',
            coalesce(eltern_status, 'unbekannt');
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.rechnung_id <> OLD.rechnung_id THEN
        RAISE EXCEPTION 'eine position wechselt nie die rechnung';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER position_nur_im_entwurf
    BEFORE INSERT OR UPDATE OR DELETE ON rechnungspositionen
    FOR EACH ROW EXECUTE FUNCTION pruefe_position_mutation();
