-- 002_append_only.sql — die eigentliche Garantie des Fahrplans (Kap. 4):
-- Rechteentzug auf Datenbankebene plus Trigger als zweite Sperre.
--
-- Ehrliche Grenze (gehoert so in die Verfahrensdokumentation): pedant_migrate
-- als Eigentuemer koennte Trigger deaktivieren. Dagegen stehen Hash-Kette,
-- Auditlog und spaeter die versiegelten Schnappschuesse. Die API verbindet
-- ausschliesslich als pedant_app — und der ist UPDATE/DELETE technisch entzogen.

-- ── Rechte ────────────────────────────────────────────────────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pedant_app;

GRANT SELECT, INSERT ON buchungssaetze TO pedant_app;
GRANT SELECT, INSERT ON auditlog       TO pedant_app;
GRANT SELECT         ON konten         TO pedant_app;
GRANT SELECT         ON schema_migrationen TO pedant_app;
-- journal_kopf ist Cursor, keine Buchhaltungsdaten: UPDATE noetig, INSERT/DELETE nicht.
GRANT SELECT, UPDATE ON journal_kopf   TO pedant_app;
-- IDENTITY-Spalte des Auditlogs braucht nextval; USAGE erlaubt kein setval.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pedant_app;

-- ── Trigger: sperrt Mutation auch fuer den Eigentuemer ───────────────────────
CREATE OR REPLACE FUNCTION sperre_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'append-only: % auf % ist verboten', TG_OP, TG_TABLE_NAME;
END
$$;

CREATE TRIGGER buchung_unveraenderlich
    BEFORE UPDATE OR DELETE ON buchungssaetze
    FOR EACH ROW EXECUTE FUNCTION sperre_mutation();

CREATE TRIGGER audit_unveraenderlich
    BEFORE UPDATE OR DELETE ON auditlog
    FOR EACH ROW EXECUTE FUNCTION sperre_mutation();

-- Die Genesis-Zeile existiert seit 001; weitere Zeilen oder Loeschung sind
-- auch fuer den Eigentuemer gesperrt (UPDATE bleibt erlaubt — das ist der Cursor).
CREATE TRIGGER kopf_einzeilig
    BEFORE INSERT OR DELETE ON journal_kopf
    FOR EACH ROW EXECUTE FUNCTION sperre_mutation();

-- ── Trigger: Kettenkontinuitaet in der DB erzwungen ──────────────────────────
-- Den Inhalts-Hash rechnet Python (core/hashkette.py); die DB prueft, dass jede
-- neue Zeile exakt an den Kopf anschliesst. Ein Schreiber, der die Kopfzeile
-- nicht fortschreibt oder eine Nummer ueberspringt, fliegt hier raus.
CREATE OR REPLACE FUNCTION pruefe_kette() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    kopf journal_kopf%ROWTYPE;
BEGIN
    SELECT * INTO kopf FROM journal_kopf WHERE id = 1 FOR UPDATE;
    IF NEW.lfd_nr <> kopf.lfd_nr_letzte + 1 THEN
        RAISE EXCEPTION 'kettenbruch: lfd_nr % erwartet, % erhalten',
            kopf.lfd_nr_letzte + 1, NEW.lfd_nr;
    END IF;
    IF NEW.hash_prev <> kopf.hash_letzter THEN
        RAISE EXCEPTION 'kettenbruch: hash_prev schliesst nicht an den kopf an';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER buchung_kette
    BEFORE INSERT ON buchungssaetze
    FOR EACH ROW EXECUTE FUNCTION pruefe_kette();
