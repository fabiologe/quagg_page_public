-- 001_schema.sql — Kerntabellen des Journals (FAHRPLAN Kap. 5).
-- Laeuft als pedant_migrate in pedant_test bzw. pedant_prod.
--
-- Geld ist ueberall BIGINT in Cent. Kein NUMERIC, kein Float: Cent-Integer sind
-- exakt, vergleichbar und ueberleben jede Sprachgrenze (Python/JS) unverfaelscht.

CREATE TABLE konten (
    kontonr     TEXT PRIMARY KEY,           -- vierstellig, SKR04 ('1800')
    bezeichnung TEXT NOT NULL,
    kontoart    TEXT NOT NULL CHECK (kontoart IN
                ('AKTIV', 'PASSIV', 'ERTRAG', 'AUFWAND', 'FORDERUNG',
                 'VERBINDLICHKEIT', 'FINANZ', 'STEUER', 'KAPITAL', 'STATISTIK')),
    aktiv       BOOLEAN NOT NULL DEFAULT true,
    CHECK (kontonr ~ '^[0-9]{4}$')
);

-- Kettenkopf: EINE Zeile, die die letzte vergebene Nummer und den letzten Hash
-- traegt. Bewusst keine Sequence — Sequences hinterlassen bei Rollbacks Luecken,
-- und die laufende Nummer muss lueckenlos sein (GoBD). Der Schreibpfad sperrt
-- diese Zeile mit FOR UPDATE und serialisiert damit alle Schreiber.
CREATE TABLE journal_kopf (
    id             SMALLINT PRIMARY KEY CHECK (id = 1),
    lfd_nr_letzte  BIGINT NOT NULL,
    hash_letzter   CHAR(64) NOT NULL
);
INSERT INTO journal_kopf (id, lfd_nr_letzte, hash_letzter)
VALUES (1, 0, repeat('0', 64));             -- Genesis

CREATE TABLE buchungssaetze (
    lfd_nr           BIGINT PRIMARY KEY,
    buchungsdatum    DATE NOT NULL,
    belegdatum       DATE NOT NULL,
    sollkonto        TEXT NOT NULL REFERENCES konten (kontonr),
    habenkonto       TEXT NOT NULL REFERENCES konten (kontonr),
    betrag_cent      BIGINT NOT NULL CHECK (betrag_cent > 0),
    steuerschluessel TEXT NOT NULL DEFAULT '',
    buchungstext     TEXT NOT NULL CHECK (buchungstext <> ''),
    belegreferenz    TEXT NOT NULL DEFAULT '',
    stornoreferenz   BIGINT NULL REFERENCES buchungssaetze (lfd_nr),
    hash             CHAR(64) NOT NULL UNIQUE,
    hash_prev        CHAR(64) NOT NULL,
    erfasst_am       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (sollkonto <> habenkonto)
);
CREATE INDEX buchungssaetze_buchungsdatum ON buchungssaetze (buchungsdatum);
CREATE INDEX buchungssaetze_stornoreferenz ON buchungssaetze (stornoreferenz)
    WHERE stornoreferenz IS NOT NULL;

-- Auditlog: eigene, ebenfalls nur anfuegende Tabelle. Luecken in der id sind
-- hier fachlich in Ordnung (IDENTITY), lueckenlos muss nur das Journal sein.
CREATE TABLE auditlog (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    zeitpunkt     TIMESTAMPTZ NOT NULL DEFAULT now(),
    akteur        TEXT NOT NULL,
    aktion        TEXT NOT NULL,
    erfolg        BOOLEAN NOT NULL,
    nutzlast_hash CHAR(64) NOT NULL,
    detail        JSONB NOT NULL DEFAULT '{}'::jsonb
);
