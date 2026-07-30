// QUAGG 1D/2D-Kopplung — Implementierung. Siehe coupling.h.
//
// Ohne -DQUAGG_COUPLING sind alle drei Funktionen No-Ops (coupling bleibt OFF),
// sodass der pristine-Build (ohne libswmm5) unveraendert kompiliert und byte-identisch
// laeuft. Der Docker-Build definiert QUAGG_COUPLING und linkt libswmm5.
//
// Kopplungsprinzip (Massenbilanz je Knoten, + = Raster erhaelt Wasser):
//  - Alle dt_c Sekunden wird SWMM auf die 2D-Zeit vorgerueckt und je Schacht eine
//    Austauschrate bestimmt; die wird dann JEDEN 2D-Zeitschritt als Quellterm
//    H += Q*Tstep/dA angewendet (kein instantaner Volumen-Slug -> keine Druckstoesse/
//    CFL-Schocks im acceleration-Schema, kein "Wasser-Blitzen" an den Schaechten).
//  - Jede getauschte m3 wird in LISFLOODs Massenkonten (BCptr->VolInMT/VolOutMT)
//    eingebucht -> Verror in res.mass bleibt echt (vorher: Kopplungswasser == Fehler).
//
// JUNCTION/STORAGE — bidirektionales Deckel-Wehr ueber die KOPFDIFFERENZ:
//    Q = Cw*dh*sqrt(g*dh), dh = Oberwasser - max(Unterwasser, rim).
//    wse2d > head1d  -> 2D->1D: Einzug als positiver LATFLOW.
//    head1d > wse2d  -> 1D->2D: Netz flutet uebers Deckel-Wehr; Entnahme als NEGATIVER
//                       LATFLOW, gleiche Menge ins Raster (Schacht braucht dafuer im
//                       coupled-Export grosses SurDepth = Druckabfluss statt SWMM-
//                       internem Fluten). Physik bleibt: Ueberstau erreicht das Gelaende,
//                       aber massenexakt und ohne Ping-Pong.
//    Stabilisierung der expliziten Kopplung: Qeq-Limiter (max. 1/4 der Kopfdifferenz
//    pro Intervall), Kappung auf 2D-/1D-Volumen, 50/50-Relaxation des LATFLOW.
//    Notventil: flutet SWMM doch intern (SurDepth klein), wird NODE_OVERFLOW waehrend
//    der SWMM-Schritte INTEGRIERT (Momentanraten-Sampling erzeugt Phantom-Wasser) und
//    als Pool ratenkontrolliert ins Raster ausgeliefert.
// OUTFALL — Austrittspunkt des Netzes: NODE_INFLOW wird waehrend der SWMM-Schritte
//    integriert und ins Raster ausgeliefert (NODE_OVERFLOW ist an Outfalls immer 0 ->
//    vorher ging Auslass-Wasser komplett verloren). Bewusst KEINE Stage-Rueckkopplung
//    (positive Rueckkopplung + unbilanzierter Rueckfluss).

#include "coupling.h"

#ifdef QUAGG_COUPLING

#include <cstdio>
#include <cstring>
#include <cmath>
#include <cstdlib>   // realpath
#include <climits>   // PATH_MAX

// Fast-Pfad-Typen (WetDryRowBound/IndexRange/BoundaryCondition) — zieht ../lisflood.h
// per #pragma once erneut, harmlos.
#include "lisflood2/DataTypes.h"

extern "C" {
#include "swmm5.h"
}

// ---- flow.coupling Format (Text, wie flow.weir; Weltkoordinaten) ----------------
//   Zeile 1:  <inp-datei> <dt_c[s]> <n>
//   n Zeilen: <swmm-node-id> <x> <y> <rim[mNN]> <Cw> <Amax>
// Cw  = Wehr-/Rost-Koeffizient (buendelt Cd*L); Q = Cw * head * sqrt(g*head).
// Amax= max. Austauschrate-Kappung [m3/s] (0 = nur durch 2D-Volumen begrenzt).

static const int    MAXN = 8192;
static const double GRAV = 9.81;
static const double HMIN = 1.0e-3;    // Mindest-Wassertiefe/-Head fuer Austausch [m]
static const int    SWMM_TYPE_OUTFALL = 1;   // enums.h: JUNCTION=0, OUTFALL=1, ...

