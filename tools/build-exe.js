// Fabrique kalam.exe : un seul fichier qui contient Node.js et Kalam.
// Personne n'a besoin d'installer Python ni Node pour l'utiliser.
//
//   node tools/build-exe.js        ->  dist/kalam.exe (ou dist/kalam sous Linux/macOS)
//
// Utilise les « Single Executable Applications » de Node.js.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const isWin = process.platform === "win32";
const exe = path.join(DIST, isWin ? "kalam.exe" : "kalam");
const version = require(path.join(ROOT, "package.json")).version;

fs.mkdirSync(DIST, { recursive: true });

// 1) Un seul fichier JavaScript : la bibliothèque + la ligne de commande
const lib = fs.readFileSync(path.join(ROOT, "src", "kalam.js"), "utf8");
const cli = fs.readFileSync(path.join(ROOT, "src", "cli.js"), "utf8")
  .replace(/^#!.*\n/, "")
  .replace('const Kalam = require("./kalam.js");', "");
const bundle = `"use strict";
const Kalam = (function () {
  const module = { exports: {} };
  const exports = module.exports;
${lib}
  return module.exports;
})();
${cli}`;
const bundlePath = path.join(DIST, "kalam-bundle.js");
fs.writeFileSync(bundlePath, bundle);

// 2) Le « blob » SEA (le bundle sert aussi de source au worker : asset kalam.js)
const configPath = path.join(DIST, "sea-config.json");
const blobPath = path.join(DIST, "kalam.blob");
fs.writeFileSync(configPath, JSON.stringify({
  main: bundlePath,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  useSnapshot: false,
  assets: { "kalam.js": bundlePath },
}, null, 2));
execFileSync(process.execPath, ["--experimental-sea-config", configPath], { stdio: "inherit" });

// 3) Copie de l'exécutable Node, icône et informations (Windows)
fs.copyFileSync(process.execPath, exe);
if (isWin) {
  const rceditModule = require("rcedit");
  const rcedit = typeof rceditModule === "function" ? rceditModule : rceditModule.rcedit;
  const ico = path.join(ROOT, "assets", "kalam.ico");
  const run = async () => {
    await rcedit(exe, {
      icon: ico,
      "file-version": version,
      "product-version": version,
      "version-string": {
        ProductName: "Kalam",
        FileDescription: "Kalam — lugha barmaja be l-arabi at-tchadi",
        CompanyName: "salah-barkai",
        LegalCopyright: "MIT",
        OriginalFilename: "kalam.exe",
        InternalName: "kalam",
      },
    });
  };
  module.exports = run().then(inject);
} else {
  inject();
}

// 4) Injection du blob dans l'exécutable
function inject() {
  const postject = require.resolve("postject/dist/cli.js");
  const args = [postject, exe, "NODE_SEA_BLOB", blobPath,
    "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"];
  if (process.platform === "darwin") args.push("--macho-segment-name", "NODE_SEA");
  execFileSync(process.execPath, args, { stdio: "inherit" });
  if (process.platform === "darwin") {
    execFileSync("codesign", ["--sign", "-", exe], { stdio: "inherit" });
  }
  for (const f of [bundlePath, configPath, blobPath]) fs.rmSync(f, { force: true });
  console.log(`\n${path.relative(ROOT, exe)} : ${(fs.statSync(exe).size / 1048576).toFixed(1)} Mo`);
}
