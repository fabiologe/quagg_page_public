#!/bin/bash
# Build script for Serverless SWMM Wasm Solver
# Automatically handles directory context

# Navigate to 'client/src/features/isybau' directory (parent of 'solver')
cd "$(dirname "$0")/.."

echo "Building SWMM Wasm Solver from $(pwd)..."

# Mount the current directory (isybau) to /src in the container
# Input files are in solver/src/solver/
# Output goes to utils/
docker run --rm -v $(pwd):/src emscripten/emsdk emcc \
    solver/src/solver/*.c \
    -I solver/src/solver \
    -I solver/src/solver/include \
    -o utils/swmm_solver.js \
    -s EXPORTED_FUNCTIONS='["_swmm_run", "_swmm_open", "_swmm_start", "_swmm_step", "_swmm_stride", "_swmm_end", "_swmm_report", "_swmm_close", "_swmm_getMassBalErr", "_swmm_getVersion", "_swmm_getError", "_swmm_getWarnings", "_swmm_getIndex", "_swmm_getValue", "_swmm_getCount", "_malloc", "_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "stringToUTF8", "setValue", "getValue", "FS"]' \
    -s ASSERTIONS=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s FORCE_FILESYSTEM=1 \
    -s EXPORT_NAME='createSwmmModule' \
    -O3

echo "Build complete. Output in utils/swmm_solver.js and swmm_solver.wasm"
