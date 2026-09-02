"""Bank-Parser: CSV-Header-Varianten, deutsche Betraege, CAMT.053, Dedup."""

from datetime import date

import pytest

from app.api.pedant.core import bankimport

SPARKASSE_CSV = """﻿"Umsatzanzeige";"Konto DE89...";
"Buchungstag";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"IBAN";"Betrag";"Waehrung"
"15.02.2027";"RE-2027-0001 Stadtverwaltung";"Stadtkasse Musterstadt";"DE12 3456 7890 0000 0000 11";"1.463,11";"EUR"
"16.02.2027";"Miete Februar";"Vermieter GmbH";"DE98765432100000000022";"-950,00";"EUR"
"""

DKB_CSV = """Buchungsdatum,Umsatztext,Name,IBAN,Betrag (EUR)
2027-03-01,Bürobedarf Amazon,AMAZON EU,LU120010012300,-42.50
"""

CAMT_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
 <BkToCstmrStmt><Stmt><Ntry>
   <Amt Ccy="EUR">1463.11</Amt><CdtDbtInd>CRDT</CdtDbtInd>
   <BookgDt><Dt>2027-02-15</Dt></BookgDt>
   <NtryDtls><TxDtls>
     <RltdPties><Dbtr><Nm>Stadtkasse Musterstadt</Nm></Dbtr>
       <DbtrAcct><Id><IBAN>DE12345678900000000011</IBAN></Id></DbtrAcct></RltdPties>
     <RmtInf><Ustrd>RE-2027-0001</Ustrd><Ustrd>Stadtverwaltung</Ustrd></RmtInf>
   </TxDtls></NtryDtls>
 </Ntry><Ntry>
   <Amt Ccy="EUR">950.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>
   <BookgDt><Dt>2027-02-16</Dt></BookgDt>
   <NtryDtls><TxDtls><RmtInf><Ustrd>Miete Februar</Ustrd></RmtInf></TxDtls></NtryDtls>
 </Ntry></Stmt></BkToCstmrStmt></Document>"""


def test_betrag_zu_cent_formate():
    assert bankimport.betrag_zu_cent("1.463,11") == 146311
    assert bankimport.betrag_zu_cent("-950,00") == -95000
    assert bankimport.betrag_zu_cent("-42.50") == -4250
    assert bankimport.betrag_zu_cent("+7") == 700
    with pytest.raises(bankimport.ImportAbgelehnt):
        bankimport.betrag_zu_cent("abc")


def test_sparkassen_csv_mit_metazeilen():
    bewegungen = bankimport.csv_lesen(SPARKASSE_CSV.encode("utf-8"))
    assert len(bewegungen) == 2
    erste = bewegungen[0]
    assert erste.buchungsdatum == date(2027, 2, 15)
    assert erste.betrag_cent == 146311
    assert "RE-2027-0001" in erste.verwendungszweck
    assert erste.gegen_iban == "DE12345678900000000011"   # Leerzeichen raus
    assert bewegungen[1].betrag_cent == -95000


def test_dkb_csv_mit_komma_und_punktbetrag():
    bewegungen = bankimport.csv_lesen(DKB_CSV.encode("utf-8"))
    assert len(bewegungen) == 1
    assert bewegungen[0].betrag_cent == -4250
    assert bewegungen[0].buchungsdatum == date(2027, 3, 1)
    assert bewegungen[0].gegen_name == "AMAZON EU"


def test_unbekannte_kopfzeile_wird_klar_abgelehnt():
    with pytest.raises(bankimport.ImportAbgelehnt, match="kopfzeile"):
        bankimport.csv_lesen(b"foo;bar\n1;2\n")


def test_camt_lesen():
    bewegungen = bankimport.camt_lesen(CAMT_XML)
    assert len(bewegungen) == 2
    eingang, ausgang = bewegungen
    assert eingang.betrag_cent == 146311
    assert eingang.verwendungszweck == "RE-2027-0001 Stadtverwaltung"
    assert eingang.gegen_name == "Stadtkasse Musterstadt"
    assert ausgang.betrag_cent == -95000


def test_datei_weiche_nach_inhalt():
    assert len(bankimport.datei_lesen(CAMT_XML, "auszug.csv")) == 2   # Inhalt gewinnt
    assert len(bankimport.datei_lesen(DKB_CSV.encode(), "umsatz.csv")) == 1


def test_dedup_hash_ist_stabil_und_unterscheidet():
    bewegungen = bankimport.csv_lesen(SPARKASSE_CSV.encode("utf-8"))
    nochmal = bankimport.csv_lesen(SPARKASSE_CSV.encode("utf-8"))
    assert bewegungen[0].dedup_hash() == nochmal[0].dedup_hash()
    assert bewegungen[0].dedup_hash() != bewegungen[1].dedup_hash()
