// Construit le site de Kalam (dossier site/) et le cours PDF.
//
//   node tools/build-site.js            site + cours HTML + PDF
//   node tools/build-site.js --no-pdf   sans le PDF
//   node tools/build-site.js --check    vérifie seulement les programmes du cours
//   node tools/build-site.js --browser <chemin de Chrome/Edge>
//
// Chaque bloc ```kalam du cours est exécuté et son vrai résultat est inséré
// sous le code. Options d'un bloc (après le mot kalam) :
//   entrees="a|b"     réponses données aux appels asal(), dans l'ordre
//   erreur            le programme DOIT s'arrêter sur une erreur (affichée)
//   hasard            résultat aléatoire : affiché comme « exemple de résultat »
//   fichier="x.klm"   le code est enregistré sous ce nom (pour jib), pas exécuté
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const Kalam = require("../src/kalam.js");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
const COURSE_MD = path.join(ROOT, "docs", "cours.md");
const BUILTINS = new Set(Kalam.builtinNames());

const BLOCK_RE = /^```kalam([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm;
const OPT_RE = /(\w+)(?:="([^"]*)")?/g;

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------- coloration

const TOKEN_RE = new RegExp(
  [
    "(?<comment>#[^\\n]*)",
    "(?<string>\"(?:\\\\.|[^\"\\\\\\n])*\"?|(?<![\\p{L}\\p{N}_'])'(?:\\\\.|[^'\\\\\\n])*'?)",
    "(?<number>\\b\\d+(?:\\.\\d+)?\\b)",
    "(?<word>[\\p{L}_][\\p{L}\\p{N}_']*)",
    "(?<op>==|!=|<=|>=|[+\\-*/]=|[-+*/%<>=])",
    "(?<other>[\\s\\S])",
  ].join("|"),
  "gu"
);

function highlight(code) {
  let out = "";
  for (const m of code.matchAll(TOKEN_RE)) {
    let kind = Object.keys(m.groups).find((k) => m.groups[k] !== undefined);
    const text = escapeHtml(m[0]);
    if (kind === "word") {
      const plain = Kalam.stripAccents(m[0]).replace(/'/g, "");
      const after = code[m.index + m[0].length];
      if (["sahi", "ghalat", "mafi"].includes(plain.toLowerCase()) || plain === "PI") kind = "const";
      else if (Kalam.KEYWORDS.has(plain.toLowerCase())) kind = "kw";
      else if (BUILTINS.has(plain) && after === "(") kind = "fn";
      else kind = null;
    }
    out += !kind || kind === "other" ? text : `<span class="t-${kind}">${text}</span>`;
  }
  return out;
}

// ---------------------------------------------------------------- exécution

function seededRandom(seed) {
  // mulberry32 : résultats « au hasard » mais identiques à chaque construction
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runBlock(code, opts, workdir, where) {
  if (opts.fichier) {
    fs.writeFileSync(path.join(workdir, opts.fichier), code);
    return null;
  }
  if (!("erreur" in opts)) {
    const problems = Kalam.check(code, path.join(workdir, "cours.klm"));
    if (problems.length) throw new Error(`${where} : le vérificateur signale ${JSON.stringify(problems)}`);
  }
  const answers = opts.entrees ? opts.entrees.split("|") : [];
  const lines = [];
  const input = (prompt) => {
    if (!answers.length) throw new Error(`${where} : pas assez de réponses pour asal()`);
    const a = answers.shift();
    lines.push(prompt + a);
    return a;
  };
  try {
    Kalam.run(code, { output: (l) => lines.push(l), input, baseDir: workdir, random: seededRandom(2026) });
  } catch (e) {
    if (!(e instanceof Kalam.KalamError)) throw e;
    if (!("erreur" in opts)) throw new Error(`${where} : erreur inattendue : ${e}\n${code}`);
    lines.push(e.toString());
    return { lines, failed: true };
  }
  if ("erreur" in opts) throw new Error(`${where} : le programme devait échouer mais a réussi`);
  return { lines, failed: false };
}

function renderBlock(code, opts, result) {
  let html = '<figure class="prog">';
  if (opts.fichier) html += `<figcaption>Fichier <code>${escapeHtml(opts.fichier)}</code></figcaption>`;
  html += `<pre class="code"><code>${highlight(code.replace(/\s+$/, ""))}</code></pre>`;
  if (result) {
    const label = "hasard" in opts ? "Exemple de résultat" : "Résultat";
    const body = result.lines.length ? escapeHtml(result.lines.join("\n")) : "<em>(rien n'est affiché)</em>";
    html += `<div class="${result.failed ? "out err" : "out"}"><span class="out-label">${label}</span><pre>${body}</pre></div>`;
  }
  return html + "</figure>";
}

function processCourse(source) {
  const rendered = new Map();
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "kalam-cours-"));
  let count = 0;
  try {
    const md = source.replace(BLOCK_RE, (match, optText, code, offset) => {
      count += 1;
      const opts = {};
      for (const m of optText.matchAll(OPT_RE)) opts[m[1]] = m[2] === undefined ? "" : m[2];
      const lineNo = source.slice(0, offset).split("\n").length;
      const result = runBlock(code, opts, workdir, `cours.md, ligne ${lineNo}`);
      const token = `KALAMBLOCK${String(count).padStart(4, "0")}`;
      rendered.set(token, renderBlock(code, opts, result));
      return `\n${token}\n`;
    });
    return { md, rendered, count };
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- HTML du cours

function slug(text) {
  return Kalam.stripAccents(text.replace(/<[^>]+>/g, "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildCourseHtml(md, rendered) {
  const { marked } = require("marked");
  let body = marked.parse(md);
  for (const [token, block] of rendered) {
    body = body.split(`<p>${token}</p>`).join(block).split(token).join(block);
  }
  const toc = [];
  body = body.replace(/<h1>(.*?)<\/h1>/g, (m, title) => {
    const anchor = slug(title);
    if (title.startsWith("Partie")) {
      const [num, ...rest] = title.split(" — ");
      toc.push(`<li class="toc-part"><a href="#${anchor}">${title}</a></li>`);
      return `<section class="part" id="${anchor}"><p class="part-num">${num}</p><h1>${rest.join(" — ")}</h1></section>`;
    }
    const cls = /^(Annexe|Préface)/.test(title) ? "toc-annex" : "toc-ch";
    toc.push(`<li class="${cls}"><a href="#${anchor}">${title}</a></li>`);
    return `<h1 class="chapter" id="${anchor}">${title}</h1>`;
  });
  body = body.replace(/<h2>(.*?)<\/h2>/g, (m, t) => `<h2 id="${slug(t)}">${t}</h2>`);
  return { body, toc: toc.join("\n") };
}

function page(name, values) {
  let text = fs.readFileSync(path.join(ROOT, "tools", "templates", name), "utf8");
  for (const [k, v] of Object.entries(values)) text = text.split(`{{${k}}}`).join(v);
  return text;
}

function findBrowser(explicit) {
  const candidates = [
    explicit,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function makePdf(htmlPath, pdfPath, browser) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kalam-pdf-"));
  try {
    execFileSync(browser, [
      "--headless", "--disable-gpu", "--no-sandbox", `--user-data-dir=${profile}`,
      "--no-pdf-header-footer", "--print-to-pdf-no-header", `--print-to-pdf=${pdfPath}`,
      "file:///" + htmlPath.replace(/\\/g, "/").replace(/^\/+/, ""),
    ], { stdio: "ignore", timeout: 180000 });
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
  if (!fs.existsSync(pdfPath)) throw new Error("Le PDF n'a pas été créé.");
}

function today() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function main() {
  const args = process.argv.slice(2);
  const source = fs.readFileSync(COURSE_MD, "utf8");
  const { md, rendered, count } = processCourse(source);
  console.log(`${count} programmes du cours exécutés et vérifiés.`);
  if (args.includes("--check")) return;

  fs.rmSync(SITE, { recursive: true, force: true });
  fs.mkdirSync(path.join(SITE, "assets"), { recursive: true });
  fs.mkdirSync(path.join(SITE, "exemples"), { recursive: true });
  for (const f of ["logo.svg", "logo.png"]) fs.copyFileSync(path.join(ROOT, "assets", f), path.join(SITE, "assets", f));

  // Le langage pour le terrain de jeu, et les exemples
  fs.copyFileSync(path.join(ROOT, "src", "kalam.js"), path.join(SITE, "kalam.js"));
  const examples = fs.readdirSync(path.join(ROOT, "examples")).filter((f) => f.endsWith(".klm")).sort();
  for (const f of examples) fs.copyFileSync(path.join(ROOT, "examples", f), path.join(SITE, "exemples", f));
  fs.writeFileSync(path.join(SITE, "exemples", "liste.txt"), examples.join("\n"));

  // Téléchargements : kalam.exe s'il a été construit (node tools/build-exe.js)
  const logo = fs.readFileSync(path.join(ROOT, "assets", "logo.svg"), "utf8");
  const { body, toc } = buildCourseHtml(md, rendered);
  const coursePath = path.join(SITE, "cours.html");
  fs.writeFileSync(coursePath, page("cours.html", { BODY: body, TOC: toc, LOGO: logo, DATE: today() }));
  console.log("Cours HTML :", coursePath);
  for (const name of ["index.html", "essayer.html"]) {
    fs.writeFileSync(path.join(SITE, name), page(name, { LOGO: logo, DATE: today() }));
  }
  fs.writeFileSync(path.join(SITE, ".nojekyll"), "");

  if (!args.includes("--no-pdf")) {
    const i = args.indexOf("--browser");
    const browser = findBrowser(i >= 0 ? args[i + 1] : null);
    if (!browser) throw new Error("Chrome ou Edge introuvable : utilisez --browser <chemin> ou --no-pdf.");
    const pdfPath = path.join(SITE, "kalam-cours.pdf");
    makePdf(coursePath, pdfPath, browser);
    console.log("Cours PDF  :", pdfPath, `(${Math.round(fs.statSync(pdfPath).size / 1024)} Ko)`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error("ÉCHEC :", e.message);
    process.exit(1);
  }
}

module.exports = { processCourse, highlight, COURSE_MD };
