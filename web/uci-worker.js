// Web Worker hosting Patricia WASM chess engine.
// Supports both standard UCI string messages (worker.postMessage("go depth 12"))
// and JSON messages ({ type: "cmd", cmd: "..." }) for maximum GUI compatibility.

const SKILL_LEVELS = [
  500, 800, 1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800,
  1900, 2000, 2100, 2200, 2300, 2400, 2500, 2650, 2800, 3000,
];

function eloToSkillLevel(elo) {
  let closestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < SKILL_LEVELS.length; i++) {
    const diff = Math.abs(SKILL_LEVELS[i] - elo);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx + 1;
}

let engineInstance = null;
let isReady = false;
const pendingQueue = [];
let targetElo = 2500;
let limitStrength = false;
let preferJsonOutput = false;

function postOutput(line) {
  if (preferJsonOutput) {
    self.postMessage({ type: 'line', line });
  } else {
    self.postMessage(line);
  }
}

async function initEngine(scriptUrl) {
  try {
    if (!scriptUrl) {
      const isThreaded = typeof self.crossOriginIsolated === 'boolean' && self.crossOriginIsolated;
      scriptUrl = isThreaded ? 'pkg/patricia.js' : 'pkg/patricia-single.js';
    }

    importScripts(scriptUrl);
    const resolvedUrl = typeof self.location !== 'undefined' && self.location.href ? new URL(scriptUrl, self.location.href).href : scriptUrl;
    const isNode = typeof process !== 'undefined' && process?.versions?.node;

    engineInstance = await Patricia({
      mainScriptUrlOrBlob: resolvedUrl,
      locateFile: (p) => {
        if (isNode && typeof require !== 'undefined') {
          const path = require('path');
          return path.resolve(__dirname, 'pkg', p);
        }
        return new URL(p, resolvedUrl).href;
      },
    });

    engineInstance.addMessageListener((line) => {
      // If engine outputs uciok, ensure standard GUI options (UCI_LimitStrength & UCI_Elo) are visible
      if (line === 'uciok') {
        postOutput('option name UCI_LimitStrength type check default false');
        postOutput('option name UCI_Elo type spin default 2500 min 500 max 3000');
        postOutput('option name Personality type combo default Aggressive var Aggressive var Human var FullStrength var Solid');
      }
      postOutput(line);
    });

    isReady = true;

    if (preferJsonOutput) {
      self.postMessage({ type: 'ready' });
    }

    // Flush commands received during initialization
    for (const cmd of pendingQueue) {
      handleCommand(cmd);
    }
    pendingQueue.length = 0;
  } catch (err) {
    const errStr = String((err && err.message) || err);
    if (preferJsonOutput) {
      self.postMessage({ type: 'error', error: errStr });
    } else {
      console.error('[PatriciaWorker] Error:', err);
    }
  }
}

function handleCommand(rawCmd) {
  if (!rawCmd) return;
  const cmd = rawCmd.trim();

  // Intercept GUI options for Lucas Chess and other GUIs
  if (cmd.startsWith('setoption name UCI_LimitStrength value')) {
    const val = cmd.split('value')[1]?.trim().toLowerCase();
    limitStrength = val === 'true';
    if (!limitStrength) {
      engineInstance.postMessage('setoption name Skill_Level value 21');
    } else {
      const skill = eloToSkillLevel(targetElo);
      engineInstance.postMessage(`setoption name Skill_Level value ${skill}`);
    }
    return;
  }

  if (cmd.startsWith('setoption name UCI_Elo value')) {
    const elo = parseInt(cmd.split('value')[1]?.trim() || '2500', 10);
    targetElo = isNaN(elo) ? 2500 : elo;
    if (limitStrength) {
      const skill = eloToSkillLevel(targetElo);
      engineInstance.postMessage(`setoption name Skill_Level value ${skill}`);
    }
    return;
  }

  if (cmd.startsWith('setoption name Personality value')) {
    const personality = cmd.split('value')[1]?.trim() || 'Aggressive';
    if (personality === 'Human') {
      limitStrength = true;
      const skill = eloToSkillLevel(targetElo);
      engineInstance.postMessage(`setoption name Skill_Level value ${skill}`);
    } else if (personality === 'FullStrength') {
      limitStrength = false;
      engineInstance.postMessage('setoption name Skill_Level value 21');
    } else if (personality === 'Aggressive') {
      // Default aggressive configuration in Patricia
      limitStrength = false;
      engineInstance.postMessage('setoption name Skill_Level value 21');
    }
    return;
  }

  engineInstance.postMessage(cmd);
}

self.onmessage = (e) => {
  const data = e.data;

  // Handle JSON wrapper protocol
  if (data && typeof data === 'object') {
    preferJsonOutput = true;
    if (data.type === 'init') {
      initEngine(data.scriptUrl);
      return;
    }
    if (data.type === 'cmd') {
      if (!isReady || !engineInstance) {
        pendingQueue.push(data.cmd);
      } else {
        handleCommand(data.cmd);
      }
      return;
    }
  }

  // Handle direct string command protocol
  if (typeof data === 'string') {
    if (!engineInstance && !isReady) {
      initEngine().then(() => {
        handleCommand(data);
      });
      return;
    }

    if (!isReady) {
      pendingQueue.push(data);
    } else {
      handleCommand(data);
    }
  }
};
