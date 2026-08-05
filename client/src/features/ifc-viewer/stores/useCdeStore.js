/**
 * CDE-Store — Projekt-Verwaltung, Bearbeiter-Identität und Dokument-Register.
 *
 * Stufe „Managen" (lokal, Standalone): Projekte mit Stammdaten, ein aktives
 * Projekt, der lokale Bearbeiter-Name (Autor für Issues/Kommentare) und pro
 * Projekt ein Dokument-Register der IFC-Modelle mit ISO-19650-Status.
 *
 * Persistenz komplett über die RepoFacade:
 *   global:                'cde-projects', 'cde-active-project', 'cde-bearbeiter'
 *   scope project:<id>:    'dokumente'
 *
 * Stufe C hebt genau diese Struktur auf den Server: project.id wird dann der
 * StorageBox-Ordnername (z. B. "P9123"), das Register wandert ins manifest.yaml.
 * Statuswechsel werden schon jetzt als Audit-Spur am Dokument mitgeschrieben.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { repo } from '../services/RepoFacade.js';

export const ISO_STATUS = Object.freeze(['WIP', 'Shared', 'Published', 'Archived']);

const KEY_PROJECTS  = 'cde-projects';
const KEY_ACTIVE    = 'cde-active-project';
const KEY_BEARBEITER = 'cde-bearbeiter';
const KEY_DOKUMENTE = 'dokumente';

export const useCdeStore = defineStore('cde', () => {
  // [{ id, nummer, name, bauherr, lph, notiz, createdAt }]
  const projects = ref([]);
  const activeProjectId = ref(null);
  const bearbeiter = ref('');

  // Dokument-Register des aktiven Projekts:
  // [{ sha256, name, size, projectGlobalId, status, revision, addedAt,
  //    statusHistorie: [{status, von, am}] }]
  const dokumente = ref([]);

  const activeProject = computed(() =>
    projects.value.find(p => p.id === activeProjectId.value) ?? null);

  /** Projekt-partitionierte Facade — 'global' solange kein Projekt aktiv ist. */
  function projectRepo() {
    return activeProjectId.value ? repo.withScope(`project:${activeProjectId.value}`) : repo;
  }

  // ── Laden / Initialisierung ────────────────────────────────────────────
  async function _init() {
    const [storedProjects, storedActive, storedBearbeiter] = await Promise.all([
      repo.get(KEY_PROJECTS), repo.get(KEY_ACTIVE), repo.get(KEY_BEARBEITER),
    ]);
    if (Array.isArray(storedProjects)) projects.value = storedProjects;
    if (typeof storedBearbeiter === 'string') bearbeiter.value = storedBearbeiter;
    if (storedActive && projects.value.some(p => p.id === storedActive)) {
      activeProjectId.value = storedActive;
      await _loadDokumente();
    }
  }
  const ready = _init();

  async function _loadDokumente() {
    const stored = await projectRepo().get(KEY_DOKUMENTE);
    dokumente.value = Array.isArray(stored) ? stored : [];
  }
  async function _saveDokumente() {
    await projectRepo().set(KEY_DOKUMENTE, JSON.parse(JSON.stringify(dokumente.value)));
  }

  // ── Projekte ────────────────────────────────────────────────────────────
  async function _saveProjects() {
    await repo.set(KEY_PROJECTS, JSON.parse(JSON.stringify(projects.value)));
  }

  async function createProject({ nummer = '', name = '', bauherr = '', lph = '', notiz = '' } = {}) {
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    projects.value.push({ id, nummer, name, bauherr, lph, notiz, createdAt: Date.now() });
    await _saveProjects();
    await setActiveProject(id);
    return id;
  }

  async function updateProject(id, patch) {
    const p = projects.value.find(x => x.id === id);
    if (!p) return false;
    Object.assign(p, patch);
    await _saveProjects();
    return true;
  }

  /** Projekt + alle projekt-partitionierten Daten löschen. */
  async function deleteProject(id) {
    projects.value = projects.value.filter(p => p.id !== id);
    await _saveProjects();
    await repo.withScope(`project:${id}`).clear();
    if (activeProjectId.value === id) {
      activeProjectId.value = null;
      dokumente.value = [];
      await repo.delete(KEY_ACTIVE);
    }
  }

  async function setActiveProject(id) {
    activeProjectId.value = id;
    if (id) await repo.set(KEY_ACTIVE, id);
    else    await repo.delete(KEY_ACTIVE);
    await _loadDokumente();
  }

  async function setBearbeiter(name) {
    bearbeiter.value = (name ?? '').trim();
    await repo.set(KEY_BEARBEITER, bearbeiter.value);
  }

  // ── Dokument-Register (ISO 19650 light) ─────────────────────────────────

  /**
   * Modell im Register anlegen bzw. auffrischen. Revisionslogik: Dateien mit
   * derselben IfcProject-GlobalId sind Revisionen desselben Dokuments —
   * eine neue sha256 unter bekannter GlobalId bekommt die nächste Revision.
   */
  async function registerModel({ sha256, name, size = 0, projectGlobalId = null }) {
    if (!activeProjectId.value || !sha256) return null;
    let doc = dokumente.value.find(d => d.sha256 === sha256);
    if (doc) {
      doc.name = name ?? doc.name;
      await _saveDokumente();
      return doc;
    }
    const siblings = projectGlobalId
      ? dokumente.value.filter(d => d.projectGlobalId === projectGlobalId)
      : [];
    const revision = siblings.length
      ? Math.max(...siblings.map(d => d.revision ?? 1)) + 1
      : 1;
    doc = {
      sha256, name, size, projectGlobalId,
      status: 'WIP',
      revision,
      addedAt: Date.now(),
      statusHistorie: [{ status: 'WIP', von: bearbeiter.value || '—', am: Date.now() }],
    };
    dokumente.value.push(doc);
    await _saveDokumente();
    return doc;
  }

  /** ISO-19650-Statuswechsel mit Audit-Spur am Dokument. */
  async function setDokumentStatus(sha256, status) {
    if (!ISO_STATUS.includes(status)) return false;
    const doc = dokumente.value.find(d => d.sha256 === sha256);
    if (!doc || doc.status === status) return false;
    doc.status = status;
    doc.statusHistorie = doc.statusHistorie ?? [];
    doc.statusHistorie.push({ status, von: bearbeiter.value || '—', am: Date.now() });
    await _saveDokumente();
    return true;
  }

  async function removeDokument(sha256) {
    dokumente.value = dokumente.value.filter(d => d.sha256 !== sha256);
    await _saveDokumente();
  }

  return {
    ready,
    projects, activeProjectId, activeProject, bearbeiter, dokumente,
    projectRepo,
    createProject, updateProject, deleteProject, setActiveProject, setBearbeiter,
    registerModel, setDokumentStatus, removeDokument,
  };
});
