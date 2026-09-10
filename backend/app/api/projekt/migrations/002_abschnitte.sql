-- 002_abschnitte.sql — Honorar und Fortschritt (FAHRPLAN Kap. 6/7, Stufe 2).
--
-- Die Primaergroesse ist honorar_cent NETTO je Abschnitt; Anteile werden
-- abgeleitet (Leitentscheidung 4). Nachtraege und Besondere Leistungen sind
-- eigene Abschnitte (art) — kein Promille-Schema, das bei Σ ≠ 100 % bricht.

CREATE TABLE projekt.abschnitte (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    projekt_id         BIGINT NOT NULL REFERENCES projekt.projekte (id),
    nr                 INTEGER NOT NULL CHECK (nr > 0),
    bezeichnung        TEXT NOT NULL CHECK (btrim(bezeichnung) <> ''),
    lph                SMALLINT NULL CHECK (lph IS NULL OR (lph BETWEEN 1 AND 9)),
    art                TEXT NOT NULL DEFAULT 'grund' CHECK (art IN
                       ('grund', 'besondere', 'nachtrag', 'nebenkosten')),
    honorar_cent       BIGINT NOT NULL DEFAULT 0 CHECK (honorar_cent >= 0),   -- netto
    beauftragt         BOOLEAN NOT NULL DEFAULT true,
    fortschritt_prozent SMALLINT NOT NULL DEFAULT 0 CHECK (fortschritt_prozent BETWEEN 0 AND 100),
    status             TEXT NOT NULL DEFAULT 'offen' CHECK (status IN
                       ('offen', 'laufend', 'fertig', 'abgenommen', 'entfallen')),
    angelegt_am        TIMESTAMPTZ NOT NULL DEFAULT now(),
    aktualisiert_am    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (projekt_id, nr)
);
CREATE INDEX abschnitte_projekt ON projekt.abschnitte (projekt_id);

