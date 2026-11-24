// Publie le site (dossier site/) sur la branche gh-pages de GitHub.
//
//   node tools/build-site.js     construit le site et le PDF
//   node tools/deploy-pages.js   publie sur https://<compte>.github.io/kalam/
//
// La branche gh-pages ne contient que le site construit ; elle est remplacée
// à chaque publication.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

if (!fs.existsSync(path.join(SITE, "index.html"))) {
  console.error("Le site n'est pas construit : lancez d'abord  node tools/build-site.js");
  process.exit(1);
}

const remote = git(["remote", "get-url", "origin"], ROOT);
const commit = git(["rev-parse", "--short", "HEAD"], ROOT);
// Le dépôt temporaire reprend l'identité git du projet (pas la config globale).
const identity = [];
for (const key of ["user.name", "user.email"]) {
  try {
    identity.push("-c", `${key}=${git(["config", key], ROOT)}`);
  } catch (e) {
    /* non configuré */
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kalam-pages-"));
try {
  fs.cpSync(SITE, tmp, { recursive: true });
  // Sans ce fichier, GitHub Pages (Jekyll) ignorerait les fichiers commençant par « _ ».
  fs.writeFileSync(path.join(tmp, ".nojekyll"), "");
  git(["init", "-q", "-b", "gh-pages"], tmp);
  git(["add", "-A"], tmp);
  git([...identity, "commit", "-q", "-m", `Site Kalam (depuis ${commit})`], tmp);
  git(["push", "-q", "--force", remote, "gh-pages"], tmp);
  console.log("Site publié sur la branche gh-pages.");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