static bool   g_open = false;
static double g_dt_c = 1.0;
static double g_next_t = 0.0;
static double g_swmm_elapsed_s = 0.0;
static bool   g_swmm_done = false;
static bool   g_done_logged = false;
static int    g_n = 0;
static char   g_name[MAXN][64];
static int    g_nodeIdx[MAXN];
static int    g_cell[MAXN];
static int    g_col[MAXN], g_row[MAXN];   // Zelle (nur fuer Diagnose-Log)
static double g_x[MAXN], g_y[MAXN];       // Weltkoordinate (nur fuer Diagnose-Log)
static double g_rim[MAXN];
static double g_Cw[MAXN];
static double g_Amax[MAXN];
static bool   g_isOutfall[MAXN];
static bool   g_skip[MAXN];     // Zelle unbrauchbar (NoData-DEM) -> Knoten deaktiviert
static double g_Q[MAXN];        // Wehr-Rate [m3/s], + = 1D->2D (ins Raster)
static double g_acc[MAXN];      // integriertes 1D->2D-Volumen seit letztem Refresh [m3]
                                //   (Outfall-INFLOW bzw. Junction-OVERFLOW, in advance_swmm_to
                                //    aufsummiert - Momentanraten-Sampling wuerde Wasser
                                //    erzeugen/vernichten)
static double g_pend[MAXN];     // noch auszulieferndes 1D->2D-Volumen [m3]
static double g_prate[MAXN];    // Ausliefer-Rate fuer g_pend [m3/s]
static double g_lat[MAXN];      // zuletzt gesetzter LATFLOW [m3/s] (fuer Relaxation)
static double g_sumIn[MAXN];    // kumulativ 1D->2D [m3]
static double g_sumOut[MAXN];   // kumulativ 2D->1D [m3]
static double g_debt = 0.0;     // m3, die SWMM erhielt, die das 2D nicht liefern konnte
static double g_next_log = 0.0;
static double g_log_int = 60.0; // [COUPLE]-Statuszeile alle X Sim-Sekunden

// ---- Fast-Pfad (lisflood2, SGC == ON): gepadete Gitter, via Coupling_RegisterFastGrid ----
// Der Fast-Pfad gibt Arrptr->H/DEM/SGCz/dA vor der Zeitschleife FREI und arbeitet auf
// eigenen Arrays mit Stride gf_cols_padded. h_grid ist dort RELATIV ZUM DEM gefuehrt
// (auf Gerinnezellen negativ bis -SGCbfH) -> Wasserspiegel = dem + h, universell.
static bool g_fast = false;
static NUMERIC_TYPE *gf_h = NULL;
static NUMERIC_TYPE *gf_vol = NULL;              // Zellvolumen [m3] — EINZIGER Schreibkanal
static const NUMERIC_TYPE *gf_dem = NULL;
static const NUMERIC_TYPE *gf_bfH = NULL;        // Bankfull-Tiefe (0 ohne Gerinne)
static const NUMERIC_TYPE *gf_area_col = NULL;   // Zellflaeche je Zeile (latlong-korrekt)
static WetDryRowBound *gf_wdb = NULL;
static BoundaryCondition *gf_bc = NULL;
static int gf_cols_padded = 0;

static inline int fidx(int k) { return g_col[k] + g_row[k] * gf_cols_padded; }

// Roh-DEM (NoData-Pruefung/Diagnose)
static inline double cell_dem_raw(Arrays *Arrptr, int k)
{
    return g_fast ? (double)gf_dem[fidx(k)] : Arrptr->DEM[g_cell[k]];
}
// Wasserspiegel der Zelle
static inline double cell_wse(States *Statesptr, Arrays *Arrptr, int k);
// Bezugshoehe (Boden, auf dem das Wasser steht — Kanalsohle auf Gerinnezellen)
static inline double cell_bed(States *Statesptr, Arrays *Arrptr, int k);
// verfuegbares Wasser-VOLUMEN [m3] — auf Gerinnezellen unter bankfull ist h*dA um den
// Faktor dA/(Kanalbreite*dx) zu gross; der Fast-Pfad liest darum direkt volume_grid.
static inline double cell_avail_vol(Pars *Parptr, Arrays *Arrptr, int k)
{
    if (g_fast) {
        const double v = (double)gf_vol[fidx(k)];
        return (v > 0.0) ? v : 0.0;
    }
    const double h = Arrptr->H[g_cell[k]];
    return ((h > 0.0) ? h : 0.0) * Parptr->dA;
}
// Zellflaeche (Stabilitaets-Limiter)
static inline double cell_area(Pars *Parptr, int k)
{
    return g_fast ? (double)gf_area_col[g_row[k]] : Parptr->dA;
}

// Wasser im Fast-Pfad buchen: NUR ueber volume_grid (SGC2_ProcessH_Row leitet h daraus
// ab und wuerde ein direktes h_grid-Update im naechsten Schritt ueberschreiben) — plus
// Weitung der fp_vol-Zeilengrenzen (Muster SGC2_PointSources_Vol_row, sgm_fast.cpp:2421ff):
// ohne sie wird eine frisch benetzte Floodplain-Zelle von ProcessH_Row nicht besucht und
// das gebuchte Volumen laege unsichtbar herum.
static inline void fast_add_volume(int k, double dV)
{
    const int fi = fidx(k);
    double v = (double)gf_vol[fi] + dV;
    if (v < 0.0) v = 0.0;
    gf_vol[fi] = (NUMERIC_TYPE)v;
    IndexRange *r = &gf_wdb->fp_vol[g_row[k]];
    if (g_col[k] < r->start)   r->start = g_col[k];
    if (g_col[k] + 1 > r->end) r->end   = g_col[k] + 1;
}

