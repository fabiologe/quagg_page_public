-- 005_portal.sql — Kundenportal (FAHRPLAN Stufe 8): welcher Portal-Nutzer (CLIENT)
-- darf welches Projekt sehen. Sichtbar ist nur Leistungsstand/Termine — nie Geld.
CREATE TABLE projekt.portal_freigaben (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    projekt_id   BIGINT NOT NULL REFERENCES projekt.projekte (id),
    username     TEXT NOT NULL CHECK (btrim(username) <> ''),
    von          TEXT NOT NULL,
    angelegt_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (projekt_id, username)
);
CREATE INDEX portal_freigaben_nutzer ON projekt.portal_freigaben (username);
GRANT SELECT, INSERT, DELETE ON projekt.portal_freigaben TO pedant_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA projekt TO pedant_app;
