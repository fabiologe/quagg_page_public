# Fahrplan: GPU-Rechenort für Riesennetze (flood-3D)

Stand 2026-08-12, nach Recherche. Ziel: interFoam-Läufe mit > 1 Mio. Zellen
in Stunden statt Tagen — und die Frage, was davon auf Fabios RX 6700 XT
lokal möglich ist.

## Rechercheergebnis in vier Sätzen

1. **GPU beschleunigt bei interFoam den Drucklöser**, nicht den ganzen Code:
   PETSc4Foam + NVIDIA AmgX liefert ~7× auf dem Drucklöser (8-Mio.-Zellen-Fall,
   V100); da der Druck 50–70 % der Laufzeit ausmacht, bleiben **gesamt
   realistisch 2–4×** (Amdahl). OpenFOAM **v2606** (Juni 2026) hat diese
   GPU-Anbindung erstmals offiziell an Bord; als Zusatzmodul läuft
   PETSc4Foam auch mit unserem eingefrorenen **v2406**.
2. **Herstellerneutral** (NVIDIA + AMD + Intel) geht über **OGL/Ginkgo**
   (OpenFOAM Ginkgo Layer, exaFOAM/EXASIM): gleiche Idee, Backend CUDA
   *oder* HIP/ROCm *oder* SYCL. Reifegrad: Forschungsnähe, aber aktiv
   gepflegt; Overhead durch LDU→CSR-Konvertierung ist der bekannte Haken.
3. **Die RX 6700 XT (RDNA2, gfx1032) ist unter Windows/WSL2 eine Sackgasse:**
   ROCm auf WSL2 unterstützt offiziell nur RDNA3+ (RX 7000/9000). Ein
   Docker-Container unter Docker Desktop sieht die 6700 XT für ROCm/HIP
   **nicht**. Nativ unter Linux liefe sie nur mit inoffiziellem
   `HSA_OVERRIDE_GFX_VERSION`-Trick.
4. **FluidX3D** (Lattice-Boltzmann, OpenCL, läuft auf JEDER GPU inkl. 6700 XT
   direkt unter Windows, mit VOF-Freispiegel) wäre technisch der einzige Weg,
   diese Karte heute zu nutzen — scheidet aber doppelt aus: **Lizenz nur für
   nichtkommerzielle Nutzung**, und es ist eine andere Physik (LBM statt
   FVM/interFoam) — für ein Nachweiswerkzeug nicht ohne eigene, teure
   Validierung zulässig.

## Harte Wahrheit zur 6700 XT

Ein lokaler GPU-Pod, der **interFoam** auf der 6700 XT rechnet, ist mit
vertretbarem Aufwand **nicht baubar**:

| Weg | Blocker |
|---|---|
| Docker/WSL2 + ROCm | RDNA2 nicht in der WSL-Matrix — Container sieht die GPU nicht |
| Dual-Boot Linux + HSA-Override | inoffiziell/fragil; und selbst dann: nur der Drucklöser wird schneller, gesamt ~2×, 12 GB VRAM deckeln bei ~5 Mio. Zellen |
| FluidX3D (OpenCL, ginge!) | Lizenz nichtkommerziell + andere Physik → kein Nachweis |

**Zukunftssicher ist der Plan trotzdem:** Ab einer RDNA3/RDNA4-Karte
(RX 7800 XT, 9070 …) unterstützt ROCm WSL2 offiziell — dann läuft dasselbe
GPU-Image aus Stufe G2 unverändert lokal. Die Karte ist der fehlende
Baustein, nicht die Software.

## Der Fahrplan

**Grundsatz wie immer:** dieselbe Physik an allen Rechenorten. GPU ändert nur
den *Löser* des Druck-Gleichungssystems; Ergebnisse müssen die eingefrorene
Verifikation (C_d-Band) bestehen, sonst kein Rollout.

### G0 — Messlatte (½ Tag)
Referenzfall „Riesennetz": Rentrisch-Geometrie mit ~1,5 Mio. Zellen,
10 s Simulationszeit. Gemessen auf RunPod 16 vCPU (heutiger bester Ort).
**Tor für alles Weitere: GPU muss > 2× Wanduhr bringen, bei C_d im Band.**
Nebenmessung: RunPod 32-vCPU-CPU-Pod (kostet gleich viel je vCPU) — falls
der die Bandbreitenkrise von 943k Zellen löst, verschiebt sich die
GPU-Dringlichkeit.

