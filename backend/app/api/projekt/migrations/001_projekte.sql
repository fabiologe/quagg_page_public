-- 001_projekte.sql — Fundament des Projekt-Cockpits (FAHRPLAN Kap. 6).
-- Laeuft als pedant_migrate in pedant_test/pedant_prod, eigenes Schema `projekt`.
--
-- Keine status-Spalte: die Phase eines Projekts ist seine Ordnerlage auf der
-- StorageBox (Leitentscheidung 1) — sonst gaebe es zwei Wahrheiten, sobald
-- jemand im Explorer verschiebt. Geld ist BIGINT in Cent, netto.

CREATE SCHEMA IF NOT EXISTS projekt;
GRANT USAGE ON SCHEMA projekt TO pedant_app;
REVOKE ALL ON ALL TABLES IN SCHEMA projekt FROM PUBLIC;

CREATE TABLE projekt.projekte (
    id                BIGINT PRIMARY KEY CHECK (id > 0),          -- = Ordnernummer
    name              TEXT NOT NULL CHECK (btrim(name) <> ''),
    kurzname          TEXT NOT NULL DEFAULT '',
    ordnername        TEXT NOT NULL UNIQUE,                       -- '<id>_<slug>'
    honorarmodell     TEXT NOT NULL CHECK (honorarmodell IN ('hoai', 'pauschal', 'stunden')),
    leistungsbild     TEXT NULL,                                  -- HOAI-Paragraf als Text ('43'), Stufe 2
    stundensatz_cent  BIGINT NULL CHECK (stundensatz_cent IS NULL OR stundensatz_cent > 0),
    budget_stunden    INTEGER NULL CHECK (budget_stunden IS NULL OR budget_stunden > 0),
    auftraggeber_id   BIGINT NULL,                                -- pedant.auftraggeber, nur die Zahl
    notiz             TEXT NOT NULL DEFAULT '',
    angelegt_am       TIMESTAMPTZ NOT NULL DEFAULT now(),
    aktualisiert_am   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ordnername ~ '^[0-9]+(_[A-Za-z0-9_-]+)?$')
);

CREATE TABLE projekt.beteiligte (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    projekt_id             BIGINT NOT NULL REFERENCES projekt.projekte (id),
    rolle                  TEXT NOT NULL CHECK (rolle IN
                           ('bauherr', 'auftraggeber', 'rechnungsempfaenger', 'architekt',
                            'behoerde', 'fachplaner', 'ausfuehrende_firma', 'sonstige')),
    name                   TEXT NOT NULL CHECK (btrim(name) <> ''),
    kontakt                TEXT NOT NULL DEFAULT '',
    pedant_auftraggeber_id BIGINT NULL,
    angelegt_am            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX beteiligte_projekt ON projekt.beteiligte (projekt_id);

CREATE TABLE projekt.meilensteine (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    projekt_id   BIGINT NOT NULL REFERENCES projekt.projekte (id),
    art          TEXT NOT NULL CHECK (art IN
                 ('termin', 'abgabe', 'bindefrist', 'gewaehrleistung', 'aufbewahrung', 'wiedervorlage')),
    bezeichnung  TEXT NOT NULL CHECK (btrim(bezeichnung) <> ''),
    faellig_am   DATE NOT NULL,
    erledigt_am  DATE NULL,
    notiz        TEXT NOT NULL DEFAULT '',
    angelegt_am  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX meilensteine_projekt ON projekt.meilensteine (projekt_id);
CREATE INDEX meilensteine_offen ON projekt.meilensteine (faellig_am) WHERE erledigt_am IS NULL;

-- Auditlog wie beim Pedanten: jede schreibende Aktion, auch die abgelehnte.
CREATE TABLE projekt.auditlog (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    zeitpunkt     TIMESTAMPTZ NOT NULL DEFAULT now(),
    akteur        TEXT NOT NULL,
    aktion        TEXT NOT NULL,
    erfolg        BOOLEAN NOT NULL,
    nutzlast_hash CHAR(64) NOT NULL,
    detail        JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Rechte (REVOKE ALL FROM PUBLIC oben — jede Tabelle braucht ihre Grants)
GRANT SELECT, INSERT, UPDATE         ON projekt.projekte     TO pedant_app;   -- KEIN DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON projekt.beteiligte   TO pedant_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON projekt.meilensteine TO pedant_app;
GRANT SELECT, INSERT                 ON projekt.auditlog     TO pedant_app;
GRANT SELECT                         ON projekt.schema_migrationen TO pedant_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA projekt TO pedant_app;

-- Haus-Philosophie: ein Projekt verschwindet nicht, es wandert in einen Phasenordner.
CREATE TRIGGER projekte_kein_delete BEFORE DELETE ON projekt.projekte
    FOR EACH ROW EXECUTE FUNCTION public.sperre_mutation();
CREATE TRIGGER projekte_stempel BEFORE UPDATE ON projekt.projekte
    FOR EACH ROW EXECUTE FUNCTION public.stempel_aktualisiert();
CREATE TRIGGER audit_kein_update BEFORE UPDATE OR DELETE ON projekt.auditlog
    FOR EACH ROW EXECUTE FUNCTION public.sperre_mutation();
