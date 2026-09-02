#!/bin/bash
# kosit_setup.sh — installiert den KoSIT-Validator-Stack fuer den Pedanten.
# Aufruf: sudo bash kosit_setup.sh    (idempotent)
#
# Bestandteile (Versionen gepinnt, Recherche 2026-08-23):
#   - openjdk-21-jre-headless        (~194 MB; Validator braucht Java >= 11)
#   - validator-1.6.3-standalone.jar (10,6 MB; 1.6.3 zwingend — Security-Fix)
#   - validator-configuration-xrechnung v2026-01-31 fuer XRechnung 3.0.2
#   - xrechnung-testsuite v2026-01-31 (normative Beispiel-Rechnungen, Tests)
set -euo pipefail

ZIEL=/opt/kosit
VALIDATOR_URL="https://github.com/itplr-kosit/validator/releases/download/v1.6.3/validator-1.6.3-standalone.jar"
KONFIG_URL="https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-01-31/xrechnung-3.0.2-validator-configuration-2026-01-31.zip"
TESTSUITE_URL="https://github.com/itplr-kosit/xrechnung-testsuite/releases/download/v2026-01-31/xrechnung-3.0.2-testsuite-2026-01-31.zip"

command -v java >/dev/null || {
    echo ">> installiere openjdk-21-jre-headless"
    DEBIAN_FRONTEND=noninteractive apt-get install -y openjdk-21-jre-headless
}
java -version 2>&1 | head -1

mkdir -p "$ZIEL"
cd "$ZIEL"

holen() { # url zieldatei
    [ -f "$2" ] && { echo ">> $2 liegt schon"; return; }
    echo ">> lade $2"
    curl -fsSL -o "$2.tmp" "$1" && mv "$2.tmp" "$2"
}

holen "$VALIDATOR_URL" validator-1.6.3-standalone.jar
holen "$KONFIG_URL"    xrechnung-3.0.2-validator-configuration-2026-01-31.zip
holen "$TESTSUITE_URL" xrechnung-3.0.2-testsuite-2026-01-31.zip

# python3 -m zipfile statt unzip — unzip ist auf dem Server nicht installiert.
if [ ! -f xrechnung-3.0.2/scenarios.xml ]; then
    echo ">> entpacke Konfiguration"
    python3 -m zipfile -e xrechnung-3.0.2-validator-configuration-2026-01-31.zip xrechnung-3.0.2/
fi
if [ ! -d testsuite/instances ] && [ -z "$(find testsuite -name '*.xml' 2>/dev/null | head -1)" ]; then
    echo ">> entpacke Testsuite"
    python3 -m zipfile -e xrechnung-3.0.2-testsuite-2026-01-31.zip testsuite/
fi

echo ">> Pruefsummen verifizieren (gepinnt 2026-08-23):"
sha256sum -c <<'SUMMEN'
799e64befca97d4080e03608c80b85dd5a5ecc5f4ae4f35d1116ec2855b9a7c9  validator-1.6.3-standalone.jar
6a5a5911a421b25fbc423f62f93f894df7b236f5d73ca4f84bb222a945082704  xrechnung-3.0.2-validator-configuration-2026-01-31.zip
a1e2b26d7de6db6903076d4a8548b66ca603e7b25ad17233202a73cfbfeb29ee  xrechnung-3.0.2-testsuite-2026-01-31.zip
SUMMEN

echo ">> Selbsttest: KoSIT-Beispielrechnung durch den Validator"
BEISPIEL=$(find testsuite -name '01.01a-INVOICE_ubl.xml' | head -1)   # Release-Zip: instances/standard/
PROBE=$(mktemp -d)
cp "$BEISPIEL" "$PROBE/probe.xml"
if java -jar "$ZIEL/validator-1.6.3-standalone.jar" \
        -s "$ZIEL/xrechnung-3.0.2/scenarios.xml" -r "$ZIEL/xrechnung-3.0.2" \
        "$PROBE/probe.xml" >/dev/null 2>&1; then
    echo "OK: Beispielrechnung ist valide — Setup vollstaendig"
else
    echo "FEHLER: Beispielrechnung nicht valide — Setup pruefen"; exit 1
fi
rm -rf "$PROBE"
