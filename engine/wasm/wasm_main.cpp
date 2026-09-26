// WebAssembly (Emscripten) entry point for Patricia.
//
// Instead of a blocking stdin getline loop (which does not exist in a
// browser), we export two C functions:
//
//   uci_init()            - one-time engine initialisation
//   uci_command(cmd)      - execute a single UCI command string
//
// Output goes through printf -> Emscripten's Module.print, which the JS
// wrapper (patricia.pre.js) fans out to registered message listeners, so
// the final JS API matches stockfish.wasm:
//
//   const engine = await Patricia();
//   engine.addMessageListener(line => console.log(line));
//   engine.postMessage("uci");
//   engine.postMessage("position startpos moves e2e4");
//   engine.postMessage("go depth 20");

#include "../src/search.h"
#include "../src/uci.h"

#include <emscripten.h>
#include <memory>
#include <string>
#include <thread>

namespace {
Position wasm_position;
std::unique_ptr<ThreadInfo> wasm_thread_info;
std::thread wasm_search_thread;
} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
void uci_init() {
  if (wasm_thread_info) {
    return; // already initialised
  }

  wasm_thread_info = std::make_unique<ThreadInfo>();

  init_LMR();
  init_bbs();

  printf("Patricia Chess Engine, written by Adam Kulju\n");

  new_game(*wasm_thread_info, TT);
  set_board(wasm_position, *wasm_thread_info,
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
}

EMSCRIPTEN_KEEPALIVE
void uci_command(const char *cmd) {
  if (!wasm_thread_info) {
    uci_init();
  }
  uci_execute_command(std::string(cmd), *wasm_thread_info, wasm_position,
                      wasm_search_thread);
}

} // extern "C"
