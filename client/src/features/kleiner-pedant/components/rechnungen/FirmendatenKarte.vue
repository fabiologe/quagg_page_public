<template>
  <PedantKarte titel="Eigene Firmendaten" icon="firma">
    <template #aktionen>
      <StatusPille
        :zustand="store.firmaVollstaendig ? 'ok' : 'warnung'"
        :text="store.firmaVollstaendig ? 'vollständig' : 'unvollständig'"
      />
    </template>

    <p v-if="!store.firmaVollstaendig && store.firma" class="ped-fehlt">
      Für die XRechnung fehlt: {{ store.firma.fehlend.join(', ') }}
    </p>

    <form v-if="form" class="ped-firma" @submit.prevent="speichern">
      <div class="ped-firma-reihe">
        <FormFeld name="Firmenname"><input v-model="form.name" type="text" /></FormFeld>
        <FormFeld name="Rechtsform" optional><input v-model="form.rechtsform_zusatz" type="text" placeholder="UG (haftungsbeschränkt)" /></FormFeld>
      </div>
      <div class="ped-firma-reihe">
        <FormFeld name="Straße"><input v-model="form.strasse" type="text" /></FormFeld>
        <FormFeld name="PLZ"><input v-model="form.plz" type="text" /></FormFeld>
        <FormFeld name="Ort"><input v-model="form.ort" type="text" /></FormFeld>
      </div>
      <div class="ped-firma-reihe">
        <FormFeld name="USt-ID" optional><input v-model="form.ust_id" type="text" placeholder="DE…" /></FormFeld>
        <FormFeld name="Steuernummer" optional><input v-model="form.steuernummer" type="text" /></FormFeld>
      </div>
      <div class="ped-firma-reihe">
        <FormFeld name="IBAN"><input v-model="form.iban" type="text" /></FormFeld>
        <FormFeld name="BIC" optional><input v-model="form.bic" type="text" /></FormFeld>
        <FormFeld name="Bank" optional><input v-model="form.bank_name" type="text" /></FormFeld>
      </div>
      <div class="ped-firma-reihe">
        <FormFeld name="Ansprechpartner"><input v-model="form.ansprechpartner" type="text" /></FormFeld>
        <FormFeld name="Telefon"><input v-model="form.telefon" type="text" /></FormFeld>
        <FormFeld name="E-Mail"><input v-model="form.email" type="email" /></FormFeld>
      </div>
      <div class="ped-firma-reihe">
        <FormFeld name="DATEV-Beraternummer" optional><input v-model="form.datev_berater" type="text" placeholder="1001 (Platzhalter)" /></FormFeld>
        <FormFeld name="DATEV-Mandantennummer" optional><input v-model="form.datev_mandant" type="text" placeholder="1" /></FormFeld>
      </div>
      <button class="ped-speichern" type="submit" :disabled="sendet">
        <PedantIcon :name="sendet ? 'laden' : 'ok'" :size="14" />
        {{ sendet ? 'Speichert…' : 'Firmendaten speichern' }}
      </button>
    </form>
  </PedantKarte>
</template>

<script setup>
// FirmendatenKarte — die einmaligen Verkaeuferdaten der XRechnung.
import { ref, watch } from 'vue';
import { useStammdatenStore } from '../../stores/useStammdatenStore';
import FormFeld from '../ui/FormFeld.vue';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import StatusPille from '../ui/StatusPille.vue';

const store = useStammdatenStore();
const form = ref(null);
const sendet = ref(false);

const FELDER = ['name', 'rechtsform_zusatz', 'strasse', 'plz', 'ort',
  'steuernummer', 'ust_id', 'iban', 'bic', 'bank_name',
  'email', 'telefon', 'ansprechpartner', 'datev_berater', 'datev_mandant'];

watch(() => store.firma, (firma) => {
  if (firma && !form.value) {
    form.value = Object.fromEntries(FELDER.map((feld) => [feld, firma[feld] || '']));
  }
}, { immediate: true });

async function speichern() {
  sendet.value = true;
  try {
    await store.speichereFirma({ ...form.value });
  } catch {
    // Meldung steht in store.fehler (Bereichs-Kopf zeigt sie)
  } finally {
    sendet.value = false;
  }
}
</script>

<style scoped>
.ped-fehlt {
  margin: 0 0 0.7rem;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  background: var(--ped-warn-weich);
  color: var(--ped-warn);
  font-size: 0.78rem;
}
.ped-firma {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.ped-firma-reihe {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.6rem;
}
.ped-speichern {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.45rem 0.9rem;
  border: none;
  border-radius: 6px;
  background: var(--ped-akzent);
  color: var(--ped-akzent-kontrast);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}
.ped-speichern:hover { background: var(--ped-akzent-hover); }
.ped-speichern:disabled { opacity: 0.6; cursor: wait; }
</style>
