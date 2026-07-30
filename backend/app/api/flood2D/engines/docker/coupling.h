// QUAGG 1D/2D-Kopplung: EPA-SWMM 5.2 (1D-Kanalnetz) <-> LISFLOOD-FP (2D-Oberflaeche).
//
// In-Process-Lockstep: LISFLOOD linkt libswmm5 und treibt SWMM aus der IterateQ-Schleife.
// Austausch an den Kopplungsschaechten (Manholes): 2D-Wasserstand ueber Deckel -> Einzug
// ins Rohr; Rohrdruck ueber Deckel -> Ueberstau zurueck ins 2D (4-State-Kopfdifferenz).
//
// AKTIV nur wenn (a) der Build mit -DQUAGG_COUPLING + libswmm5 gelinkt wurde UND
// (b) `couplingfile` in der .par gesetzt ist. Ohne beides: reiner No-Op -> byte-identisch
// zum pristine 8.0.3 (Null-Risiko-Regression, wie die anderen QUAGG-Patches).
#ifndef QUAGG_COUPLING_H
#define QUAGG_COUPLING_H

#include "lisflood.h"

// Oeffnet SWMM (falls couplingfile gesetzt + QUAGG_COUPLING), liest flow.coupling
// (Schacht<->Zelle-Map), setzt Statesptr->coupling = ON. Sonst No-Op.
void Coupling_Init(States *Statesptr, Fnames *Fnameptr, Pars *Parptr, const int verbose);

// Ein Kopplungsschritt. Wird nach `t += Tstep` JEDEN 2D-Zeitschritt aufgerufen:
//  - alle dt_c: SWMM auf die 2D-Zeit vorruecken und die Austauschraten je Schacht neu
//    bestimmen (Kopfdifferenz-Logik; Outfall = NODE_INFLOW + Rueckstau-Stage),
//  - jeden Step: die Raten als Quellterm Q*Tstep/dA auf H anwenden (keine Slug-Injektion)
//    und die Volumina in BCptr->VolInMT/VolOutMT einbuchen (Verror bleibt sauber).
// NUR fuer den klassischen IterateQ-Pfad (SGC == OFF). Der SGC-Pfad laeuft ueber
// Coupling_UpdateFast (s. u.) — lisflood.cpp verzweigt bei SGC == ON nach Fast_MainStart.
void Coupling_Update(States *Statesptr, Pars *Parptr, Solver *Solverptr, BoundCs *BCptr, Arrays *Arrptr);

// ── Fast-Pfad (lisflood2/sgm_fast.cpp, SGC == ON) ─────────────────────────────────
// Der Fast-Pfad alloziert eigene, GEPADETE Gitter (Stride grid_cols_padded) und gibt
// Arrptr->H/DEM/SGCz/dA vor der Zeitschleife FREI — die klassische Update-Variante kann
// dort nichts lesen/schreiben. Zusaetzlich gilt dort eine andere H-Konvention: h_grid ist
// relativ zum DEM (auf Gerinnezellen negativ bis -SGCbfH), Wasserspiegel = dem + h.
// Wasser wird NIE ueber h_grid gebucht (SGC2_ProcessH_Row leitet h zentral aus volume_grid
// ab und wuerde die Aenderung ueberschreiben), sondern ueber volume_grid + Weitung der
// wet_dry_bounds->fp_vol-Zeilengrenzen (Muster SGC2_PointSources_Vol_row).

struct WetDryRowBound;      // lisflood2/DataTypes.h — hier nur als Pointer gefuehrt
struct BoundaryCondition;   // dito (Massenkonto VolInMT/VolOutMT des Fast-Pfads)

// Einmalig VOR der Zeitschleife aus Fast_IterateLoop: gepadete Gitter + Massenkonto
// registrieren. Ohne aktive Kopplung (kein couplingfile) reiner No-Op.
void Coupling_RegisterFastGrid(States *Statesptr,
    NUMERIC_TYPE *h_grid, NUMERIC_TYPE *volume_grid,
    const NUMERIC_TYPE *dem_grid, const NUMERIC_TYPE *SGC_BankFullHeight_grid,
    const NUMERIC_TYPE *cell_area_col,
    WetDryRowBound *wet_dry_bounds, BoundaryCondition *boundary_cond,
    const int grid_cols_padded);

// Ein Kopplungsschritt im Fast-Pfad. Aus dem seriellen `#pragma omp single`-Block der
// Zeitschleife aufgerufen (nach dem t-Vorruecken, nach dem fp_vol-Reset) — gleiche
// Logik wie Coupling_Update, aber Volumen-Buchung statt H-Buchung.
void Coupling_UpdateFast(States *Statesptr, Pars *Parptr, Solver *Solverptr,
    const NUMERIC_TYPE delta_time);

// SWMM sauber beenden (Report/Close). No-Op wenn nie geoeffnet.
void Coupling_Finalize(States *Statesptr, const int verbose);

#endif