void Coupling_Init(States *Statesptr, Fnames *Fnameptr, Pars *Parptr, const int verbose)
{
    g_open = false;
    if (Fnameptr->couplingfilename[0] == '\0') return;   // kein couplingfile -> No-Op

    FILE *fp = fopen(Fnameptr->couplingfilename, "r");
    if (fp == NULL) {
        printf("WARNING: couplingfile '%s' nicht lesbar - Kopplung deaktiviert\n",
               Fnameptr->couplingfilename);
        return;
    }

    char inp[512];
    if (fscanf(fp, "%511s %lf %d", inp, &g_dt_c, &g_n) != 3) {
        printf("WARNING: couplingfile Kopfzeile ungueltig - Kopplung deaktiviert\n");
        fclose(fp);
        return;
    }
    if (g_dt_c <= 0.0) g_dt_c = 1.0;
    if (g_n > MAXN) g_n = MAXN;

    // WICHTIG: SWMM einen ABSOLUTEN .inp-Pfad geben. Bug in dieser SWMM-Version:
    // getAbsolutePath() ruft bei RELATIVEM Pfad realpath(fname, InpDir) auf, wobei
    // InpDir nur MAXFNAME+1 (~260) Byte gross ist -> realpath (bis PATH_MAX) sprengt
    // den Puffer ("buffer overflow detected", SIGABRT). Ein absoluter Pfad nimmt den
    // sicheren strncpy-Zweig. Wir loesen daher hier via realpath auf.
    char inp_abs[PATH_MAX];
    if (realpath(inp, inp_abs) == NULL)
        snprintf(inp_abs, sizeof(inp_abs), "%s", inp);   // Fallback (z. B. schon absolut)

    char rpt[PATH_MAX + 8], out[PATH_MAX + 8];
    snprintf(rpt, sizeof(rpt), "%s.rpt", inp_abs);
    snprintf(out, sizeof(out), "%s.out", inp_abs);
    int err = swmm_open(inp_abs, rpt, out);
    if (err != 0) { printf("WARNING: swmm_open('%s') err=%d - Kopplung deaktiviert\n", inp, err); fclose(fp); return; }
    err = swmm_start(1);
    if (err != 0) { printf("WARNING: swmm_start err=%d - Kopplung deaktiviert\n", err); swmm_close(); fclose(fp); return; }

    int k = 0;
    for (int i = 0; i < g_n; i++) {
        char name[256]; double x, y, rim, Cw, Amax;
        if (fscanf(fp, "%255s %lf %lf %lf %lf %lf", name, &x, &y, &rim, &Cw, &Amax) != 6) break;
        int idx = swmm_getIndex(swmm_NODE, name);
        if (idx < 0) { printf("[COUPLE] WARNING: Schacht '%s' nicht in SWMM-Netz - uebersprungen\n", name); continue; }
        int xi = (int)floor((x - Parptr->blx) / Parptr->dx);
        int yi = Parptr->ysz - 1 - (int)floor((y - Parptr->bly) / Parptr->dy);
        if (xi < 0 || xi >= Parptr->xsz || yi < 0 || yi >= Parptr->ysz) {
            printf("[COUPLE] WARNING: Schacht '%s' (%.2f,%.2f) ausserhalb des Rasters - uebersprungen\n", name, x, y);
            continue;
        }
        const int cell = xi + yi * Parptr->xsz;

        g_nodeIdx[k] = idx;
        g_cell[k]    = cell;
        g_col[k] = xi; g_row[k] = yi;
        g_x[k] = x; g_y[k] = y;
        g_rim[k]     = rim;
        g_Cw[k]      = Cw;
        g_Amax[k]    = Amax;
        snprintf(g_name[k], sizeof(g_name[k]), "%s", name);
        g_isOutfall[k] = ((int)swmm_getValue(swmm_NODE_TYPE, idx) == SWMM_TYPE_OUTFALL);
        g_skip[k] = false;
        g_Q[k] = 0.0; g_acc[k] = 0.0; g_pend[k] = 0.0; g_prate[k] = 0.0; g_lat[k] = 0.0;
        g_sumIn[k] = 0.0; g_sumOut[k] = 0.0;
        k++;
    }
    g_n = k;
    fclose(fp);

    // Doppelbelegung einer Zelle nur melden (Einzugs-Kappung rechnet je Knoten).
    for (int a = 0; a < g_n; a++)
        for (int b = a + 1; b < g_n; b++)
            if (g_cell[a] == g_cell[b])
                printf("[COUPLE] WARNING: Schaechte '%s' und '%s' teilen sich Zelle %d - Austausch dort ggf. ueberzeichnet\n",
                       g_name[a], g_name[b], g_cell[a]);

    g_open = true;
    g_next_t = 0.0;
    g_next_log = 0.0;
    g_log_int = (g_dt_c * 15.0 > 60.0) ? g_dt_c * 15.0 : 60.0;
    g_swmm_elapsed_s = 0.0;
    g_swmm_done = false;
    g_done_logged = false;
    g_debt = 0.0;
    Statesptr->coupling = ON;
    printf("[COUPLE] aktiv: %d Schacht<->Zelle-Paare, dt_c=%.2f s, inp=%s\n", g_n, g_dt_c, inp);
    (void)verbose;
}

