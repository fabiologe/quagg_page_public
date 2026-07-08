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
void Coupling_Update(States *Statesptr, Pars *Parptr, Solver *Solverptr, BoundCs *BCptr, Arrays *Arrptr);

// SWMM sauber beenden (Report/Close). No-Op wenn nie geoeffnet.
void Coupling_Finalize(States *Statesptr, const int verbose);

#endif