-- Honorarhistorie: append-only. Angebot -> Auftrag -> Nachtrag bleibt nachvollziehbar.
CREATE TABLE projekt.honorar_aenderungen (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    abschnitt_id  BIGINT NOT NULL REFERENCES projekt.abschnitte (id),
    alt_cent      BIGINT NOT NULL,
    neu_cent      BIGINT NOT NULL,
    grund         TEXT NOT NULL DEFAULT '',
    akteur        TEXT NOT NULL,
    am            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX honorar_aenderungen_abschnitt ON projekt.honorar_aenderungen (abschnitt_id);

-- HOAI-Leistungsbilder als GEWICHTUNGSVORLAGE (unverbindlich seit HOAI 2021),
-- editierbar. Prozent je LPH, Summe je Leistungsbild = 100.
CREATE TABLE projekt.leistungsbilder (
    paragraf     TEXT NOT NULL,          -- '35', '39', '43', '47', ...
    jahrgang     SMALLINT NOT NULL,
    titel        TEXT NOT NULL,
    lph          SMALLINT NOT NULL CHECK (lph BETWEEN 1 AND 9),
    bezeichnung  TEXT NOT NULL,
    prozent      SMALLINT NOT NULL CHECK (prozent BETWEEN 0 AND 100),
    PRIMARY KEY (paragraf, jahrgang, lph)
);

-- Rechte
GRANT SELECT, INSERT, UPDATE, DELETE ON projekt.abschnitte          TO pedant_app;
GRANT SELECT, INSERT                 ON projekt.honorar_aenderungen TO pedant_app;
GRANT SELECT, INSERT, UPDATE         ON projekt.leistungsbilder     TO pedant_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA projekt TO pedant_app;

CREATE TRIGGER abschnitte_stempel BEFORE UPDATE ON projekt.abschnitte
    FOR EACH ROW EXECUTE FUNCTION public.stempel_aktualisiert();
CREATE TRIGGER honorar_aenderungen_fest BEFORE UPDATE OR DELETE ON projekt.honorar_aenderungen
    FOR EACH ROW EXECUTE FUNCTION public.sperre_mutation();

-- Seed HOAI 2021. § 43 und § 47 gegen den Gesetzestext verifiziert (2026-08-25);
-- § 35 und § 39 aus der Fachliteratur — editierbar, falls das Buero anders gewichtet.
INSERT INTO projekt.leistungsbilder (paragraf, jahrgang, titel, lph, bezeichnung, prozent) VALUES
 ('43', 2021, 'Ingenieurbauwerke', 1, 'Grundlagenermittlung', 2),
 ('43', 2021, 'Ingenieurbauwerke', 2, 'Vorplanung', 20),
 ('43', 2021, 'Ingenieurbauwerke', 3, 'Entwurfsplanung', 25),
 ('43', 2021, 'Ingenieurbauwerke', 4, 'Genehmigungsplanung', 5),
 ('43', 2021, 'Ingenieurbauwerke', 5, 'Ausführungsplanung', 15),
 ('43', 2021, 'Ingenieurbauwerke', 6, 'Vorbereitung der Vergabe', 13),
 ('43', 2021, 'Ingenieurbauwerke', 7, 'Mitwirkung bei der Vergabe', 4),
 ('43', 2021, 'Ingenieurbauwerke', 8, 'Bauoberleitung', 15),
 ('43', 2021, 'Ingenieurbauwerke', 9, 'Objektbetreuung', 1),
 ('47', 2021, 'Verkehrsanlagen', 1, 'Grundlagenermittlung', 2),
 ('47', 2021, 'Verkehrsanlagen', 2, 'Vorplanung', 20),
 ('47', 2021, 'Verkehrsanlagen', 3, 'Entwurfsplanung', 25),
 ('47', 2021, 'Verkehrsanlagen', 4, 'Genehmigungsplanung', 8),
 ('47', 2021, 'Verkehrsanlagen', 5, 'Ausführungsplanung', 15),
 ('47', 2021, 'Verkehrsanlagen', 6, 'Vorbereitung der Vergabe', 10),
 ('47', 2021, 'Verkehrsanlagen', 7, 'Mitwirkung bei der Vergabe', 4),
 ('47', 2021, 'Verkehrsanlagen', 8, 'Bauoberleitung', 15),
 ('47', 2021, 'Verkehrsanlagen', 9, 'Objektbetreuung', 1),
 ('35', 2021, 'Gebäude und Innenräume', 1, 'Grundlagenermittlung', 2),
 ('35', 2021, 'Gebäude und Innenräume', 2, 'Vorplanung', 7),
 ('35', 2021, 'Gebäude und Innenräume', 3, 'Entwurfsplanung', 15),
 ('35', 2021, 'Gebäude und Innenräume', 4, 'Genehmigungsplanung', 3),
 ('35', 2021, 'Gebäude und Innenräume', 5, 'Ausführungsplanung', 25),
 ('35', 2021, 'Gebäude und Innenräume', 6, 'Vorbereitung der Vergabe', 10),
 ('35', 2021, 'Gebäude und Innenräume', 7, 'Mitwirkung bei der Vergabe', 4),
 ('35', 2021, 'Gebäude und Innenräume', 8, 'Objektüberwachung – Bauüberwachung und Dokumentation', 32),
 ('35', 2021, 'Gebäude und Innenräume', 9, 'Objektbetreuung', 2),
 ('39', 2021, 'Freianlagen', 1, 'Grundlagenermittlung', 3),
 ('39', 2021, 'Freianlagen', 2, 'Vorplanung', 10),
 ('39', 2021, 'Freianlagen', 3, 'Entwurfsplanung', 16),
 ('39', 2021, 'Freianlagen', 4, 'Genehmigungsplanung', 4),
 ('39', 2021, 'Freianlagen', 5, 'Ausführungsplanung', 25),
 ('39', 2021, 'Freianlagen', 6, 'Vorbereitung der Vergabe', 7),
 ('39', 2021, 'Freianlagen', 7, 'Mitwirkung bei der Vergabe', 3),
 ('39', 2021, 'Freianlagen', 8, 'Objektüberwachung – Bauüberwachung und Dokumentation', 30),
 ('39', 2021, 'Freianlagen', 9, 'Objektbetreuung', 2);