// SWMM bis zur 2D-Zeit t_target [s] vorruecken. Dabei die 1D->2D-Volumina INTEGRIEREN
// (Outfall-Abfluss, Notventil-Ueberstau): Momentanraten am Intervallende zu samplen
// wuerde bei oszillierendem DYNWAVE-Abfluss systematisch Wasser erzeugen/vernichten.
static void advance_swmm_to(double t_target)
{
    double elapsed_days = 0.0;
    while (!g_swmm_done && g_swmm_elapsed_s < t_target) {
        int err = swmm_step(&elapsed_days);
        if (err != 0) { g_swmm_done = true; break; }
        double new_s = elapsed_days * 86400.0;
        if (new_s <= g_swmm_elapsed_s) { g_swmm_done = true; break; } // Ende der SWMM-Dauer
        const double dts = new_s - g_swmm_elapsed_s;
        for (int k = 0; k < g_n; k++) {
            if (g_skip[k]) continue;
            const double q = g_isOutfall[k]
                ? swmm_getValue(swmm_NODE_INFLOW, g_nodeIdx[k])
                : swmm_getValue(swmm_NODE_OVERFLOW, g_nodeIdx[k]);
            if (q > 0.0) g_acc[k] += q * dts;
        }
        g_swmm_elapsed_s = new_s;
    }
}

// Austauschraten je Schacht neu bestimmen (alle dt_c). rimEff = max(rim, DEM) wird hier
// lazily beim ersten Refresh geklemmt (im Init ist Arrptr noch nicht verfuegbar).
// Bezugshoehe der Zelle ("wo liegt der Boden, auf dem das Wasser steht").
//
// OHNE Sub-Grid-Channel ist das die DEM. MIT SGC steht das Wasser einer Gerinnezelle auf
// der KANALSOHLE, nicht auf der Bank-Oberkante: LISFLOOD fuehrt Arrptr->H dort relativ zu
// SGCz. Die eigene .elev-Ausgabe des Solvers rechnet deshalb ebenfalls SGCz+H
// (output.cpp: write_ascfile(..., Arrptr->H, Arrptr->SGCz, 3, ...)), und sgc.cpp setzt
// SGCz auf NICHT-Gerinnezellen explizit gleich der DEM ("to allow easy water surface
// elevation outputs"). SGCz+H ist damit die universell richtige Formel und faellt ohne
// Gerinne exakt auf DEM+H zurueck.
//
// Vorher rechnete die Kopplung stur DEM+H. Auf einer Gerinnezelle war der 2D-Wasser-
// spiegel damit um die volle Bankfull-Tiefe (DEM-SGCz) zu hoch: der Solver "sah" dort
// dauerhaft Wasser bis Gelaendeoberkante -> Dauereinzug ins Netz und blockierte
// 1D->2D-Abgabe. Genau deswegen hat der Client Kopplungsknoten auf Gerinnezellen bisher
// ausgeschlossen (couplingDetector.js) — also gerade den haeufigsten Fall, den
// Rohr->Gerinne-Auslauf.
static inline double cell_zref(States *Statesptr, Arrays *Arrptr, int cell)
{
    if (Statesptr->SGC == ON && Arrptr->SGCz != NULL) return Arrptr->SGCz[cell];
    return Arrptr->DEM[cell];
}

// Modus-uebergreifende Accessoren (Definition nach cell_zref; Deklaration oben).
// Fast-Pfad: dem/bfH/h aus den gepadeten Gittern — bfH ist 0 auf Nicht-Gerinnezellen,
// damit fallen beide Formeln dort exakt auf DEM bzw. DEM+h zurueck.
static inline double cell_bed(States *Statesptr, Arrays *Arrptr, int k)
{
    if (g_fast) return (double)gf_dem[fidx(k)] - (double)gf_bfH[fidx(k)];
    return cell_zref(Statesptr, Arrptr, g_cell[k]);
}
static inline double cell_wse(States *Statesptr, Arrays *Arrptr, int k)
{
    if (g_fast) return (double)gf_dem[fidx(k)] + (double)gf_h[fidx(k)];
    return cell_zref(Statesptr, Arrptr, g_cell[k]) + Arrptr->H[g_cell[k]];
}

