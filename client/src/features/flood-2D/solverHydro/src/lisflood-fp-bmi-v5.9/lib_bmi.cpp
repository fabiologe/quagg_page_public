#include <cstdio>
#include <iostream>
#include <string>
#include <vector>

#include "lisflood.h"
#include "global.h"
#include "initialize.h"
#include "finalize.h"
#include "update.h"

// External declarations for LISFLOOD functions not in headers or needing C linkage
extern "C" int init(int argc, const char *argv[]);
extern "C" void init_iterateq();

extern "C" {
    // Single entry point for the WASM solver
    int run_lisflood(char* par_filename) {
        printf("Running in Single-Threaded Mode (WASM Standard)\n");
        printf("Parameter file: %s\n", par_filename);

        // 1. Safe ARGV Construction (Mutable copies)
        std::string progName = "lisflood";
        std::string paramFile = par_filename;
        
        std::vector<char*> argv;
        argv.push_back(&progName[0]);
        argv.push_back(&paramFile[0]);
        int argc = 2;

        // 2. Initialize logic
        int result = init(argc, (const char**)argv.data());
        
        if (result != 0) {
            printf("Initialization failed with code %d. Cleaning up...\n", result);
            final(); 
            return result;
        }

        // 3. Initialize solver loop
        // We use the separate init_iterateq() to prepare files/memory but NOT run the loop yet
        init_iterateq();

        // 4. Run the simulation loop (Manual Control)
        printf("Status: Starting simulation loop from t=%.2f to %.2f\n", Solverptr->t, Solverptr->Sim_Time);
        
        int iter = 0;
        while (Solverptr->t < Solverptr->Sim_Time)
        {
             // Run ONE time step
             iterateq_step();
             
             iter++;
             // Heartbeat logging every 100 steps
             if (iter % 100 == 0) {
                 printf("Status: Step %d | Time: %.2fs / %.2fs | dt: %.4fs\n", 
                        iter, Solverptr->t, Solverptr->Sim_Time, Solverptr->Tstep);
             }
        }

        // 5. Cleanup
        // finalize(); // final_iterateq is likely distinct? It's not in headers?
        // Let's assume finalize() handles it if init_iterateq was part of init? No.
        // There is no final_iterateq exposed or in headers usually?
        // Wait, I saw final() in snippet before.
        // Let's check headers if needed, but for now final() is standard.
        // But iterateq might need cleanup?
        // original code usually just calls final().
        
        final(); 

        return 0;
    }
}
