import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useIfcStore = defineStore('ifc-viewer', () => {
  const selectedElement = ref(null);
  const psetError       = ref(null);
  const modelLoaded     = ref(false);

  // Spatial tree (set after IFC load)
  const spatialTree = ref(null);

  // Loaded model list [{modelId, name}]
  const modelList = ref([]);

  // Engine actions registered by IfcViewer
  let _psetHandler    = null;
  let _storeyHandler  = null;

  function setElement(el) {
    selectedElement.value = el;
    psetError.value = null;
  }

  function clearElement() {
    selectedElement.value = null;
    psetError.value = null;
  }

  function setPsetError(msg) {
    psetError.value = msg;
  }

  function setSpatialTree(tree) {
    spatialTree.value = tree;
  }

  function setModelList(list) {
    modelList.value = list;
  }

  function registerPsetHandler(fn) {
    _psetHandler = fn;
  }

  function registerSpatialHandler(fn) {
    _storeyHandler = fn;
  }

  async function addPset(psetName, props) {
    if (!_psetHandler) { psetError.value = 'Kein Viewer verbunden'; return; }
    await _psetHandler(psetName, props);
  }

  async function setStoreyVisible(localId, visible) {
    await _storeyHandler?.(localId, visible);
  }

  return {
    selectedElement, psetError, modelLoaded, spatialTree, modelList,
    setElement, clearElement, setPsetError,
    setSpatialTree, setModelList,
    registerPsetHandler, registerSpatialHandler,
    addPset, setStoreyVisible,
  };
});
