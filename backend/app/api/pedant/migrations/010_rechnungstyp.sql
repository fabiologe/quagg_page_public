-- 010_rechnungstyp.sql — Abschlags- und Schlussrechnungen (Projekt-FAHRPLAN 4b).
--
-- rechnungstyp: '380' Handelsrechnung/Schlussrechnung, '326' Abschlagsrechnung (BT-3).
-- rechnungsreferenzen: Vorrechnungen einer Schlussrechnung (BG-3). vorab_cent (BT-113)
-- und zahlbar_cent (BT-115) sind Snapshots beim Stellen; die Forderungsbuchung der
-- Schlussrechnung umfasst nur den zahlbaren Rest — die Abschlaege sind schon gebucht.

ALTER TABLE rechnungen ADD COLUMN rechnungstyp TEXT NOT NULL DEFAULT '380'
    CHECK (rechnungstyp IN ('380', '326'));
ALTER TABLE rechnungen ADD COLUMN vorab_cent BIGINT NOT NULL DEFAULT 0 CHECK (vorab_cent >= 0);
ALTER TABLE rechnungen ADD COLUMN zahlbar_cent BIGINT NULL CHECK (zahlbar_cent IS NULL OR zahlbar_cent >= 0);

CREATE TABLE rechnungsreferenzen (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rechnung_id     BIGINT NOT NULL REFERENCES rechnungen (id),
    vor_rechnung_id BIGINT NOT NULL REFERENCES rechnungen (id),
    UNIQUE (rechnung_id, vor_rechnung_id),
    CHECK (rechnung_id <> vor_rechnung_id)
);
GRANT SELECT, INSERT, DELETE ON rechnungsreferenzen TO pedant_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pedant_app;

-- Referenzen sind wie Positionen: nur solange die Rechnung Entwurf ist.
CREATE TRIGGER referenz_nur_im_entwurf BEFORE INSERT OR UPDATE OR DELETE ON rechnungsreferenzen
    FOR EACH ROW EXECUTE FUNCTION pruefe_position_mutation();

-- Eingefroren nach dem Stellen: jetzt auch Typ und Snapshots.
CREATE OR REPLACE FUNCTION pruefe_rechnung_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'verworfen' THEN
        RAISE EXCEPTION 'rechnung %: verworfen ist endgueltig', OLD.id;
    END IF;
    IF NEW.angelegt_am <> OLD.angelegt_am THEN
        RAISE EXCEPTION 'rechnung %: angelegt_am ist unveraenderlich', OLD.id;
    END IF;
    IF OLD.re_lfd IS NOT NULL AND (NEW.re_lfd IS DISTINCT FROM OLD.re_lfd
                                   OR NEW.re_jahr IS DISTINCT FROM OLD.re_jahr) THEN
        RAISE EXCEPTION 'rechnung %: die rechnungsnummer ist unveraenderlich', OLD.rechnungsnummer;
    END IF;
    IF OLD.re_lfd IS NOT NULL AND NEW.auftraggeber_id <> OLD.auftraggeber_id THEN
        RAISE EXCEPTION 'rechnung %: auftraggeber ist nach nummernvergabe fest', OLD.rechnungsnummer;
    END IF;
    IF NEW.status <> OLD.status AND NOT (
         (OLD.status = 'entwurf'  AND NEW.status IN ('gestellt', 'verworfen'))
      OR (OLD.status = 'gestellt' AND NEW.status = 'bezahlt')
      OR (OLD.status = 'bezahlt'  AND NEW.status = 'gestellt')) THEN
        RAISE EXCEPTION 'rechnung %: uebergang % -> % ist verboten',
            OLD.id, OLD.status, NEW.status;
    END IF;
    IF OLD.status IN ('gestellt', 'bezahlt') THEN
        IF ROW(NEW.auftraggeber_id, NEW.auftrag_referenz, NEW.leitweg_id,
               NEW.rechnungsdatum, NEW.leistung_von, NEW.leistung_bis,
               NEW.steuersatz, NEW.zahlungsziel_tage, NEW.netto_cent,
               NEW.steuer_cent, NEW.brutto_cent, NEW.gestellt_am,
               NEW.xml_pfad, NEW.xml_sha256, NEW.bericht_pfad,
               NEW.buchung_lfd_nr, NEW.verworfen_grund, NEW.projekt_id,
               NEW.rechnungstyp, NEW.vorab_cent, NEW.zahlbar_cent)
           IS DISTINCT FROM
           ROW(OLD.auftraggeber_id, OLD.auftrag_referenz, OLD.leitweg_id,
               OLD.rechnungsdatum, OLD.leistung_von, OLD.leistung_bis,
               OLD.steuersatz, OLD.zahlungsziel_tage, OLD.netto_cent,
               OLD.steuer_cent, OLD.brutto_cent, OLD.gestellt_am,
               OLD.xml_pfad, OLD.xml_sha256, OLD.bericht_pfad,
               OLD.buchung_lfd_nr, OLD.verworfen_grund, OLD.projekt_id,
               OLD.rechnungstyp, OLD.vorab_cent, OLD.zahlbar_cent) THEN
            RAISE EXCEPTION 'rechnung %: nach dem stellen sind nur noch status,'
                ' bezahlt_am und versand_* aenderbar', OLD.rechnungsnummer;
        END IF;
    END IF;
    NEW.aktualisiert_am := now();
    RETURN NEW;
END
$$;
