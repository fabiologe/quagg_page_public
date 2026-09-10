-- 003_vorschlaege.sql — KI schreibt nie Fakten (Leitentscheidung 6).
-- Alles, was MCP-Werkzeuge oder der spaetere Assistent "schreiben", landet
-- hier als Vorschlag; uebernommen wird im Cockpit von einem Menschen.

CREATE TABLE projekt.vorschlaege (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    projekt_id      BIGINT NOT NULL REFERENCES projekt.projekte (id),
    art             TEXT NOT NULL CHECK (art IN ('aufgabe', 'notiz', 'termin', 'fortschritt', 'zeitbuchung')),
    nutzlast        JSONB NOT NULL DEFAULT '{}'::jsonb,
    begruendung     TEXT NOT NULL DEFAULT '',
    von             TEXT NOT NULL DEFAULT 'mcp',        -- 'mcp' | 'assistent'
    status          TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'uebernommen', 'verworfen')),
    angelegt_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
    entschieden_am  TIMESTAMPTZ NULL,
    entschieden_von TEXT NULL,
    ergebnis        TEXT NOT NULL DEFAULT ''             -- was beim Uebernehmen entstand (z. B. 'meilenstein 12')
);
CREATE INDEX vorschlaege_offen ON projekt.vorschlaege (projekt_id) WHERE status = 'offen';

GRANT SELECT, INSERT, UPDATE ON projekt.vorschlaege TO pedant_app;   -- KEIN DELETE
GRANT USAGE ON ALL SEQUENCES IN SCHEMA projekt TO pedant_app;

CREATE TRIGGER vorschlaege_kein_delete BEFORE DELETE ON projekt.vorschlaege
    FOR EACH ROW EXECUTE FUNCTION public.sperre_mutation();
