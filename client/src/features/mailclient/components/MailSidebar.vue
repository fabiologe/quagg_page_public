<template>
  <aside class="mail-sidebar">
    <header class="mail-sidebar-kopf">
      <div class="mail-sidebar-marke">
        <MailIcon name="ungelesen" :size="20" />
        <span>Quagg Mail</span>
      </div>
      <div class="mail-sidebar-konto" :title="store.konto">{{ store.konto || '—' }}</div>
    </header>

    <button v-if="store.darfBearbeiten" class="mail-btn ist-primaer mail-sidebar-verfassen" @click="store.oeffneComposer('neu')">
      <MailIcon name="verfassen" />
      Verfassen
    </button>

    <nav class="mail-sidebar-ordner" aria-label="Ordner">
      <button
        v-for="o in ORDNER"
        :key="o.id"
        class="mail-sidebar-eintrag"
        :class="{ 'ist-aktiv': store.ordner === o.id }"
        :data-ordner="o.id"
        @click="store.wechsleOrdner(o.id)"
      >
        <MailIcon :name="o.icon" />
        <span class="mail-sidebar-label">{{ o.label }}</span>
        <span v-if="o.id === 'inbox' && store.ungelesen > 0" class="mail-badge ist-akzent">
          {{ store.ungelesen }}
        </span>
      </button>
    </nav>

    <div class="mail-sidebar-fuss">
      <button class="mail-btn ist-klein" title="Aktualisieren" @click="store.aktualisiere()">
        <MailIcon name="aktualisieren" :size="16" :class="{ 'mail-drehend': store.ladeStatus === 'laedt' }" />
      </button>
      <button class="mail-btn ist-klein" title="Einstellungen: Signatur und Anhänge" @click="store.einstellungenOffen = true">
        <MailIcon name="einstellungen" :size="16" />
      </button>
      <button class="mail-btn ist-klein" :title="store.theme === 'dark' ? 'Helles Design' : 'Dunkles Design'" @click="store.wechsleTheme()">
        <MailIcon :name="store.theme === 'dark' ? 'hell' : 'dunkel'" :size="16" />
      </button>
      <router-link to="/intern" class="mail-btn ist-klein" title="Zurück zum internen Bereich">
        <MailIcon name="dashboard" :size="16" />
      </router-link>
    </div>
  </aside>
</template>

<script setup>
import MailIcon from './MailIcon.vue'
import { useMailStore, ORDNER } from '../stores/useMailStore'

const store = useMailStore()
</script>

<style scoped>
.mail-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 10px 10px;
  background: var(--mail-flaeche);
  overflow: hidden;
}
.mail-sidebar-kopf { padding: 0 6px; }
.mail-sidebar-marke {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: var(--mail-akzent);
}
.mail-sidebar-konto {
  margin-top: 2px;
  font-size: 12px;
  color: var(--mail-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mail-sidebar-verfassen { width: 100%; min-height: 40px; }
.mail-sidebar-ordner {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.mail-sidebar-eintrag {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--mail-radius-klein);
  background: transparent;
  color: var(--mail-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.mail-sidebar-eintrag:hover { background: var(--mail-flaeche-2); }
.mail-sidebar-eintrag.ist-aktiv {
  background: var(--mail-akzent-weich);
  color: var(--mail-akzent);
  font-weight: 600;
}
.mail-sidebar-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mail-sidebar-fuss {
  display: flex;
  gap: 2px;
  padding-top: 8px;
  border-top: 1px solid var(--mail-rand);
}
.mail-sidebar-fuss .mail-btn { flex: 1; text-decoration: none; }
</style>
