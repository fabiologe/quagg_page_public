-- 008_datev_firmendaten.sql — DATEV-Zuordnung des Mandats (FAHRPLAN Kap. 9).
-- Berater- und Mandantennummer vergibt der Steuerberater; bis dahin gelten
-- die DATEV-Platzhalter (1001 / 1). Als TEXT wie alle Firmendaten-Felder —
-- geprueft wird beim Export.
ALTER TABLE firmendaten
    ADD COLUMN datev_berater TEXT NOT NULL DEFAULT '',
    ADD COLUMN datev_mandant TEXT NOT NULL DEFAULT '';
