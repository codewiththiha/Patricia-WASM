// Node smoke test for the wasm builds.
// Usage: node test.js [dist/patricia.js|dist/patricia-single.js]
const path = process.argv[2] || "./pkg/patricia.js";
const single = path.includes("single");
const Patricia = require(require("path").resolve(__dirname, path));

function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT: " + label)), ms)),
  ]);
}

(async () => {
  const engine = await Patricia();
  const send = (cmd) => {
    console.log("> " + cmd);
    engine.postMessage(cmd);
  };

  engine.addMessageListener((line) => console.log("< " + line));

  const waitFor = (pattern, ms = 30000) =>
    withTimeout(
      new Promise((resolve) => {
        const l = (line) => {
          if (pattern.test(line)) {
            engine.removeMessageListener(l);
            resolve(line);
          }
        };
        engine.addMessageListener(l);
      }),
      ms,
      String(pattern)
    );

  // 1. handshake
  let p = waitFor(/^uciok/);
  send("uci");
  await p;

  p = waitFor(/^readyok/);
  send("isready");
  await p;

  // 2. options
  send("setoption name Hash value 64");
  send("setoption name MultiPV value 1");

  // 3. search from startpos
  send("ucinewgame");
  send("position startpos moves e2e4 e7e5");
  p = waitFor(/^bestmove/);
  send("go depth 12");
  console.log("bestmove ->", await p);

  // 4. search from FEN
  send("position fen r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3");
  p = waitFor(/^bestmove/);
  send("go movetime 1000");
  console.log("bestmove ->", await p);

  // 5. infinite + stop (only meaningful on the threaded build)
  if (!single) {
    send("go infinite");
    await new Promise((r) => setTimeout(r, 1500));
    p = waitFor(/^bestmove/, 10000);
    send("stop");
    console.log("bestmove after stop ->", await p);
  }

  console.log("ALL TESTS PASSED (" + path + ")");
  process.exit(0);
})().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
