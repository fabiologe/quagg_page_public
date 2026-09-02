-- 006_erwartetes_geld.sql — die schlanke Alternative zum Projektmodul
-- (FAHRPLAN Kap. 5 "Erwartetes Geld" + Kap. 6 dritte Sicht).
--
-- Eine einfache Planungsliste: was ist absehbar, aber noch nicht in Rechnung
-- gestellt. KEIN Fortschrittstracking, keine Leistungsphasen — nur genug fuer
-- die Vorschau auf kommendes Geld. Wird beim spaeteren Projektmodul ERWEITERT,
-- nicht ersetzt. "Abzueglich dessen, was bereits als Rechnung existiert" wird
-- ueber bereits_gestellt_cent gepflegt (bewusst ohne FK auf rechnungen — die
-- Liste ist Planung, keine Buchhaltung).

CREATE TABLE erwartetes_geld (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bezeichnung           TEXT NOT NULL CHECK (btrim(bezeichnung) <> ''),
    auftraggeber_id       BIGINT NULL REFERENCES auftraggeber (id),
    betrag_cent           BIGINT NOT NULL CHECK (betrag_cent > 0),      -- brutto, Gesamtvolumen
    bereits_gestellt_cent BIGINT NOT NULL DEFAULT 0
                          CHECK (bereits_gestellt_cent >= 0
                                 AND bereits_gestellt_cent <= betrag_cent),
    erwartet_am           DATE NOT NULL,        -- erwarteter Zeitpunkt der Rechnungsstellung
    status                TEXT NOT NULL DEFAULT 'angefragt' CHECK (status IN
                          ('angefragt', 'angeboten', 'beauftragt',
                           'teilweise_gestellt', 'vollstaendig_gestellt', 'entfallen')),
    notiz                 TEXT NOT NULL DEFAULT '',
    angelegt_am           TIMESTAMPTZ NOT NULL DEFAULT now(),
    aktualisiert_am       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX erwartetes_geld_status ON erwartetes_geld (status);

-- Rechte (Muster: 002 hat REVOKE ALL FROM PUBLIC gesetzt)
GRANT SELECT, INSERT, UPDATE ON erwartetes_geld TO pedant_app;   -- KEIN DELETE
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pedant_app;

-- Planungsliste, aber Haus-Philosophie bleibt: nichts verschwindet.
-- Erledigtes/Geplatztes wird 'vollstaendig_gestellt' bzw. 'entfallen'.
CREATE TRIGGER erwartet_kein_delete BEFORE DELETE ON erwartetes_geld
    FOR EACH ROW EXECUTE FUNCTION sperre_mutation();
CREATE TRIGGER erwartet_stempel BEFORE UPDATE ON erwartetes_geld
    FOR EACH ROW EXECUTE FUNCTION stempel_aktualisiert();
