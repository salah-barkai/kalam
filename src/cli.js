#!/usr/bin/env node
/*
 * Ligne de commande Kalam.
 *
 *   kalam salam.klm          exécuter un fichier
 *   kalam                    mode interactif
 *   kalam --check f.klm      vérifier sans exécuter (JSON, utilisé par les éditeurs)
 *   kalam rakkib             installer kalam.exe pour l'utiliser partout (Windows)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Kalam = require("./kalam.js");

// ---------------------------------------------------------------- console

let restoreCodePage = null;

function setupConsole() {
  // Sous Windows, on passe la console en UTF-8 pour les accents (ô, û, â…).
  if (process.platform !== "win32" || !process.stdout.isTTY) return;
  try {
    const { execSync } = require("child_process");
    const current = execSync("chcp", { encoding: "utf8" }).match(/(\d+)\s*$/);
    if (current && current[1] !== "65001") {
      execSync("chcp 65001", { stdio: "ignore" });
      restoreCodePage = current[1];
    }
  } catch (e) {
    /* pas grave : les accents seront peut-être mal affichés */
  }
}

function restoreConsole() {
  if (!restoreCodePage) return;
  try {
    require("child_process").execSync(`chcp ${restoreCodePage}`, { stdio: "ignore" });
  } catch (e) {
    /* rien */
  }
  restoreCodePage = null;
}

// Écritures synchrones : l'affichage apparaît avant chaque question (asal).
function writeOut(text) { fs.writeSync(1, text); }
function writeErr(text) { fs.writeSync(2, text); }

function makeLineReader() {
  let buf = Buffer.alloc(0);
  let eof = false;
  const chunk = Buffer.alloc(4096);
  return function readLine() {
    for (;;) {
      const nl = buf.indexOf(10);
      if (nl >= 0) {
        const line = buf.subarray(0, nl).toString("utf8").replace(/\r$/, "");
        buf = buf.subarray(nl + 1);
        return line;
      }
      if (eof) {
        if (!buf.length) return null;
        const line = buf.toString("utf8").replace(/\r$/, "");
        buf = Buffer.alloc(0);
        return line;
      }
      let n;
      try {
        n = fs.readSync(0, chunk, 0, chunk.length, null);
      } catch (e) {
        if (e.code === "EAGAIN") {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
          continue;
        }
        if (e.code === "EOF") { eof = true; continue; }
        throw e;
      }
      if (n === 0) eof = true;
      else buf = Buffer.concat([buf, chunk.subarray(0, n)]);
    }
  };
}

const readLine = makeLineReader();

function ask(prompt) {
  writeOut(prompt);
  return readLine();
}

// ---------------------------------------------------------------- commandes

function runFile(file) {
  let source;
  try {
    source = fs.readFileSync(file, "utf8");
  } catch (e) {
    writeErr(`Mushkila: al-file '${file}' da ma ligênah (fichier introuvable)\n`);
    return 1;
  }
  try {
    Kalam.run(source, {
      output: (line) => writeOut(line + "\n"),
      input: ask,
      baseDir: path.dirname(path.resolve(file)),
    });
  } catch (e) {
    if (e instanceof Kalam.KalamError) {
      writeErr(e.toString() + "\n");
      return 1;
    }
    throw e;
  }
  return 0;
}

function checkCommand(args) {
  // kalam --check fichier.klm      ou      kalam --check - chemin.klm  (code sur stdin)
  const target = args[0] || "-";
  const realPath = args[1] || (target === "-" ? null : target);
  const source = target === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(target, "utf8");
  writeOut(JSON.stringify(Kalam.check(source, realPath)));
  return 0;
}

const BLOCK_OPENERS = new Set(["kan", "tulma", "kulla", "khidime", "jarrib"]);

function blockDepth(source) {
  let tokens;
  try {
    tokens = Kalam.tokenize(source);
  } catch (e) {
    return 0;
  }
  let depth = 0;
  let prev = null;
  for (const t of tokens) {
    if (t.type === "KW") {
      if (BLOCK_OPENERS.has(t.value) && !(t.value === "kan" && prev === "walla")) depth += 1;
      else if (t.value === "khalas") depth -= 1;
    }
    prev = t.type === "KW" ? t.value : null;
  }
  return depth;
}

function repl() {
  writeOut(`Kalam ${Kalam.VERSION} — marhaba! Aktib 'amrug' walla Ctrl+C kan tidôr tamrug.\n`);
  const interp = new Kalam.Interpreter({
    output: (line) => writeOut(line + "\n"),
    input: ask,
    baseDir: process.cwd(),
  });
  for (;;) {
    let source = ask("kalam> ");
    if (source === null) { writeOut("\n"); break; }
    if (["amrug", "murug", "marug", "exit", "quit"].includes(Kalam.stripAccents(source.trim()))) break;
    while (blockDepth(source) > 0) {
      const more = ask("  ...> ");
      if (more === null) break;
      source += "\n" + more;
    }
    if (!source.trim()) continue;
    try {
      const program = Kalam.parse(source);
      if (program.body.length === 1 && program.body[0].kind === "ExprStmt") {
        // Une expression seule : on affiche sa valeur, comme une calculatrice.
        const value = interp.evaluate(program.body[0].expr, interp.globals);
        if (value !== null && value !== undefined) writeOut(Kalam.toText(value, true) + "\n");
      } else {
        interp.run(program);
      }
    } catch (e) {
      if (e instanceof Kalam.KalamError) writeOut(e.toString() + "\n");
      else if (e instanceof RangeError) writeOut("Mushkila: al-khidime nâdat nafisha katîr marra (récursion trop profonde)\n");
      else throw e;
    }
  }
  writeOut("Ma'a salâma!\n");
  return 0;
}

