// @vitest-environment jsdom
/**
 * Journal der Merkmalsänderungen (Sprint I, Stufe 7).
 *
 * Vorher gab es drei getrennte, nicht rücknehmbare Wege, ein Bauteil zu
 * ändern: eine Map für Kostengruppen, eine für DIN-277-Klassen, und
 * `addPsetToElement`, das direkt ins IFC-Modell schrieb. Wer zuwies,
 * überschrieb — was vorher galt, war weg.
 *
 * Der Kern hier ist, dass **jede Änderung ihren Vorzustand mitführt**. Genau
 * das macht Zurücknehmen möglich, ohne zu raten. Und der Vorzustand wird
 * NICHT vom Aufrufer geliefert, sondern aus dem eigenen Stand gelesen — sonst
 * schreibt jeder Aufrufer seine eigene Vorstellung davon hinein.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen, standAus, letzterOffener } from '../stores/useAenderungen';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('standAus — die Ableitung', () => {
  it('lässt den letzten Eintrag je Bauteil gewinnen', () => {
    const stand = standAus([
      { art: 'kg', globalId: 'A', nachher: '330' },
      { art: 'kg', globalId: 'B', nachher: '340' },
      { art: 'kg', globalId: 'A', nachher: '350' },
    ], 'kg');
    expect(stand.get('A')).toBe('350');
    expect(stand.get('B')).toBe('340');
  });

  it('nimmt bei null wieder heraus — zurück zur Regel', () => {
    // „Keine Handzuweisung" ist etwas anderes als „Zuweisung auf nichts":
    // der Klassifikator soll dann wieder selbst entscheiden.
    const stand = standAus([
      { art: 'kg', globalId: 'A', nachher: '330' },
      { art: 'kg', globalId: 'A', nachher: null },
    ], 'kg');
    expect(stand.has('A')).toBe(false);
  });

  it('trennt die Arten', () => {
    const eintraege = [
      { art: 'kg', globalId: 'A', nachher: '330' },
      { art: 'din277', globalId: 'A', nachher: 'NUF1' },
    ];
    expect(standAus(eintraege, 'kg').get('A')).toBe('330');
    expect(standAus(eintraege, 'din277').get('A')).toBe('NUF1');
  });

  it('überspringt Einträge ohne Bauteil', () => {
    expect(standAus([{ art: 'kg', nachher: '330' }], 'kg').size).toBe(0);
  });
});

describe('Eintragen', () => {
  it('merkt sich, was vorher galt', async () => {
    const ae = useAenderungen();
    await ae.bereit;
    const erste = await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '330', wer: 'Fabio' });
    expect(erste.vorher).toBeNull();

    const zweite = await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '350' });
    expect(zweite.vorher).toBe('330');       // aus dem eigenen Stand, nicht geraten
    expect(ae.kgStand.get('A')).toBe('350');
  });

  it('trägt dieselbe Zuweisung nicht zweimal ein', async () => {
    // Sonst füllt sich das Journal mit Schritten, die nichts tun, und
    // „zurück" braucht mehrere Klicks für einen sichtbaren Effekt.
    const ae = useAenderungen();
    await ae.bereit;
    await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '330' });
    expect(await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '330' })).toBeNull();
    expect(ae.anzahl).toBe(1);
  });

  it('nimmt keine erfundene Art und kein leeres Bauteil', async () => {
    const ae = useAenderungen();
    await ae.bereit;
    expect(await ae.eintragen({ art: 'gibtsnicht', globalId: 'A', nachher: 'x' })).toBeNull();
    expect(await ae.eintragen({ art: 'kg', globalId: '', nachher: 'x' })).toBeNull();
    expect(ae.anzahl).toBe(0);
  });

  it('zählt Schritte und berührte Bauteile getrennt', async () => {
    const ae = useAenderungen();
    await ae.bereit;
    await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '330' });
    await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '350' });
    await ae.eintragen({ art: 'kg', globalId: 'B', nachher: '340' });
    expect(ae.anzahl).toBe(3);
    expect(ae.beruehrteBauteile).toBe(2);
  });
});

describe('Zurücknehmen', () => {
  it('stellt den Vorzustand her', async () => {
    const ae = useAenderungen();
    await ae.bereit;
    await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '330' });
    await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '350' });

    await ae.zurueck('Fabio');
    expect(ae.kgStand.get('A')).toBe('330');

    await ae.zurueck('Fabio');
    expect(ae.kgStand.has('A')).toBe(false);   // zurück zur Regel
  });

  it('auf COMMITS löscht es nicht, sondern trägt einen Gegeneintrag ein', async () => {
    // Die Spur bleibt vollständig: wer nachvollzieht, warum eine Wand in
    // KG 340 zählt, soll auch sehen, dass jemand es zurückgenommen hat.
    // SEIT U2 gilt das für die HISTORIE (Commits); in der offenen Sitzung
    // ist „zurück" ein Unstage — siehe sitzung.test.js.
    const ae = useAenderungen();
    await ae.bereit;
    const hin = await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '330' });
    await ae.commitSitzung('Test', { wer: 'Fabio' });
    // `zurueck` gibt seit Stufe 14.3 eine LISTE — ein mehrteiliger Vorgang
    // wird ganz zurückgenommen. Ein einzelner Schritt ergibt eine Liste mit
    // einem Eintrag.
    const [zurueck] = await ae.zurueck('Fabio');

    expect(ae.anzahl).toBe(2);
    expect(zurueck.ruecknahmeVon).toBe(hin.id);
    expect(zurueck.vorher).toBe('330');
    expect(zurueck.nachher).toBeNull();
    expect(zurueck.vorgang).toBeUndefined();   // ohne Vorgang bleibt alles wie zuvor
  });

  it('geht über die Rücknahme hinweg zum Schritt davor', async () => {
    // Der Denkfehler, den der erste Entwurf hatte: „zurück" nahm beim zweiten
    // Klick die RÜCKNAHME zurück statt den Schritt davor. Man pendelte
    // zwischen zwei Ständen und kam nie über den ersten hinaus — das ist
    // Wiederholen, nicht Zurücknehmen.
    const ae = useAenderungen();
    await ae.bereit;
    const a = await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '330' });
    const b = await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '350' });

    expect(letzterOffener(ae.eintraege).id).toBe(b.id);
    await ae.zurueck();
    expect(letzterOffener(ae.eintraege).id).toBe(a.id);   // nicht die Rücknahme
    await ae.zurueck();
    expect(letzterOffener(ae.eintraege)).toBeNull();
    expect(ae.kannZurueck).toBe(false);
  });

  it('tut nichts, wenn es nichts zurückzunehmen gibt', async () => {
    const ae = useAenderungen();
    await ae.bereit;
    expect(await ae.zurueck()).toEqual([]);   // leere LISTE, nicht null
    expect(ae.anzahl).toBe(0);
  });
});

describe('Verwerfen und Verlauf', () => {
  it('verwirft alle Zuweisungen einer Art, lässt die andere stehen', async () => {
    const ae = useAenderungen();
    await ae.bereit;
    await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '330' });
    await ae.eintragen({ art: 'kg', globalId: 'B', nachher: '340' });
    await ae.eintragen({ art: 'din277', globalId: 'A', nachher: 'NUF1' });

    await ae.verwerfe('kg', 'Fabio');
    expect(ae.kgStand.size).toBe(0);
    expect(ae.din277Stand.get('A')).toBe('NUF1');
    // Auch das Verwerfen steht im Journal.
    expect(ae.anzahl).toBe(5);
  });

  it('zeigt den Verlauf eines Bauteils, neueste zuerst', async () => {
    const ae = useAenderungen();
    await ae.bereit;
    await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '330' });
    await ae.eintragen({ art: 'kg', globalId: 'B', nachher: '999' });
    await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '350' });

    const v = ae.verlauf('A');
    expect(v).toHaveLength(2);
    expect(v[0].nachher).toBe('350');
    expect(v[1].nachher).toBe('330');
  });

  it('überlebt einen Neustart', async () => {
    const ae = useAenderungen();
    await ae.bereit;
    await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '330', wer: 'Fabio' });

    setActivePinia(createPinia());
    const zweiter = useAenderungen();
    await zweiter.bereit;
    expect(zweiter.anzahl).toBe(1);
    expect(zweiter.kgStand.get('A')).toBe('330');
    expect(zweiter.eintraege[0].wer).toBe('Fabio');
  });
});
