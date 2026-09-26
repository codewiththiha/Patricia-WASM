#!/usr/bin/env bash
# Build Patricia as WebAssembly (stockfish.wasm-style module).
#
# Produces in engine/wasm/pkg:
#   patricia.js / patricia.wasm               - multithreaded (pthreads, needs
#                                               crossOriginIsolated page: COOP/COEP)
#   patricia-single.js / patricia-single.wasm - single-threaded fallback
#                                               (works everywhere; search runs
#                                               synchronously, so always give
#                                               explicit go limits)
#
# Requires an activated emsdk (emcc/em++ on PATH).

set -euo pipefail
cd "$(dirname "$0")/.."   # -> engine/

OUT=wasm/pkg
mkdir -p "$OUT"
BUILD=wasm/.build
mkdir -p "$BUILD"

CXXFLAGS="-O3 -std=c++20 -ffast-math -msimd128 -DNDEBUG"
CFLAGS="-O3 -msimd128 -DNDEBUG -Wno-c23-extensions"

LINKFLAGS_COMMON="
  --no-entry
  -sMODULARIZE=1
  -sEXPORT_NAME=Patricia
  -sEXPORTED_FUNCTIONS=_uci_init,_uci_command
  -sEXPORTED_RUNTIME_METHODS=ccall
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=134217728
  -sMAXIMUM_MEMORY=2147483648
  -sSTACK_SIZE=8388608
  -sENVIRONMENT=web,worker,node
  --pre-js wasm/patricia.pre.js
"

echo "=== [1/2] multithreaded build (pthreads) ==="
MT="-pthread"
emcc  $CFLAGS   $MT -c wasm/nets_embedded.c        -o $BUILD/nets_mt.o
emcc  $CFLAGS   $MT -c src/fathom/src/tbprobe.c    -o $BUILD/tbprobe_mt.o -Isrc/fathom/src
em++  $CXXFLAGS $MT -c wasm/wasm_main.cpp          -o $BUILD/main_mt.o
em++  $CXXFLAGS $MT $BUILD/main_mt.o $BUILD/tbprobe_mt.o $BUILD/nets_mt.o \
      $LINKFLAGS_COMMON \
      -sPTHREAD_POOL_SIZE=4 \
      -sPTHREAD_POOL_SIZE_STRICT=0 \
      -sDEFAULT_PTHREAD_STACK_SIZE=8388608 \
      -sALLOW_BLOCKING_ON_MAIN_THREAD=1 \
      -o $OUT/patricia.js

echo "=== [2/2] single-threaded build ==="
ST="-DPATRICIA_SINGLE_THREAD"
emcc  $CFLAGS   -c wasm/nets_embedded.c            -o $BUILD/nets_st.o
emcc  $CFLAGS   -c src/fathom/src/tbprobe.c        -o $BUILD/tbprobe_st.o -Isrc/fathom/src
em++  $CXXFLAGS $ST -c wasm/wasm_main.cpp          -o $BUILD/main_st.o
em++  $CXXFLAGS $BUILD/main_st.o $BUILD/tbprobe_st.o $BUILD/nets_st.o \
      $LINKFLAGS_COMMON \
      -o $OUT/patricia-single.js

# Keep the web demo's copy of the engine in sync when it exists.
if [ -d ../web ]; then
  mkdir -p ../web/pkg
  cp $OUT/* ../web/pkg/
fi

echo
echo "Build complete:"
ls -la $OUT
