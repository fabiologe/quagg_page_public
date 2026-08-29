// @vitest-environment jsdom
// Reproduktion des Prod-Befunds vom 24.08.: Positionen liessen sich nicht erfassen.
// Verdacht: die Tabelle baut ihre Zeilen bei jedem Eltern-Update neu und
// formatiert dabei die Eingabe waehrend des Tippens um ("9" -> "9,00 €").
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import PositionenTabelle from '../components/rechnungen/PositionenTabelle.vue';

function montiert() {
  const positionen = ref([]);
  const ansicht = mount({
    components: { PositionenTabelle },
    setup: () => ({ positionen }),
    template: '<PositionenTabelle v-model:positionen="positionen" />',
  });
  return { ansicht, positionen };
}

describe('PositionenTabelle', () => {
  it('laesst den Nutzer zeichenweise tippen, ohne die Eingabe umzuformatieren', async () => {
    const { ansicht, positionen } = montiert();
    const felder = ansicht.findAll('input');
    const [bezeichnung, menge, , preis] = [felder[0], felder[1], null, felder[2]];

    await bezeichnung.setValue('Planung');
    await menge.setValue('12,5');
    // Preis zeichenweise wie ein Mensch: "9" ist schon ein gueltiger Betrag
    await preis.setValue('9');
    await nextTick();
    await preis.setValue('95');
    await nextTick();

    expect(preis.element.value).toBe('95');            // NICHT "9,00 €5"
    expect(positionen.value).toHaveLength(1);
    expect(positionen.value[0].einzelpreis_cent).toBe(9500);
    expect(positionen.value[0].menge_tausendstel).toBe(12500);
  });

  it('uebernimmt gespeicherte Positionen beim Belegwechsel', async () => {
    const positionen = ref([{ bezeichnung: 'Alt', menge_tausendstel: 2000,
                              einheit: 'C62', einzelpreis_cent: 4200 }]);
    const ansicht = mount({
      components: { PositionenTabelle },
      setup: () => ({ positionen }),
      template: '<PositionenTabelle v-model:positionen="positionen" />',
    });
    const felder = ansicht.findAll('input');
    expect(felder[0].element.value).toBe('Alt');
    expect(felder[1].element.value).toBe('2');
  });
});