### G1 — GPU-Image für RunPod (CUDA, der Riesennetz-Arbeitsgaul) (2–3 Tage)
- Image `quagg-foam-gpu:2406-cuda`: unser v2406 + PETSc4Foam + AmgX
  (AmgXWrapper), `FROM` nvidia/cuda-Basis; Versions-Riegel
  (`FOAM_API_ERWARTET`) bleibt — v2406 überall.
- Umschaltung NUR über `fvSolution`: `p_rgh`-Löser → petsc/amgx; ein Flag
  `gpu: true` in der Fallbeschreibung, der Läufer wählt das Schema.
- RunPod-GPU-Endpunkt (RTX 4090, ~0,35–0,70 $/h; 24 GB VRAM ≈ 10–15 Mio.
  Zellen Drucksystem). Worker/Relay/Import: unverändert — nur anderes Image
  und Endpunkt-ID.
- **Verifikation auf GPU neu laufen lassen**; C_d-Band prüfen. Erst dann in
  der Rechenort-Auswahl anbieten („RunPod GPU — für Netze ab ~1 Mio. Zellen").

### G2 — Herstellerneutral (OGL/Ginkgo) (2 Tage, parallelisierbar)
- Gleiches Image + OGL als zweites Löser-Backend (Ginkgo: CUDA und HIP aus
  demselben Code). Benchmark gegen AmgX auf dem G0-Fall.
- Zweck: nicht von NVIDIA-Preisen abhängen (RunPod hat auch AMD-Instanzen),
  und der lokale Weg für künftige RDNA3+-Karten ist damit fertig.

### G3 — Lokaler GPU-Pod (wenn die Karte es kann)
- Voraussetzung: RDNA3+ (ROCm/WSL2 offiziell) oder NVIDIA-Karte.
- Dann: Companion erkennt GPU (`/dev/dxg` bzw. nvidia-Runtime), bietet
  „Lokal (GPU)" an, zieht `quagg-foam-gpu` mit dem passenden Backend.
- Für die 6700 XT: **kein Produktpfad.** Optionaler Bastelpfad (Dual-Boot +
  Override) bewusst nicht eingeplant.

### Parkliste (bewusst NICHT)
- FluidX3D-Integration (Lizenz + Physik)
- NeoFOAM/NeoN (GPU-Neuentwicklung des OpenFOAM-Kerns; 2026 noch Prototyp —
  jährlich neu bewerten)
- RapidCFD/AmgX-Forks älterer OpenFOAM-Stände (Wartungsfalle)

## Erwartung ehrlich beziffert

| Fall (1,5 Mio. Zellen, 10 s) | heute (16 vCPU) | Ziel G1 (RTX 4090) |
|---|---:|---:|
| Wanduhr | ~10–15 h (Bandbreiten-Knick!) | **3–5 h** |
| Kosten | ~6–9 $ | ~2–4 $ |

Der Gewinn kommt aus zwei Richtungen zugleich: Drucklöser auf der GPU
(2–4×) **und** GPU-Speicherbandbreite (1 TB/s statt der CPU-Krise, die wir
bei 943k Zellen gemessen haben).

## Quellen

- [ROCm WSL-Kompatibilitätsmatrix (RDNA3+)](https://rocm.docs.amd.com/projects/radeon-ryzen/en/docs-6.4.4/docs/compatibility/compatibilityrad/wsl/wsl_compatibility.html)
- [OpenFOAM v2606 Release (GPU-Support offiziell)](https://www.openfoam.com/news/main-news/openfoam-v2606)
- [AmgX für OpenFOAM — 7× auf dem Drucklöser, V100, 8M Zellen (NVIDIA/ESI)](https://wiki.openfoam.com/images/a/a4/OpenFOAM_2020_NVIDIA_Martineau.pdf)
- [OGL — OpenFOAM Ginkgo Layer (CUDA/HIP/SYCL)](https://github.com/hpsim/OGL)
- [Plattformportables LA-Backend für OpenFOAM (Meccanica 2024)](https://link.springer.com/article/10.1007/s11012-024-01806-1)
- [EXASIM-Projekt (OGL/NeoN)](https://exasim-project.com/)
- [FluidX3D (OpenCL, VOF; Lizenz nichtkommerziell)](https://github.com/ProjectPhysX/FluidX3D)
- [Stand GPU-OpenFOAM 2026 (Überblick)](https://www.hivenet.com/post/openfoam-gpu-state-of-play)
