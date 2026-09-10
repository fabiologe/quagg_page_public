-- 006_kalender.sql — Termine mit Uhrzeit/Zeitzone, Teilnehmer (iMIP/RSVP),
-- Antwort-Buch (Idempotenz) und Feed-Token (webcal). Meilensteine bleiben
-- unveraendert: sie sind DATE-Fristen mit vielen Konsumenten; Termine sind
-- Kalender-Ereignisse mit UID/SEQUENCE nach RFC 5545.
CREATE TABLE projekt.termine (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    projekt_id         BIGINT NULL REFERENCES projekt.projekte (id),   -- NULL = firmenweit
    titel              TEXT NOT NULL CHECK (btrim(titel) <> ''),
    beginn             TIMESTAMPTZ NOT NULL,
    ende               TIMESTAMPTZ NOT NULL,
    ganztag            BOOLEAN NOT NULL DEFAULT false,
    ort                TEXT NOT NULL DEFAULT '',
    besprechungslink   TEXT NOT NULL DEFAULT '' CHECK (besprechungslink = '' OR besprechungslink ~ '^https?://'),
    beschreibung       TEXT NOT NULL DEFAULT '',
    uid                TEXT NOT NULL UNIQUE,                 -- 'termin-<id>@quagg-engineering.org' oder fremde UID
    sequenz            INTEGER NOT NULL DEFAULT 0,
    eingeladen_sequenz INTEGER NULL,                         -- zuletzt per REQUEST versendete SEQUENCE
    eingeladen_am      TIMESTAMPTZ NULL,
    status             TEXT NOT NULL DEFAULT 'geplant' CHECK (status IN ('geplant', 'abgesagt')),
    abgesagt_am        TIMESTAMPTZ NULL,
    quelle             TEXT NOT NULL DEFAULT 'eigen' CHECK (quelle IN ('eigen', 'einladung')),
    organisator_email  TEXT NOT NULL,                        -- eigen: Kontoadresse; einladung: fremder ORGANIZER
    organisator_name   TEXT NOT NULL DEFAULT '',
    unser_status       TEXT NULL CHECK (unser_status IN ('ACCEPTED', 'DECLINED', 'TENTATIVE')),  -- nur quelle='einladung'
    email_event_id     BIGINT NULL,                          -- SQLite email_events.id der Einladung
    angelegt_von       TEXT NOT NULL,
    angelegt_am        TIMESTAMPTZ NOT NULL DEFAULT now(),
    aktualisiert_am    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ende > beginn),
    CHECK ((status = 'abgesagt') = (abgesagt_am IS NOT NULL))
);
CREATE INDEX termine_projekt ON projekt.termine (projekt_id);
CREATE INDEX termine_zeit    ON projekt.termine (beginn, ende);
CREATE TRIGGER termine_stempel BEFORE UPDATE ON projekt.termine
    FOR EACH ROW EXECUTE FUNCTION public.stempel_aktualisiert();

CREATE TABLE projekt.termin_teilnehmer (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    termin_id      BIGINT NOT NULL REFERENCES projekt.termine (id) ON DELETE CASCADE,
    email          TEXT NOT NULL CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    name           TEXT NOT NULL DEFAULT '',
    rolle          TEXT NOT NULL DEFAULT 'REQ-PARTICIPANT' CHECK (rolle IN ('REQ-PARTICIPANT', 'OPT-PARTICIPANT')),
    status         TEXT NOT NULL DEFAULT 'NEEDS-ACTION'
                   CHECK (status IN ('NEEDS-ACTION', 'ACCEPTED', 'DECLINED', 'TENTATIVE', 'DELEGATED')),
    kommentar      TEXT NOT NULL DEFAULT '',
    eingeladen_am  TIMESTAMPTZ NULL,
    antwort_am     TIMESTAMPTZ NULL,
    UNIQUE (termin_id, email)
);

-- Jede verarbeitete iMIP-Mail genau einmal (Message-ID der Antwortmail).
CREATE TABLE projekt.termin_antworten (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    message_id      TEXT NOT NULL UNIQUE,
    email_event_id  BIGINT NOT NULL,
    uid             TEXT NOT NULL,
    methode         TEXT NOT NULL,                            -- REPLY | COUNTER | CANCEL | REQUEST
    ergebnis        TEXT NOT NULL,                            -- uebernommen | veraltet | unbekannte_uid | neu_aufgenommen | ...
    verarbeitet_am  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projekt.kalender_feeds (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username              TEXT NOT NULL CHECK (btrim(username) <> ''),
    token_hash            CHAR(64) NOT NULL UNIQUE,           -- sha256(token); Klartext nur einmal in der Antwort
    erstellt_am           TIMESTAMPTZ NOT NULL DEFAULT now(),
    widerrufen_am         TIMESTAMPTZ NULL,
    zuletzt_abgerufen_am  TIMESTAMPTZ NULL
);
CREATE INDEX kalender_feeds_nutzer ON projekt.kalender_feeds (username) WHERE widerrufen_am IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON projekt.termine           TO pedant_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON projekt.termin_teilnehmer TO pedant_app;
GRANT SELECT, INSERT                 ON projekt.termin_antworten  TO pedant_app;
GRANT SELECT, INSERT, UPDATE         ON projekt.kalender_feeds    TO pedant_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA projekt TO pedant_app;
