-- 007_bankbewegungen.sql — Kontoabgleich per CSV/CAMT (FAHRPLAN Kap. 5+9,
-- Pipeline Kontoabgleich; Kap. 13 Phase fuenf).
--
-- Bankbewegungen sind IMPORTIERTE Fremddaten: die Bankfelder selbst sind nach
-- dem Import unveraenderlich (Trigger), veraenderlich ist nur die Zuordnung.
-- Dedup ueber einen kanonischen Hash — ein erneuter CSV-Import derselben
-- Umsaetze erzeugt keine Dubletten. Betraege sind SIGNIERT (Eingang +, Ausgang -).

CREATE TABLE bankbewegungen (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_datum     TIMESTAMPTZ NOT NULL DEFAULT now(),
    buchungsdatum    DATE NOT NULL,                 -- laut Bank
    betrag_cent      BIGINT NOT NULL CHECK (betrag_cent <> 0),
    verwendungszweck TEXT NOT NULL DEFAULT '',
    gegen_name       TEXT NOT NULL DEFAULT '',
    gegen_iban       TEXT NOT NULL DEFAULT '',
    dedup_hash       CHAR(64) NOT NULL UNIQUE,
    status           TEXT NOT NULL DEFAULT 'unabgeglichen'
        CHECK (status IN ('unabgeglichen', 'zugeordnet', 'ignoriert')),
    rechnung_id      BIGINT NULL REFERENCES rechnungen (id),
    beleg_id         BIGINT NULL REFERENCES belege (id),
    buchung_lfd_nr   BIGINT NULL UNIQUE REFERENCES buchungssaetze (lfd_nr),
    zuordnung_grund  TEXT NOT NULL DEFAULT '',
    CHECK (status <> 'zugeordnet' OR (rechnung_id IS NOT NULL OR beleg_id IS NOT NULL)),
    CHECK (status = 'zugeordnet' OR (rechnung_id IS NULL AND beleg_id IS NULL
                                     AND buchung_lfd_nr IS NULL)),
    CHECK (NOT (rechnung_id IS NOT NULL AND beleg_id IS NOT NULL))
);
CREATE INDEX bankbewegungen_status ON bankbewegungen (status);

GRANT SELECT, INSERT, UPDATE ON bankbewegungen TO pedant_app;   -- KEIN DELETE
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pedant_app;

CREATE TRIGGER bank_kein_delete BEFORE DELETE ON bankbewegungen
    FOR EACH ROW EXECUTE FUNCTION sperre_mutation();

-- Bankfelder sind Fremddaten und bleiben, wie importiert; nur die
-- Zuordnungsfelder duerfen sich bewegen. Loesen einer Fehlzuordnung ist
-- erlaubt (zugeordnet -> unabgeglichen) — die zugehoerige Journalbuchung
-- wird dabei fachlich per Gegenbuchung storniert (core/abgleich.py).
CREATE OR REPLACE FUNCTION pruefe_bank_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.import_datum <> OLD.import_datum
       OR NEW.buchungsdatum <> OLD.buchungsdatum
       OR NEW.betrag_cent <> OLD.betrag_cent
       OR NEW.verwendungszweck <> OLD.verwendungszweck
       OR NEW.gegen_name <> OLD.gegen_name
       OR NEW.gegen_iban <> OLD.gegen_iban
       OR NEW.dedup_hash <> OLD.dedup_hash THEN
        RAISE EXCEPTION 'bankbewegung %: bankfelder sind unveraenderlich', OLD.id;
    END IF;
    IF NEW.status <> OLD.status AND NOT (
         (OLD.status = 'unabgeglichen' AND NEW.status IN ('zugeordnet', 'ignoriert'))
      OR (OLD.status = 'zugeordnet' AND NEW.status = 'unabgeglichen')
      OR (OLD.status = 'ignoriert' AND NEW.status = 'unabgeglichen')) THEN
        RAISE EXCEPTION 'bankbewegung %: uebergang % -> % ist verboten',
            OLD.id, OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER bank_update_regeln BEFORE UPDATE ON bankbewegungen
    FOR EACH ROW EXECUTE FUNCTION pruefe_bank_update();