static void refresh_rates(States *Statesptr, Pars *Parptr, Solver *Solverptr, Arrays *Arrptr)
{
    static bool rimChecked = false;
    if (!rimChecked) {
        rimChecked = true;
        for (int k = 0; k < g_n; k++) {
            const double demRaw = cell_dem_raw(Arrptr, k);
            const double bedZ   = cell_bed(Statesptr, Arrptr, k);
            // Diagnose-Tabelle: WO landet jeder Kopplungsschacht wirklich? (Zelle col,row
            // top-down + Weltkoordinate + Hoehen). Damit ist "Wasser kommt an der falschen
            // Stelle raus" sofort pruefbar (Randzelle? andere Position als der Marker?).
            printf("[COUPLE] Schacht '%s' %s -> Zelle (%d,%d) @ Welt(%.2f, %.2f), rim=%.2f, Sohle=%.2f%s\n",
                   g_name[k], g_isOutfall[k] ? "OUTFALL " : "JUNCTION", g_col[k], g_row[k],
                   g_x[k], g_y[k], g_rim[k], (demRaw >= 1.0e9) ? -9999.0 : bedZ,
                   (g_col[k] == 0 || g_row[k] == 0 || g_col[k] == Parptr->xsz - 1 || g_row[k] == Parptr->ysz - 1)
                       ? "  << RANDZELLE!" : "");
            if (demRaw >= 1.0e9) {   // DEM_NO_DATA (1e10) bzw. nodata_elevation: Zelle ist maskiert
                printf("[COUPLE] WARNING: Schacht '%s' liegt auf einer NoData-Zelle - deaktiviert "
                       "(Austausch dort wuerde Wasser ausserhalb des Gelaendes erzeugen)\n", g_name[k]);
                g_skip[k] = true;
                continue;
            }
            // Deckel-Klemmung gegen die BEZUGSHOEHE (Kanalsohle auf Gerinnezellen): ein
            // Rohr-Auslauf am Gerinne darf unterhalb der Bankoberkante abgeben — Klemmung
            // gegen das DEM wuerde ihn kuenstlich auf Bankniveau heben.
            if (g_rim[k] < bedZ - 0.02) {
                printf("[COUPLE] WARNING: Schacht '%s': Deckel rim=%.2f liegt %.2f m UNTER der Bezugshoehe (%.2f) - "
                       "angehoben (fehlendes coverZ im Export?)\n",
                       g_name[k], g_rim[k], bedZ - g_rim[k], bedZ);
                g_rim[k] = bedZ;
            }
        }
    }

    const double hmin = (Solverptr->DepthThresh > HMIN) ? Solverptr->DepthThresh : HMIN;

    for (int k = 0; k < g_n; k++) {
        if (g_skip[k]) { g_Q[k] = 0.0; continue; }
        const int idx  = g_nodeIdx[k];
        const double dA = cell_area(Parptr, k);
        // Wasserspiegel modus-uebergreifend: klassisch SGCz+H, fast dem+h (h relativ DEM).
        const double wse2d = cell_wse(Statesptr, Arrptr, k);

        // Integriertes 1D->2D-Volumen (Outfall-Abfluss bzw. Notventil-Ueberstau) in den
        // Ausliefer-Pool uebernehmen: wird ratenkontrolliert ueber das naechste Intervall
        // ins Raster gegeben - exakt die Menge, die SWMM abgegeben/verworfen hat.
        g_pend[k] += g_acc[k];
        const bool hadOverflow = (!g_isOutfall[k] && g_acc[k] > 0.0);
        g_acc[k] = 0.0;
        g_prate[k] = g_pend[k] / g_dt_c;

        if (g_isOutfall[k]) {
            // Auslass: Netz-Abfluss (NODE_INFLOW, integriert) ins Raster - massenexakt,
            // SWMM verwirft an FREE-Outfalls genau diese Menge. BEWUSST keine Stage-
            // Rueckkopplung: eine FIXED-Stage aus dem 2D-WSE koppelt positiv zurueck
            // (Stau -> Head steigt -> Wehr drueckt mehr -> WSE steigt ...) und Rueck-
            // fluss INS Netz waere nicht bilanziert (NODE_INFLOW zaehlt ihn nicht).
            g_Q[k] = 0.0;
            continue;
        }

        const double head1d = swmm_getValue(swmm_NODE_HEAD, idx);
        const double rim    = g_rim[k];

        // Bidirektionales Deckel-Wehr ueber die KOPFDIFFERENZ (wse2d vs. SWMM-Head).
        // Der Schacht soll im coupled-Modus NICHT SWMM-intern fluten (grosses SurDepth
        // -> Druckabfluss); Rueckgabe ins Raster laeuft als NEGATIVER LATFLOW. Damit ist
        // der Austausch auf BEIDEN Seiten exakt dieselbe Menge - das Rate-Sampling von
        // NODE_OVERFLOW (Momentanwert, der nach LATFLOW=0 sofort kollabiert) hat vorher
        // Wasser ERZEUGT (Einzug/Ueberstau-Ping-Pong = wandernde Phantom-Quellen).
        double lat = 0.0;                     // + = Zufluss in den Schacht [m3/s]
        if (hadOverflow) {
            // Notventil: SWMM flutet doch (SurDepth zu klein, ALLOW_PONDING NO) - das
            // integrierte Volumen liegt schon im Pool. Kein neuer Einzug (lat=0,
            // Relaxation laesst einen alten LATFLOW sanft auslaufen).
        } else {
            const double hu = (wse2d > head1d) ? wse2d : head1d;      // Oberwasser
            const double lo = (wse2d < head1d) ? wse2d : head1d;
            const double hd = (lo > rim) ? lo : rim;                  // Unterwasser >= Krone
            const double dh = hu - hd;
            double Q = 0.0;
            if (dh > hmin && hu > rim + hmin)
                Q = g_Cw[k] * dh * sqrt(GRAV * dh);
            if (g_Amax[k] > 0.0 && Q > g_Amax[k]) Q = g_Amax[k];

            // Stabilitaets-Limiter der expliziten Kopplung: pro Intervall hoechstens ein
            // Viertel der Kopfdifferenz ausgleichen (bezogen auf die 2D-Zelle). SWMM-
            // Slot-Schaechte haben winzige Flaechen -> ihr Head springt; ohne diesen
            // Deckel schaukelt sich der Austausch auf (Wehr-Q ~ dh^1.5 -> Explosion).
            const double Qeq = 0.25 * dh * dA / g_dt_c;
            if (Q > Qeq) Q = Qeq;

            if (Q > 0.0 && wse2d > head1d) {
                // 2D -> 1D: Einzug, gekappt auf das im Intervall verfuegbare 2D-Volumen.
                // Volumenbasiert: auf Gerinnezellen (Fast-Pfad) waere h*dA um den Faktor
                // Zellflaeche/Kanalflaeche zu gross.
                const double Qmax2d = cell_avail_vol(Parptr, Arrptr, k) / g_dt_c;
                if (Q > Qmax2d) Q = Qmax2d;
                // Bilanz-Schulden abtragen: was SWMM frueher zu viel bekam, jetzt weniger.
                if (g_debt > 0.0 && Q > 0.0) {
                    const double red = g_debt / g_dt_c;
                    if (red >= Q) { g_debt -= Q * g_dt_c; Q = 0.0; }
                    else          { Q -= red; g_debt = 0.0; }
                }
                lat = Q;
            } else if (Q > 0.0) {
                // 1D -> 2D: Netz drueckt (head1d > wse2d, ueber Deckel) -> Entnahme aus
                // dem Schacht (negativer LATFLOW), gleiche Menge ins Raster. Gekappt auf
                // das tatsaechlich im Schacht gespeicherte Volumen (nie mehr entnehmen,
                // als drin ist -> SWMM-Kontinuitaet bleibt sauber).
                const double vol1d = swmm_getValue(swmm_NODE_VOLUME, idx);
                if (Q > vol1d / g_dt_c) Q = vol1d / g_dt_c;
                lat = -Q;
            }
        }
        // Relaxation: LATFLOW-Spruenge glaetten (50/50 mit dem letzten Wert). Abrupte
        // Stufen-Anregung laesst SWMMs DYNWAVE am Slot-Schacht springen -> grosse
        // SWMM-Kontinuitaetsfehler = im Netz "erzeugtes" Wasser.
        lat = 0.5 * lat + 0.5 * g_lat[k];
        if (lat > -1e-9 && lat < 1e-9) lat = 0.0;
        g_lat[k] = lat;
        g_Q[k] = -lat;
        swmm_setValue(swmm_NODE_LATFLOW, idx, lat);
    }
}

