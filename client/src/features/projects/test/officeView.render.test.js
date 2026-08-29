// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('../services/ProjekteApi', () => ({
  default: {
    wopiSession: vi.fn(async () => ({ editor_url: 'https://quagg-engineering.org/onlyoffice/hosting/wopi/word/edit?wopisrc=x',
      access_token: 'tok', access_token_ttl: 123 })),
    lesen: vi.fn(async () => ({ id: 1338, name: 'Kanal Musterhausen' })),
  },
}));

import ProjekteApi from '../services/ProjekteApi';
import OfficeView from '../views/OfficeView.vue';

async function oeffne(pfad) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/office', component: OfficeView }] });
  router.push(pfad);
  await router.isReady();
  return mount(OfficeView, { global: { plugins: [router] }, attachTo: document.body });
}

describe('OfficeView (Standalone-Tab)', () => {
  it('holt die WOPI-Sitzung und lädt den Editor per Formular ins Vollbild-iframe', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    const w = await oeffne('/office?projekt=1338&pfad=03_Schriftverkehr%2FAnschreiben.docx');
    await flushPromises();
    expect(ProjekteApi.wopiSession).toHaveBeenCalledWith(1338, '03_Schriftverkehr/Anschreiben.docx');
    expect(w.find('form').attributes('action')).toContain('/onlyoffice/hosting/wopi/word/edit');
    expect(w.find('input[name="access_token"]').element.value).toBe('tok');
    expect(w.find('iframe.prj-office-editor').exists()).toBe(true);
    expect(submit).toHaveBeenCalled();
    expect(w.text()).toContain('Anschreiben.docx');
    expect(w.text()).toContain('#P1338');
    submit.mockRestore();
    w.unmount();
  });

  it('meldet einen fehlenden Aufruf statt leer zu bleiben', async () => {
    const w = await oeffne('/office');
    await flushPromises();
    expect(w.text()).toContain('Aufruf ohne Projekt oder Datei');
    w.unmount();
  });
});