function install() {
  // Copie kalam.exe dans le dossier de l'utilisateur et l'ajoute au PATH.
  let isSea = false;
  try { isSea = require("node:sea").isSea(); } catch (e) { isSea = false; }
  if (!isSea || process.platform !== "win32") {
    writeOut("'kalam rakkib' yashtaghil be kalam.exe fi Windows bas (installation : Windows uniquement).\n");
    return 1;
  }
  const { execFileSync } = require("child_process");
  const dir = path.join(process.env.LOCALAPPDATA || path.join(require("os").homedir(), "AppData", "Local"), "Programs", "Kalam");
  const dest = path.join(dir, "kalam.exe");
  fs.mkdirSync(dir, { recursive: true });
  if (path.resolve(process.execPath).toLowerCase() !== dest.toLowerCase()) {
    fs.copyFileSync(process.execPath, dest);
  }
  const ps = [
    "$p = [Environment]::GetEnvironmentVariable('Path', 'User');",
    "if (-not $p) { $p = '' }",
    `$d = '${dir.replace(/'/g, "''")}';`,
    "if (($p -split ';') -notcontains $d) {",
    "  [Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';' + $d).TrimStart(';'), 'User'); 'added'",
    "} else { 'present' }",
  ].join(" ");
  const res = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8" }).trim();
  writeOut(`Kalam rakkabnah fi : ${dest}\n`);
  writeOut(res === "added"
    ? "Iftah terminal jadîd, ba'adên aktib : kalam salam.klm\n(Ouvrez un nouveau terminal, puis tapez : kalam salam.klm)\n"
    : "Kalam kân fi l-PATH min gabul. (Déjà dans le PATH.)\n");
  return 0;
}

const HELP = `Kalam ${Kalam.VERSION} — lugha barmaja be l-arabi at-tchadi

Kikkêf tisawwi (utilisation) :
  kalam fichier.klm        shaghghil barnâmij (exécuter un fichier)
  kalam                    al-wad' at-tafâ'uli (mode interactif)
  kalam --check fichier    fattish al-ghalat bala tashghîl (vérifier, sortie JSON)
  kalam rakkib             rakkib kalam fi l-kombyûtar (installer, Windows)
  kalam --version          an-nuskha (version)
`;

function main(argv) {
  const [first, ...rest] = argv;
  if (first === "-h" || first === "--help" || first === "awinni") { writeOut(HELP); return 0; }
  if (first === "-v" || first === "--version") { writeOut(`Kalam ${Kalam.VERSION}\n`); return 0; }
  if (first === "--check") return checkCommand(rest);
  if (first === "rakkib" && !fs.existsSync(first)) return install();
  setupConsole();
  try {
    return first ? runFile(first) : repl();
  } finally {
    restoreConsole();
  }
}

// Le code source de ce programme quand il est empaqueté dans kalam.exe.
function seaSource() {
  try {
    const sea = require("node:sea");
    if (sea.isSea()) return sea.getAsset("kalam.js", "utf8");
  } catch (e) {
    /* pas dans kalam.exe */
  }
  return null;
}

function runInThisThread(argv) {
  let code;
  try {
    code = main(argv);
  } catch (e) {
    restoreConsole();
    writeErr("Mushkila dâkhiliya (erreur interne) : " + (e && e.stack ? e.stack : e) + "\n");
    code = 2;
  }
  return code;
}

function start() {
  const { isMainThread, Worker } = require("worker_threads");
  const argv = process.argv.slice(2);
  if (!isMainThread) {
    // Dans le worker : la pile est grande, la récursion peut aller loin.
    process.exit(runInThisThread(argv));
  }
  const quick = ["-h", "--help", "awinni", "-v", "--version", "rakkib"].includes(argv[0]);
  if (quick || process.env.KALAM_SAME_THREAD) {
    process.exitCode = runInThisThread(argv);
    return;
  }
  // Le fil principal reste libre : il gère la console et Ctrl+C.
  setupConsole();
  process.on("SIGINT", () => {
    restoreConsole();
    process.exit(130);
  });
  const options = { argv, resourceLimits: { stackSizeMb: 64 } };
  const source = seaSource();
  const worker = source ? new Worker(source, { ...options, eval: true }) : new Worker(__filename, options);
  worker.on("error", (e) => {
    restoreConsole();
    writeErr("Mushkila dâkhiliya (erreur interne) : " + (e && e.stack ? e.stack : e) + "\n");
    process.exitCode = 2;
  });
  worker.on("exit", (code) => {
    restoreConsole();
    if (process.exitCode === undefined) process.exitCode = code;
  });
}

if (require.main === module || !module.parent) start();

module.exports = { main, blockDepth };