// Status-/Bilanzzeile — von beiden Update-Pfaden geteilt (Format wird von handler.py
// geparst: coupling_budget; NICHT aendern ohne handler.py-Regexe zu pruefen).
static void log_status(double t)
{
    if (t < g_next_log) return;
    double sumIn = 0.0, sumOut = 0.0; int active = 0;
    for (int k = 0; k < g_n; k++) {
        sumIn += g_sumIn[k]; sumOut += g_sumOut[k];
        if (g_Q[k] != 0.0 || g_pend[k] > 0.0) active++;
    }
    printf("[COUPLE] t=%.1fs: %d/%d Schaechte aktiv | 1D->2D gesamt %.2f m3 | 2D->1D gesamt %.2f m3 | offene Bilanz-Schuld %.3f m3\n",
           t, active, g_n, sumIn, sumOut, g_debt);
    for (int k = 0; k < g_n; k++) {
        const double qEff = g_Q[k] + ((g_pend[k] > 0.0) ? g_prate[k] : 0.0);
        if (qEff == 0.0 && g_sumIn[k] == 0.0 && g_sumOut[k] == 0.0) continue;
        printf("[COUPLE]   %-16s %s Q=%+.4f m3/s (Sum 1D->2D %.2f m3, 2D->1D %.2f m3)\n",
               g_name[k], g_isOutfall[k] ? "OUTFALL " : "JUNCTION", qEff, g_sumIn[k], g_sumOut[k]);
    }
    do { g_next_log += g_log_int; } while (g_next_log <= t);
}

