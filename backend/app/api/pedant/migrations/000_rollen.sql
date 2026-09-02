-- 000_rollen.sql — Bootstrap, laeuft EINMAL clusterweit als postgres-Superuser.
-- NICHT Teil des normalen Migrationslaufs (cli.py migrate ueberspringt 000).
--
-- Aufruf (Passwoerter kommen aus backend/.env, NIE in diese Datei):
--   sudo -u postgres psql -v ON_ERROR_STOP=1 \
--     -v migrate_pw="$PEDANT_MIGRATE_PASSWORT" -v app_pw="$PEDANT_APP_PASSWORT" \
--     -f 000_rollen.sql
--
-- Zwei Rollen, eine Grenze:
--   pedant_migrate  — Eigentuemer der Datenbanken, darf DDL. Nur cli.py migrate.
--   pedant_app      — die API-Verbindung. Bekommt in 002 nur INSERT+SELECT auf
--                     den Kerntabellen; UPDATE/DELETE sind ihr technisch entzogen.
-- Idempotent: mehrfaches Ausfuehren ist harmlos.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pedant_migrate') THEN
        CREATE ROLE pedant_migrate LOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pedant_app') THEN
        CREATE ROLE pedant_app LOGIN;
    END IF;
END
$$;

ALTER ROLE pedant_migrate PASSWORD :'migrate_pw';
ALTER ROLE pedant_app PASSWORD :'app_pw';

-- CREATE DATABASE geht nicht im DO-Block; \gexec fuehrt die erzeugten Zeilen aus.
SELECT 'CREATE DATABASE pedant_test OWNER pedant_migrate'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pedant_test')
\gexec
SELECT 'CREATE DATABASE pedant_prod OWNER pedant_migrate'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pedant_prod')
\gexec

-- Nur die zwei Pedant-Rollen duerfen sich ueberhaupt verbinden.
REVOKE CONNECT ON DATABASE pedant_test FROM PUBLIC;
REVOKE CONNECT ON DATABASE pedant_prod FROM PUBLIC;
GRANT CONNECT ON DATABASE pedant_test TO pedant_migrate, pedant_app;
GRANT CONNECT ON DATABASE pedant_prod TO pedant_migrate, pedant_app;
