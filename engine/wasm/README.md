# Patricia.wasm

WebAssembly build of the Patricia chess engine, packaged with the same
JavaScript API as stockfish.wasm / stockfish.js so it can be dropped into any
GUI that already speaks that interface.

## Files

Prebuilt binaries live in [`web/pkg/`](../../web/pkg) at the repository root:

| File | Description |
|---|---|
| `patricia.js` + `patricia.wasm` | Multithreaded build (pthreads / SharedArrayBuffer). Full UCI semantics including `go infinite` + `stop`. Requires a crossOriginIsolated page (COOP/COEP headers, see below). |
| `patricia-single.js` + `patricia-single.wasm` | Single-threaded fallback. Works on any host, no special headers. The search runs synchronously inside the command call, so `stop` cannot interrupt a running search; always give explicit limits (`go depth N`, `go movetime N`, `go nodes N`, or `wtime/btime`). |

All three NNUE networks are embedded in each `.wasm` (about 5 MB), exactly
like the native binary.

## JavaScript API (stockfish.wasm-compatible)

```js
// classic script tag / importScripts / require - exposes global factory `Patricia`
Patricia().then(engine => {
  engine.addMessageListener(line => console.log(line)); // engine -> GUI, one line per call
  engine.postMessage("uci");                            // GUI -> engine, standard UCI
  engine.postMessage("isready");
  engine.postMessage("position startpos moves e2e4 e7e5");
  engine.postMessage("go depth 20");
  // ... "stop", "setoption name Skill_Level value 10", "ucinewgame", etc.
  // engine.removeMessageListener(l); engine.terminate();
});
```

`postCustomMessage` is provided as an alias of `postMessage` for compatibility
with stockfish.wasm forks that use it.

### Supported UCI commands

`uci`, `isready`, `ucinewgame`, `position [startpos|fen ...] [moves ...]`,
`go [depth|nodes|movetime|wtime/btime/winc/binc|infinite]`, `stop`, `quit`,
`setoption name <Hash|Threads|MultiPV|Skill_Level|Move_Overhead|UCI_Chess960> value ...`,
plus `bench`, `perft N`, `d`.

Patricia-specific goodie: `Skill_Level` 1-20 makes it play like a human of
roughly 500-3000 Elo (21 = full strength), which is great for web play sites.

## Serving the multithreaded build

The page must be crossOriginIsolated for SharedArrayBuffer:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Feature-detect and fall back:

```js
const script = self.crossOriginIsolated ? "patricia.js" : "patricia-single.js";
```

Run the engine inside a Web Worker (see [`web/uci-worker.js`](../../web/uci-worker.js))
so the UI thread stays free - the same deployment pattern lichess uses for
stockfish.wasm.

## Building from source

```bash
# 1. Install emsdk (https://emscripten.org) and activate it:
source /path/to/emsdk/emsdk_env.sh

# 2. Build both variants (outputs engine/wasm/pkg, synced to web/pkg):
./engine/wasm/build.sh

# 3. Smoke test in Node:
cd engine/wasm
node test.js pkg/patricia.js
node test.js pkg/patricia-single.js
```

### What was changed for the wasm port

1. `src/nnue.h` - incbin uses `.incbin` inline assembly, which the wasm LLVM
   backend does not support. Under `__EMSCRIPTEN__` the nets are instead
   embedded via C23 `#embed` in `wasm/nets_embedded.c`, using the same
   `g_nnue*Data` symbol names.
2. `src/uci.h` - the body of the `while (getline(cin))` loop was extracted
   into `uci_execute_command(input, thread_info, position, search_thread)` so
   the wasm build can feed one command at a time (browsers have no blocking
   stdin). Native behaviour is unchanged.
3. `src/uci.h` - `PATRICIA_SINGLE_THREAD` mode: `go` runs the search
   synchronously instead of spawning `std::thread`, and
   `setoption name Threads` is clamped to 1.
4. `wasm/wasm_main.cpp` - exports `uci_init()` / `uci_command(const char*)`.
5. `wasm/patricia.pre.js` - wraps output/commands into the stockfish.wasm API
   (`postMessage`, `addMessageListener`, `removeMessageListener`,
   `terminate`).

Engine internals (search, eval, movegen, time management) are untouched:
PEXT/AVX code paths already had portable fallbacks (magic bitboards + scalar
NNUE) which the wasm build uses automatically. Compiled with `-O3 -msimd128`.

Reference speed: `bench` is roughly 330 knps in Node inside a container
(native AVX2 builds are about 10x faster; browser results vary by machine).

## Demo

[`web/`](../../web) contains a ready-to-serve demo (UCI console UI, worker
relay, and `serve.py` which sends the COOP/COEP headers):

```bash
cd web && python3 serve.py 8000
```
