-- 004_zeit_aufgaben.sql — Aufgaben und Zeiterfassung (FAHRPLAN Stufe 3).
--
-- Zeit in ganzen Minuten. Eine Zeitbuchung mit rechnung_id ist abgerechnet und
-- damit eingefroren (Trigger). Ein laufender Timer ist KEINE Buchung — er
-- lebt in projekt.timer (eine Zeile je Akteur) und wird beim Stoppen gebucht.

CREATE TABLE projekt.aufgaben (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    projekt_id      BIGINT NOT NULL REFERENCES projekt.projekte (id),
    abschnitt_id    BIGINT NULL,                      -- projekt.abschnitte, nur Zahl
    titel           TEXT NOT NULL CHECK (btrim(titel) <> ''),
    beschreibung    TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'laufend', 'erledigt')),
    faellig_am      DATE NULL,
    erledigt_am     DATE NULL,
    quelle          TEXT NOT NULL DEFAULT 'manuell' CHECK (quelle IN ('manuell', 'ki', 'bcf')),
    quelle_ref      TEXT NOT NULL DEFAULT '',
    angelegt_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
    aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((status = 'erledigt') = (erledigt_am IS NOT NULL))
);
CREATE INDEX aufgaben_projekt ON projekt.aufgaben (projekt_id);
CREATE INDEX aufgaben_offen ON projekt.aufgaben (faellig_am) WHERE status <> 'erledigt';

CREATE TABLE projekt.zeitbuchungen (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    projekt_id      BIGINT NOT NULL REFERENCES projekt.projekte (id),
    abschnitt_id    BIGINT NULL,
    aufgabe_id      BIGINT NULL,
    datum           DATE NOT NULL,
    dauer_min       INTEGER NOT NULL CHECK (dauer_min > 0 AND dauer_min <= 1440),
    taetigkeit      TEXT NOT NULL CHECK (btrim(taetigkeit) <> ''),
    abrechenbar     BOOLEAN NOT NULL DEFAULT true,
    rechnung_id     BIGINT NULL,                      -- pedant.rechnungen, nur Zahl; gesetzt = eingefroren
    akteur          TEXT NOT NULL,
    angelegt_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
    aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX zeitbuchungen_projekt ON projekt.zeitbuchungen (projekt_id, datum);
CREATE INDEX zeitbuchungen_datum ON projekt.zeitbuchungen (datum);

CREATE TABLE projekt.timer (
    akteur        TEXT PRIMARY KEY,
    projekt_id    BIGINT NOT NULL REFERENCES projekt.projekte (id),
    abschnitt_id  BIGINT NULL,
    aufgabe_id    BIGINT NULL,
    taetigkeit    TEXT NOT NULL DEFAULT '',
    gestartet_am  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON projekt.aufgaben      TO pedant_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON projekt.zeitbuchungen TO pedant_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON projekt.timer         TO pedant_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA projekt TO pedant_app;

CREATE TRIGGER aufgaben_stempel BEFORE UPDATE ON projekt.aufgaben
    FOR EACH ROW EXECUTE FUNCTION public.stempel_aktualisiert();

-- Abgerechnete Zeit ist eingefroren: nur das Loesen der Rechnungsreferenz
-- (Rechnung im Pedanten verworfen) bleibt erlaubt.
CREATE OR REPLACE FUNCTION projekt.pruefe_zeitbuchung() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.rechnung_id IS NOT NULL THEN
            RAISE EXCEPTION 'zeitbuchung %: abgerechnet (rechnung %) — nicht loeschbar', OLD.id, OLD.rechnung_id;
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.rechnung_id IS NOT NULL AND NEW.rechnung_id IS NOT NULL THEN
        IF ROW(NEW.projekt_id, NEW.abschnitt_id, NEW.aufgabe_id, NEW.datum, NEW.dauer_min,
               NEW.taetigkeit, NEW.abrechenbar, NEW.rechnung_id)
           IS DISTINCT FROM
           ROW(OLD.projekt_id, OLD.abschnitt_id, OLD.aufgabe_id, OLD.datum, OLD.dauer_min,
               OLD.taetigkeit, OLD.abrechenbar, OLD.rechnung_id) THEN
            RAISE EXCEPTION 'zeitbuchung %: abgerechnet (rechnung %) — eingefroren', OLD.id, OLD.rechnung_id;
        END IF;
    END IF;
    NEW.aktualisiert_am := now();
    RETURN NEW;
END
$$;
CREATE TRIGGER zeitbuchungen_regeln BEFORE UPDATE OR DELETE ON projekt.zeitbuchungen
    FOR EACH ROW EXECUTE FUNCTION projekt.pruefe_zeitbuchung();
