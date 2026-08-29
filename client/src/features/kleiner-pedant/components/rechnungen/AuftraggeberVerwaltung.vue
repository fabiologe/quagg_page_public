<template>
  <PedantKarte titel="Auftraggeber" icon="auftraggeber">
    <template #aktionen>
      <button class="ped-neu" type="button" @click="oeffneNeu">
        <PedantIcon name="plus" :size="14" /> Neu
      </button>
    </template>

    <LeerHinweis v-if="store.auftraggeber.length === 0"
                 text="Noch kein Auftraggeber — für die erste Rechnung anlegen" />
    <ul v-else class="ped-ag-liste">
      <li v-for="eintrag in store.auftraggeber" :key="eintrag.id">
        <div class="ped-ag-name">
          <strong>{{ eintrag.name }}</strong>
          <span class="ped-ag-leitweg">{{ eintrag.leitweg_id }} · {{ PORTAL_NAMEN[eintrag.portal] }}</span>
        </div>
        <button class="ped-ag-edit" type="button" @click="oeffneBearbeiten(eintrag)">
          Bearbeiten
        </button>
      </li>
    </ul>

    <PedantModal
      v-if="offen"
      :titel="bearbeitetId ? 'Auftraggeber bearbeiten' : 'Auftraggeber anlegen'"
      icon="auftraggeber"
      @schliessen="offen = false"
    >
      <div class="ped-ag-form">
        <FormFeld name="Name"><input v-model="form.name" type="text" /></FormFeld>
        <FormFeld name="Leitweg-ID" :fehler="leitwegFehler || ''">
          <input v-model="form.leitweg_id" type="text" placeholder="04011000-12345-03" />
        </FormFeld>
        <FormFeld name="Portal">
          <select v-model="form.portal">
            <option value="zre_rlp">ZRE Rheinland-Pfalz (auch Saarland)</option>
            <option value="zre_bw">ZRE Baden-Württemberg</option>
          </select>
        </FormFeld>
        <div class="ped-ag-reihe">
          <FormFeld name="Straße"><input v-model="form.strasse" type="text" /></FormFeld>
          <FormFeld name="PLZ"><input v-model="form.plz" type="text" /></FormFeld>
          <FormFeld name="Ort"><input v-model="form.ort" type="text" /></FormFeld>
        </div>
        <FormFeld name="E-Mail (Rechnungseingang)"><input v-model="form.email" type="email" /></FormFeld>
        <FormFeld name="Notiz" optional><input v-model="form.notiz" type="text" /></FormFeld>
        <label v-if="bearbeitetId" class="ped-ag-aktiv">
          <input v-model="form.aktiv" type="checkbox" /> aktiv
        </label>
      </div>
      <template #fuss>
        <button class="ped-ag-edit" type="button" @click="offen = false">Abbrechen</button>
        <button class="ped-neu" type="button" :disabled="!speicherbar || sendet" @click="speichern">
          {{ sendet ? 'Speichert…' : 'Speichern' }}
        </button>
      </template>
    </PedantModal>
  </PedantKarte>
</template>

<script setup>
// AuftraggeberVerwaltung — Liste + Modal-Formular mit harter Leitweg-Pruefung.
import { computed, ref } from 'vue';
import { pruefeLeitweg } from '../../services/Leitweg';
import { useStammdatenStore } from '../../stores/useStammdatenStore';
import FormFeld from '../ui/FormFeld.vue';
import LeerHinweis from '../ui/LeerHinweis.vue';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import PedantModal from '../ui/PedantModal.vue';

const PORTAL_NAMEN = { zre_rlp: 'ZRE RLP', zre_bw: 'ZRE BW' };

const store = useStammdatenStore();
const offen = ref(false);
const bearbeitetId = ref(null);
const sendet = ref(false);
const form = ref({});

const leitwegFehler = computed(() =>
  form.value.leitweg_id ? pruefeLeitweg(form.value.leitweg_id) : null);
const speicherbar = computed(() =>
  String(form.value.name || '').trim() && !leitwegFehler.value && form.value.leitweg_id);

function oeffneNeu() {
  bearbeitetId.value = null;
  form.value = { name: '', leitweg_id: '', portal: 'zre_rlp', strasse: '',
                 plz: '', ort: '', email: '', notiz: '' };
  offen.value = true;
}

function oeffneBearbeiten(eintrag) {
  bearbeitetId.value = eintrag.id;
  form.value = { ...eintrag };
  offen.value = true;
}

async function speichern() {
  sendet.value = true;
  try {
    if (bearbeitetId.value) {
      await store.speichereAuftraggeber(bearbeitetId.value, { ...form.value });
    } else {
      await store.legeAuftraggeberAn({ ...form.value });
    }
    offen.value = false;
  } catch {
    // store.fehler wird im Bereichs-Kopf angezeigt
  } finally {
    sendet.value = false;
  }
}
</script>

<style scoped>
.ped-neu {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.65rem;
  border: none;
  border-radius: 6px;
  background: var(--ped-akzent);
  color: var(--ped-akzent-kontrast);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.ped-neu:hover { background: var(--ped-akzent-hover); }
.ped-neu:disabled { opacity: 0.6; }
.ped-ag-liste {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.ped-ag-liste li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--ped-rand);
  border-radius: 6px;
}
.ped-ag-name {
  display: flex;
  flex-direction: column;
  font-size: 0.82rem;
  color: var(--ped-text);
}
.ped-ag-leitweg {
  font-family: var(--ped-mono);
  font-size: 0.72rem;
  color: var(--ped-text-dim);
}
.ped-ag-edit {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--ped-rand-stark);
  border-radius: 6px;
  background: var(--ped-flaeche);
  color: var(--ped-text);
  font-size: 0.76rem;
  cursor: pointer;
}
.ped-ag-edit:hover { border-color: var(--ped-akzent); color: var(--ped-akzent); }
.ped-ag-form { display: flex; flex-direction: column; gap: 0.6rem; }
.ped-ag-reihe { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 0.6rem; }
.ped-ag-aktiv { font-size: 0.8rem; color: var(--ped-text); }
</style>
