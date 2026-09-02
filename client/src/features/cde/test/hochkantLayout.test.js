/**
 * T5 — das Hochkant-Layout: Viewer oben, Panels als Bodenblätter.
 *
 * Die Lehre aus flood-3D (dort gebaut und wieder AUSGEBAUT, 17
 * Überlappungen): feste Breiten in Inline-Stilen schlagen jede Media Query,
 * und ein nachgerüstetes Stapeln scheitert daran. Deshalb wachen hier drei
 * Zusagen: die Breite ist ein Token (kein Inline-width), der Breakpoint ist
 * in beiden Dateien DERSELBE, und die Grid-Zeilen sind deterministisch.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const wurzel = new URL('..', import.meta.url);
const panel = readFileSync(new URL('components/ui/CdePanel.vue', wurzel), 'utf8');
const view  = readFileSync(new URL('views/CdeView.vue', wurzel), 'utf8');

/** Alle max-width-Breakpoints einer Datei (nur Media Queries). */
function breakpoints(text) {
    return [...text.matchAll(/@media[^{]*max-width:\s*(\d+)px/g)].map(m => Number(m[1]));
}

describe('Hochkant (T5)', () => {
    it('die Panel-Breite ist ein Token — KEIN Inline-width', () => {
        // Ein `:style="{ width: … }"` gewönne gegen jede Media Query.
        expect(panel).not.toMatch(/:style="\{\s*width/);
        expect(panel).toContain("'--cp-breite'");
        expect(panel).toMatch(/width:\s*var\(--cp-breite/);
    });

    it('beide Dateien tragen DENSELBEN Breakpoint', () => {
        const bpPanel = breakpoints(panel);
        const bpView  = breakpoints(view);
        expect(bpPanel.length).toBeGreaterThan(0);
        expect(bpView.length).toBeGreaterThan(0);
        expect(new Set([...bpPanel, ...bpView]).size).toBe(1);
    });

    it('im Hochkant ist die Arbeitsfläche ein Grid mit bestimmten Zeilen', () => {
        // Grid statt flex-wrap: die Zeilenhöhen hängen sonst am
        // align-content-Verteiler, nicht an einer Angabe.
        const block = view.slice(view.indexOf('T5: Hochkant'));
        expect(block).toContain('display: grid');
        expect(block).toMatch(/\.cde-viewer-host\s*\{\s*grid-row:\s*1;\s*grid-column:\s*1\s*\/\s*-1/);
        expect(block).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)\s*auto/);
    });

    it('ein einzelnes Blatt nimmt die volle Breite — beide teilen sich die Zeile', () => {
        expect(view).toMatch(/:not\(:has\(> \.side-right\)\)[^{]*\.side-left\s*\{\s*grid-column:\s*1\s*\/\s*-1/);
        expect(view).toMatch(/:not\(:has\(> \.side-left\)\)[^{]*\.side-right\s*\{\s*grid-column:\s*1\s*\/\s*-1/);
    });

    it('der Seitengriff verschwindet — quer gibt es nichts zu greifen', () => {
        const block = panel.slice(panel.indexOf('T5: Hochkant'));
        expect(block).toMatch(/\.cp-grip\s*\{\s*display:\s*none/);
    });
});
