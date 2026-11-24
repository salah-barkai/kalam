// Exécute un programme Kalam dans un « worker » : le programme peut demander
// une saisie (asal) et attendre la réponse tapée dans le terminal de VS Code,
// et on peut l'arrêter avec Ctrl+C même s'il tourne en boucle.
"use strict";

const { parentPort, workerData } = require("worker_threads");
const Kalam = require("./kalam.js");

const control = new Int32Array(workerData.shared, 0, 2); // [état, longueur]
const data = new Uint8Array(workerData.shared, 8);

function ask(prompt) {
  parentPort.postMessage({ type: "ask", prompt });
  Atomics.wait(control, 0, 0);
  const state = Atomics.load(control, 0);
  const text = Buffer.from(data.slice(0, control[1])).toString("utf8");
  Atomics.store(control, 0, 0);
  return state === 2 ? null : text; // 2 = fin de l'entrée
}

try {
  Kalam.run(workerData.source, {
    output: (text) => parentPort.postMessage({ type: "out", text }),
    input: ask,
    baseDir: workerData.baseDir,
  });
  parentPort.postMessage({ type: "done", ok: true });
} catch (e) {
  const text = e instanceof Kalam.KalamError ? e.toString() : "Mushkila dâkhiliya (erreur interne) : " + (e && e.stack);
  parentPort.postMessage({ type: "error", text });
  parentPort.postMessage({ type: "done", ok: false });
}
