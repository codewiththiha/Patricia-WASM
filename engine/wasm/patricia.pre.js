// Prepended to the Emscripten output. Gives the module the same public API
// as stockfish.wasm / stockfish.js:
//
//   Patricia().then(engine => {
//     engine.addMessageListener(line => ...);   // engine -> GUI (one line per call)
//     engine.postMessage("uci");                // GUI -> engine (UCI command)
//     engine.removeMessageListener(listener);
//     engine.terminate();                       // stop + drop the instance
//   });

var __patriciaListeners = [];
var __patriciaQueue = [];
var __patriciaReady = false;

Module["print"] = function (line) {
  if (__patriciaListeners.length > 0) {
    for (var i = 0; i < __patriciaListeners.length; i++) {
      try {
        __patriciaListeners[i](line);
      } catch (e) {
        console.error(e);
      }
    }
  } else {
    console.log(line);
  }
};

Module["printErr"] = function (line) {
  console.error(line);
};

Module["addMessageListener"] = function (listener) {
  __patriciaListeners.push(listener);
};

Module["removeMessageListener"] = function (listener) {
  var idx = __patriciaListeners.indexOf(listener);
  if (idx >= 0) __patriciaListeners.splice(idx, 1);
};

Module["postMessage"] = function (command) {
  Module["postCustomMessage"](command);
};

// Alias used by some stockfish.wasm forks.
Module["postCustomMessage"] = function (command) {
  if (!__patriciaReady) {
    __patriciaQueue.push(command);
    return;
  }
  Module["ccall"]("uci_command", null, ["string"], [String(command)]);
};

Module["terminate"] = function () {
  try {
    Module["postCustomMessage"]("stop");
  } catch (e) {}
  __patriciaListeners = [];
  try {
    if (typeof PThread !== "undefined" && PThread.terminateAllThreads) {
      PThread.terminateAllThreads();
    }
  } catch (e) {}
};

if (!Module["postRun"]) Module["postRun"] = [];
Module["postRun"].push(function () {
  Module["ccall"]("uci_init", null, [], []);
  __patriciaReady = true;
  var queued = __patriciaQueue.splice(0, __patriciaQueue.length);
  for (var i = 0; i < queued.length; i++) {
    Module["postCustomMessage"](queued[i]);
  }
});