void Coupling_Update(States *Statesptr, Pars *Parptr, Solver *Solverptr, BoundCs *BCptr, Arrays *Arrptr)
{
    if (!g_open || Statesptr->coupling != ON) return;

    // (A) Raten-Refresh alle dt_c (SWMM lockstep vorruecken).
    if (Solverptr->t >= g_next_t) {
        advance_swmm_to(Solverptr->t);
        if (g_swmm_done && !g_done_logged) {
            g_done_logged = true;
            printf("[COUPLE] t=%.1fs: SWMM-Simulationsdauer zu Ende - Netz liefert/nimmt ab jetzt nichts mehr "
                   "(END_TIME der network.inp < 2D-Dauer?)\n", Solverptr->t);
        }
        refresh_rates(Statesptr, Parptr, Solverptr, Arrptr);
        do { g_next_t += g_dt_c; } while (g_next_t <= Solverptr->t);
    }

    // (B) Raten als Quellterm anwenden - jeden 2D-Step, anteilig mit Tstep.
    const double dt = Solverptr->Tstep;
    const double dA = Parptr->dA;
    for (int k = 0; k < g_n; k++) {
        const int cell = g_cell[k];

        // 1D -> 2D aus dem Ausliefer-Pool (Outfall/Ueberstau, integriert): rate-
        // kontrolliert, aber nie mehr als der Pool hergibt -> exakt konservativ.
        if (g_pend[k] > 0.0 && g_prate[k] > 0.0) {
            double dV = g_prate[k] * dt;
            if (dV > g_pend[k]) dV = g_pend[k];
            g_pend[k]       -= dV;
            Arrptr->H[cell] += dV / dA;
            BCptr->VolInMT  += dV;           // Massenkonto: Zufluss in die 2D-Domaene
            g_sumIn[k]      += dV;
        }

        const double Q = g_Q[k];
        if (Q > 0.0) {                       // 1D -> 2D (Netz drueckt uebers Deckel-Wehr)
            const double dV = Q * dt;
            Arrptr->H[cell] += dV / dA;
            BCptr->VolInMT  += dV;
            g_sumIn[k]      += dV;
        } else if (Q < 0.0) {                // 2D -> 1D (Einzug in den Schacht)
            const double want = -Q * dt;
            const double have = Arrptr->H[cell] * dA;
            const double dV   = (want < have) ? want : have;
            if (dV > 0.0) {
                Arrptr->H[cell] -= dV / dA;
                BCptr->VolOutMT += dV;       // Massenkonto: Abfluss aus der 2D-Domaene
                g_sumOut[k]     += dV;
            }
            // SWMM bekommt LATFLOW kontinuierlich - lieferte das 2D weniger (Zelle
            // leergelaufen), als Schuld merken und beim naechsten Refresh verrechnen.
            if (want > dV) g_debt += want - dV;
        }
    }

    // (C) Periodische Status-/Bilanzzeile (landet via handler.py in der Solver-Konsole).
    log_status(Solverptr->t);
}

// ── Fast-Pfad (SGC == ON): identische Logik, aber gepadete Gitter + Volumen-Buchung ──

void Coupling_RegisterFastGrid(States *Statesptr,
    NUMERIC_TYPE *h_grid, NUMERIC_TYPE *volume_grid,
    const NUMERIC_TYPE *dem_grid, const NUMERIC_TYPE *SGC_BankFullHeight_grid,
    const NUMERIC_TYPE *cell_area_col,
    WetDryRowBound *wet_dry_bounds, BoundaryCondition *boundary_cond,
    const int grid_cols_padded)
{
    if (!g_open || Statesptr->coupling != ON) return;
    gf_h = h_grid;
    gf_vol = volume_grid;
    gf_dem = dem_grid;
    gf_bfH = SGC_BankFullHeight_grid;
    gf_area_col = cell_area_col;
    gf_wdb = wet_dry_bounds;
    gf_bc = boundary_cond;
    gf_cols_padded = grid_cols_padded;
    g_fast = true;
    printf("[COUPLE] Fast-Pfad (SGC) registriert: gepadete Gitter (stride=%d) - Austausch laeuft ueber volume_grid\n",
           grid_cols_padded);
}

