#!/bin/bash
# Build script for Flood-2D LISFLOOD-FP WASM Solver (Blackbox Edition)
# Uses emscripten/emsdk docker container

# Navigate to the directory containing this script (solverHydro/)
cd "$(dirname "$0")"

echo "Building Flood-2D WASM Solver (Batch Mode)..."

# Ensure build directory exists
mkdir -p build

# Run Emscripten via Docker
# Mounting current dir (solverHydro/) to /src in container
docker run --rm -v $(pwd):/src -w /src emscripten/emsdk /bin/bash -c "emcc \\
    src/lisflood-fp-bmi-v5.9/*.cpp \\
    -I src/lisflood-fp-bmi-v5.9 \\
    -o build/lisflood.js \\
    -s EXPORTED_FUNCTIONS='[\"_run_lisflood\", \"_malloc\", \"_free\"]' \\
    -s EXPORTED_RUNTIME_METHODS='[\"ccall\", \"cwrap\", \"UTF8ToString\", \"FS\", \"HEAP8\", \"HEAPU8\"]' \\
    -s ALLOW_MEMORY_GROWTH=1 \\
    -s INITIAL_MEMORY=536870912 \\
    -s MAXIMUM_MEMORY=4294967296 \\
    -s MODULARIZE=1 \\
    -s EXPORT_ES6=1 \\
    -s FORCE_FILESYSTEM=1 \\
    -s ENVIRONMENT='web,worker' \\
    -s PTHREAD_POOL_SIZE='navigator.hardwareConcurrency' \\
    -O2 \\
    > build_log.txt 2>&1; ls -la build/"

echo "Build complete. Check build/lisflood.js"