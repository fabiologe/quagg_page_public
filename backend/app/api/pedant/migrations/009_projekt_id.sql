-- 009_projekt_id.sql — Verzahnung mit dem Projekt-Cockpit (Projekt-FAHRPLAN Kap. 8).
--
-- Haus-Konvention: projekt_id ist die Ordnernummer, KEIN Fremdschluessel
-- (Muster EmailEvent.project_id). abschnitt_id an der Position erlaubt die
-- Kumulation "je Abschnitt bereits gestellt" fuer Abschlagsrechnungen.

ALTER TABLE erwartetes_geld ADD COLUMN projekt_id BIGINT NULL;
CREATE INDEX erwartetes_geld_projekt ON erwartetes_geld (projekt_id) WHERE projekt_id IS NOT NULL;

ALTER TABLE rechnungen ADD COLUMN projekt_id BIGINT NULL;
CREATE INDEX rechnungen_projekt ON rechnungen (projekt_id) WHERE projekt_id IS NOT NULL;

ALTER TABLE rechnungspositionen ADD COLUMN abschnitt_id BIGINT NULL;

-- Nach dem Stellen ist auch der Projektbezug eingefroren: die Funktion aus 005
-- bekommt projekt_id in die verglichene Zeile.
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
               NEW.buchung_lfd_nr, NEW.verworfen_grund, NEW.projekt_id)
           IS DISTINCT FROM
           ROW(OLD.auftraggeber_id, OLD.auftrag_referenz, OLD.leitweg_id,
               OLD.rechnungsdatum, OLD.leistung_von, OLD.leistung_bis,
               OLD.steuersatz, OLD.zahlungsziel_tage, OLD.netto_cent,
               OLD.steuer_cent, OLD.brutto_cent, OLD.gestellt_am,
               OLD.xml_pfad, OLD.xml_sha256, OLD.bericht_pfad,
               OLD.buchung_lfd_nr, OLD.verworfen_grund, OLD.projekt_id) THEN
            RAISE EXCEPTION 'rechnung %: nach dem stellen sind nur noch status,'
                ' bezahlt_am und versand_* aenderbar', OLD.rechnungsnummer;
        END IF;
    END IF;
    NEW.aktualisiert_am := now();
    RETURN NEW;
END
$$;
