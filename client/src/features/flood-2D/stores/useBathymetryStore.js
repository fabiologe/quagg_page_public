import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useGeoStore } from './useGeoStore.js';

export const useBathymetryStore = defineStore('bathymetry', () => {

    // ── Vermessungspunkte (terrestrische Messung) ─────────────────────────────
    // DGM kommt aus geoStore.terrain — kein eigenes demData hier.

    /**
     * @type {import('vue').Ref<Array<{x: number, y: number, z: number, label?: string}>>}
     */
    const surveyPoints = ref([]);

    /** Bumped on every setSurveyPoints call (incl. applyOffset) so renderers rebuild. */
    const surveyPointsVersion = ref(0);

    /** @type {import('vue').Ref<string|null>} */
    const surveyFileName = ref(null);

    // ── Validierungsbericht ───────────────────────────────────────────────────

    /**
     * @type {import('vue').Ref<{
     *   status: 'ok'|'warn'|'error',
     *   checks: Array<{id: string, label: string, status: 'ok'|'warn'|'error', detail: string}>,
     *   summary: object
     * }|null>}
     */
    const validationReport = ref(null);

    // ── Pipeline-Zustand ──────────────────────────────────────────────────────

    /**
     * @type {import('vue').Ref<{
     *   n: number, median: number, mad: number, p10: number, p90: number
     * }|null>}
     */
    const offsetDiagnosis = ref(null);

    // IDW-Pinsel: Menge der modifizierten Grid-Indizes + Zähler für UI
    const modifiedCells = ref(/** @type {Set<number>} */ (new Set()));
    const modifiedCount = ref(0);

    /** Cross-Validation Ergebnis */
    const crossValResult = ref(/** @type {{n:number,rmse:number,mae:number,bias:number}|null} */ (null));

    /** Thalweg Ergebnis */
    const thalwegResult = ref(/** @type {{nodes:any[],axis:string,len:number,gradient:number,minZ:number,maxZ:number}|null} */ (null));

    /** Vom Benutzer gezeichnete Kanal-Mittellinie (bestätigt). Array von {x,y,terrainZ}. */
    const channelPolyline = ref(/** @type {Array<{x:number,y:number,terrainZ:number}>} */ ([]))

    /** Flussschlauch-Polygon (bestätigt). Array von {x,y} in Landes-KBS. */
    const channelPolygon = ref(/** @type {Array<{x:number,y:number}>} */ ([]));

    // Virtual raster preview is now managed by useRasterProcessingStore.
    // useBathymetryStore only tracks the zone-ID it owns there.
    const BATHY_ZONE_ID = 'bathymetry-main';

    /** @type {import('vue').Ref<'IDLE'|'STAGE1_DONE'|'RUNNING'|'DONE'|'ERROR'>} */
    const pipelineStatus = ref('IDLE');

    /** @type {import('vue').Ref<number>} */
    const currentStage = ref(0);

    /** @type {import('vue').Ref<number>} */
    const stageProgress = ref(0);

    // ── Computed ──────────────────────────────────────────────────────────────

    const hasDem = computed(() => {
        const geoStore = useGeoStore();
        return geoStore.terrain?.gridData != null;
    });

    const isStage1Ready = computed(() =>
        hasDem.value &&
        surveyPoints.value.length >= 3 &&
        validationReport.value?.status !== 'error'
    );

    // ── Actions ───────────────────────────────────────────────────────────────

    function setSurveyPoints(points, fileName) {
        surveyPoints.value = points;
        surveyFileName.value = fileName;
        validationReport.value = null;
        surveyPointsVersion.value++;
    }

    function setValidation(report) {
        validationReport.value = report;
        if (report.status !== 'error') {
            pipelineStatus.value = 'STAGE1_DONE';
            currentStage.value = 1;
        }
    }

    function markCell(idx)         { modifiedCells.value.add(idx); }
    function addModifiedCount(n)   { modifiedCount.value += n; }
    function setCrossVal(result)   { crossValResult.value = result; }
    function setThalweg(result)    { thalwegResult.value = result; }
    function setChannelPolyline(pts) { channelPolyline.value = pts; }
    function setChannelPolygon(pts)  { channelPolygon.value  = pts; }

    function setOffsetDiagnosis(diag) {
        offsetDiagnosis.value = diag;
        if (diag && currentStage.value < 2) currentStage.value = 2;
    }

    function reset() {
        surveyPoints.value = [];
        surveyFileName.value = null;
        validationReport.value = null;
        offsetDiagnosis.value = null;
        modifiedCells.value = new Set();
        modifiedCount.value = 0;
        crossValResult.value = null;
        thalwegResult.value = null;
        channelPolyline.value = [];
        channelPolygon.value  = [];
        pipelineStatus.value = 'IDLE';
        currentStage.value = 0;
        stageProgress.value = 0;
    }

    return {
        surveyPoints, surveyFileName, surveyPointsVersion,
        validationReport, offsetDiagnosis,
        modifiedCells, modifiedCount,
        crossValResult, thalwegResult,
        channelPolyline, channelPolygon,
        BATHY_ZONE_ID,
        pipelineStatus, currentStage, stageProgress,
        hasDem, isStage1Ready,
        setSurveyPoints, setValidation, setOffsetDiagnosis,
        markCell, addModifiedCount, setCrossVal, setThalweg, setChannelPolyline, setChannelPolygon,
        reset,
    };
});
