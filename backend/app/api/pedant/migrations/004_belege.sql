-- 004_belege.sql — Belegeingang (FAHRPLAN Kap. 5 „Belege, Eingang" + Kap. 8).
--
-- Ein Beleg durchlaeuft: erfasst -> (erkannt, nur mit aktiver OCR) -> geprueft
-- -> gebucht | verworfen. Die Uebergangsmatrix erzwingt der Trigger unten.
-- Die Original-Datei liegt content-adressiert unter der Beleg-Wurzel
-- ('<jahr>/<sha256><endung>'); ihre Unveraenderlichkeit ist ueber sha256 in
-- dieser Tabelle jederzeit nachpruefbar.

CREATE TABLE belege (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    beleg_jahr      SMALLINT NOT NULL,
    beleg_lfd       INTEGER  NOT NULL,
    belegnummer     TEXT GENERATED ALWAYS AS
                    ('B-' || beleg_jahr || '-' || lpad(beleg_lfd::text, 4, '0')) STORED,
    erfasst_am      TIMESTAMPTZ NOT NULL DEFAULT now(),
    original_name   TEXT NOT NULL,
    ablage_pfad     TEXT NOT NULL UNIQUE,      -- relativ zur Beleg-Wurzel
    sha256          CHAR(64) NOT NULL UNIQUE,  -- Duplikatsperre -> 409
    groesse_bytes   BIGINT NOT NULL CHECK (groesse_bytes > 0),
    mime_typ        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'erfasst' CHECK (status IN
                    ('erfasst', 'erkannt', 'geprueft', 'gebucht', 'verworfen')),
    lieferant       TEXT NULL,
    belegdatum      DATE NULL,
    netto_cent      BIGINT NULL CHECK (netto_cent > 0),
    steuersatz      SMALLINT NULL CHECK (steuersatz IN (0, 7, 19)),
    brutto_cent     BIGINT NULL CHECK (brutto_cent > 0),
    erkannt_json    JSONB NULL,                -- Roh-OCR; bleibt NULL bis zum Scharfstellen
    kostenmerkmal   TEXT NOT NULL DEFAULT '',  -- spaetere Projektzuordnung
    buchung_lfd_nr  BIGINT NULL UNIQUE REFERENCES buchungssaetze (lfd_nr),
    verworfen_grund TEXT NULL,
    aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (beleg_jahr, beleg_lfd),
    -- Zustandskonsistenz doppelt erzwungen (Guertel zur Trigger-Hose):
    CHECK ((status = 'gebucht') = (buchung_lfd_nr IS NOT NULL)),
    CHECK (status <> 'verworfen' OR verworfen_grund IS NOT NULL),
    CHECK (status NOT IN ('geprueft', 'gebucht') OR
           (lieferant IS NOT NULL AND belegdatum IS NOT NULL AND
            netto_cent IS NOT NULL AND steuersatz IS NOT NULL AND
            brutto_cent IS NOT NULL))
);
CREATE INDEX belege_status ON belege (status);

-- Rechte: 002 hat REVOKE ALL ... FROM PUBLIC gesetzt — neue Objekte explizit.
GRANT SELECT, INSERT, UPDATE ON belege TO pedant_app;          -- KEIN DELETE
-- Wiederholen: der Grant aus 002 erfasst die NEUE IDENTITY-Sequence nicht.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pedant_app;

-- DELETE ist immer verboten — auch fuer den Eigentuemer (Muster 002).
CREATE TRIGGER beleg_kein_delete
    BEFORE DELETE ON belege
    FOR EACH ROW EXECUTE FUNCTION sperre_mutation();

-- UPDATE-Regeln: Identitaet nie, Statusmaschine erzwungen, gebucht-Lock.
CREATE OR REPLACE FUNCTION pruefe_beleg_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.beleg_jahr <> OLD.beleg_jahr OR NEW.beleg_lfd <> OLD.beleg_lfd
       OR NEW.sha256 <> OLD.sha256 OR NEW.ablage_pfad <> OLD.ablage_pfad
       OR NEW.erfasst_am <> OLD.erfasst_am
       OR NEW.original_name <> OLD.original_name
       OR NEW.groesse_bytes <> OLD.groesse_bytes
       OR NEW.mime_typ <> OLD.mime_typ THEN
        RAISE EXCEPTION 'beleg %: identitaetsfelder sind unveraenderlich', OLD.belegnummer;
    END IF;
    IF OLD.status = 'verworfen' THEN
        RAISE EXCEPTION 'beleg %: verworfen ist endgueltig', OLD.belegnummer;
    END IF;
    IF OLD.status = 'gebucht' AND (
         NEW.status <> 'gebucht'
         OR NEW.buchung_lfd_nr IS DISTINCT FROM OLD.buchung_lfd_nr
         OR ROW(NEW.lieferant, NEW.belegdatum, NEW.netto_cent,
                NEW.steuersatz, NEW.brutto_cent, NEW.erkannt_json)
            IS DISTINCT FROM
            ROW(OLD.lieferant, OLD.belegdatum, OLD.netto_cent,
                OLD.steuersatz, OLD.brutto_cent, OLD.erkannt_json)) THEN
        RAISE EXCEPTION 'beleg %: nach gebucht ist nur kostenmerkmal aenderbar', OLD.belegnummer;
    END IF;
    IF NEW.status <> OLD.status AND NOT (
         (OLD.status IN ('erfasst', 'erkannt', 'geprueft')
          AND NEW.status IN ('erfasst', 'erkannt', 'geprueft', 'verworfen'))
      OR (OLD.status = 'geprueft' AND NEW.status = 'gebucht')) THEN
        RAISE EXCEPTION 'beleg %: uebergang % -> % ist verboten',
            OLD.belegnummer, OLD.status, NEW.status;
    END IF;
    IF NEW.buchung_lfd_nr IS NOT NULL AND NEW.status <> 'gebucht' THEN
        RAISE EXCEPTION 'buchung_lfd_nr gehoert nur zum status gebucht';
    END IF;
    NEW.aktualisiert_am := now();
    RETURN NEW;
END
$$;

CREATE TRIGGER beleg_update_regeln
    BEFORE UPDATE ON belege
    FOR EACH ROW EXECUTE FUNCTION pruefe_beleg_update();
