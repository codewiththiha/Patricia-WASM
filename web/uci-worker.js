// Web Worker that hosts the Patricia wasm engine, so the page's UI thread
// never blocks. Protocol with the page:
//   page -> worker: { type: "init", scriptUrl: "<abs url to patricia*.js>" }
//   page -> worker: { type: "cmd",  cmd: "go depth 20" }
//   worker -> page: { type: "ready" }
//   worker -> page: { type: "line", line: "info depth ..." }
//   worker -> page: { type: "error", error: "..." }

let enginePromise = null;

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      importScripts(msg.scriptUrl);
      enginePromise = Patricia({
        mainScriptUrlOrBlob: msg.scriptUrl,
        locateFile: (path) => new URL(path, msg.scriptUrl).href,
      });
      const engine = await enginePromise;
      engine.addMessageListener((line) =>
        self.postMessage({ type: "line", line })
      );
      self.postMessage({ type: "ready" });
    } else if (msg.type === "cmd") {
      const engine = await enginePromise;
      engine.postMessage(msg.cmd);
    }
  } catch (err) {
    self.postMessage({ type: "error", error: String(err && err.message || err) });
  }
};
