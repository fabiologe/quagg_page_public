# CMake-Config für den Docker-Build (CPU + optional CUDA).
#
# Abweichungen zu config.default.cmake:
#  - _NETCDF 0:   keine NetCDF-Abhängigkeit — wir nutzen nur ASCII-Raster (.asc/.wd),
#                 das hält das Runtime-Image klein.
#  - CUDA-Arch: das Default-File pinnt sm_37 (Kepler), was moderne nvcc ablehnen.
#    Wir setzen CMAKE_CUDA_ARCHITECTURES (CMP0104 verlangt das, sonst bricht der
#    CUDA-Build ab) per build-arg CUDA_ARCH. Default 89 = RTX 4090 / L40 (RunPod).
set(_NETCDF 0)
add_compile_definitions(_NUMERIC_MODE=0)
add_compile_definitions(_ONLY_RECT=0)
add_compile_definitions(_PROFILE_MODE=0)
add_compile_definitions(_DISABLE_WET_DRY=0)
add_compile_definitions(_CALCULATE_Q_MODE=1)
add_compile_definitions(_SGM_BY_BLOCKS=0)
add_compile_definitions(_BALANCE_TYPE=0)

# CUDA-Zielarchitektur (nur relevant, wenn der Build mit nvcc/CUDA-Base läuft;
# bei CPU-Build ohne Effekt). 80=A100, 89=RTX4090/L40, 90=H100. Mehrere: "80;89;90".
if (DEFINED ENV{CUDA_ARCH})
    set(CMAKE_CUDA_ARCHITECTURES $ENV{CUDA_ARCH})
else()
    set(CMAKE_CUDA_ARCHITECTURES 89)
endif()
# Optionale rohe nvcc-Flags (Backwards-Compat).
if (DEFINED ENV{CUDA_ARCHS})
    set(CMAKE_CUDA_FLAGS "$ENV{CUDA_ARCHS}")
endif()