void Coupling_UpdateFast(States *Statesptr, Pars *Parptr, Solver *Solverptr,
    const NUMERIC_TYPE delta_time)
{
    if (!g_open || Statesptr->coupling != ON || !g_fast) return;

    // (A) Raten-Refresh alle dt_c (SWMM lockstep vorruecken) — identisch zum klassischen
    // Pfad; refresh_rates liest im Fast-Modus ueber die Accessoren, Arrptr bleibt NULL
    // (die Original-Arrays sind zu diesem Zeitpunkt ohnehin freigegeben).
    if (Solverptr->t >= g_next_t) {
        advance_swmm_to(Solverptr->t);
        if (g_swmm_done && !g_done_logged) {
            g_done_logged = true;
            printf("[COUPLE] t=%.1fs: SWMM-Simulationsdauer zu Ende - Netz liefert/nimmt ab jetzt nichts mehr "
                   "(END_TIME der network.inp < 2D-Dauer?)\n", Solverptr->t);
        }
        refresh_rates(Statesptr, Parptr, Solverptr, NULL);
        do { g_next_t += g_dt_c; } while (g_next_t <= Solverptr->t);
    }

    // (B) Raten anwenden — Buchung AUSSCHLIESSLICH ueber volume_grid (+ fp_vol-Weitung);
    // SGC2_ProcessH_Row rechnet das Volumen im naechsten Schritt geometrie-korrekt in h um
    // (Kanalquerschnitt unter bankfull, Zellflaeche darueber). Massenkonto: das Fast-
    // Pendant zu BCptr ist boundary_cond (VolInMT/VolOutMT gehen in Verror ein).
    const double dt = (double)delta_time;
    for (int k = 0; k < g_n; k++) {
        if (g_skip[k]) continue;

        // 1D -> 2D aus dem Ausliefer-Pool (Outfall/Ueberstau, integriert)
        if (g_pend[k] > 0.0 && g_prate[k] > 0.0) {
            double dV = g_prate[k] * dt;
            if (dV > g_pend[k]) dV = g_pend[k];
            g_pend[k]      -= dV;
            fast_add_volume(k, dV);
            gf_bc->VolInMT += dV;
            g_sumIn[k]     += dV;
        }

        const double Q = g_Q[k];
        if (Q > 0.0) {                       // 1D -> 2D (Netz drueckt uebers Deckel-Wehr)
            const double dV = Q * dt;
            fast_add_volume(k, dV);
            gf_bc->VolInMT += dV;
            g_sumIn[k]     += dV;
        } else if (Q < 0.0) {                // 2D -> 1D (Einzug in den Schacht)
            const double want = -Q * dt;
            const double have = (double)gf_vol[fidx(k)];
            const double dV   = (want < have) ? want : ((have > 0.0) ? have : 0.0);
            if (dV > 0.0) {
                fast_add_volume(k, -dV);
                gf_bc->VolOutMT += dV;
                g_sumOut[k]     += dV;
            }
            // SWMM bekommt LATFLOW kontinuierlich - lieferte das 2D weniger (Zelle
            // leergelaufen), als Schuld merken und beim naechsten Refresh verrechnen.
            if (want > dV) g_debt += want - dV;
        }
    }

    // (C) Periodische Status-/Bilanzzeile.
    log_status(Solverptr->t);
}

void Coupling_Finalize(States *Statesptr, const int verbose)
{
    if (!g_open) return;
    double sumIn = 0.0, sumOut = 0.0;
    for (int k = 0; k < g_n; k++) {
        sumIn += g_sumIn[k]; sumOut += g_sumOut[k];
        if (g_sumIn[k] != 0.0 || g_sumOut[k] != 0.0)
            printf("[COUPLE]   %-16s %s Sum 1D->2D %.2f m3 | 2D->1D %.2f m3\n",
                   g_name[k], g_isOutfall[k] ? "OUTFALL " : "JUNCTION", g_sumIn[k], g_sumOut[k]);
    }
    printf("[COUPLE] Ende: 1D->2D gesamt %.2f m3 | 2D->1D gesamt %.2f m3 | unverrechnete Bilanz-Schuld %.3f m3\n",
           sumIn, sumOut, g_debt);
    swmm_end();
    swmm_report();
    swmm_close();
    g_open = false;
    if (verbose == ON) printf("QUAGG-Kopplung beendet (SWMM-Report geschrieben).\n");
    (void)Statesptr;
}

#else  // ohne QUAGG_COUPLING: reine No-Ops (pristine-Build ohne libswmm5)

void Coupling_Init(States *, Fnames *, Pars *, const int) {}
void Coupling_Update(States *, Pars *, Solver *, BoundCs *, Arrays *) {}
void Coupling_RegisterFastGrid(States *, NUMERIC_TYPE *, NUMERIC_TYPE *,
    const NUMERIC_TYPE *, const NUMERIC_TYPE *, const NUMERIC_TYPE *,
    WetDryRowBound *, BoundaryCondition *, const int) {}
void Coupling_UpdateFast(States *, Pars *, Solver *, const NUMERIC_TYPE) {}
void Coupling_Finalize(States *, const int) {}

#endif
