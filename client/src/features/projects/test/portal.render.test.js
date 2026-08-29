// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(async (url) => ({ data: url === '/portal/projekte' ? [{
    id: 1338, name: 'Kanal Musterhausen', phase: '01_Laufend', phase_titel: 'in Bearbeitung', fortschritt_prozent: 37.5,
    abschnitte: [{ nr: 1, bezeichnung: 'LPH 1', lph: 1, fortschritt_prozent: 100, status: 'fertig', beauftragt: true, anteil: 0.2 },
      { nr: 2, bezeichnung: 'LPH 2', lph: 2, fortschritt_prozent: 20, status: 'laufend', beauftragt: true, anteil: 0.5 },
      { nr: 3, bezeichnung: 'LPH 3', lph: 3, fortschritt_prozent: 0, status: 'offen', beauftragt: false, anteil: 0.3 }],
    termine: [{ art: 'abgabe', bezeichnung: 'Entwurf', faellig_am: '2027-03-01', ueberfaellig: false }],
    beteiligte: [], stand: '2026-08-26' }] : [] })) },
}));
vi.mock('@/components/layout/ClientLayout.vue', () => ({ default: { name: 'ClientLayout', template: '<div><slot /></div>' } }));

import ClientProjectsView from '@/views/client/ClientProjectsView.vue';

describe('Kundenportal', () => {
  it('zeigt freigegebene Projekte mit Balken und Terminen, aber ohne Beträge', async () => {
    const w = mount(ClientProjectsView);
    await flushPromises();
    const text = w.text();
    expect(text).toContain('Kanal Musterhausen');
    expect(text).toContain('in Bearbeitung');
    expect(text).toContain('37.5 %');
    expect(text).toContain('01.03.2027');
    expect(w.findAll('.prj-pk-seg')).toHaveLength(3);
    expect(w.findAll('.prj-pk-seg-nicht')).toHaveLength(1);
    expect(text).not.toMatch(/€/);
    w.unmount();
  });
});
