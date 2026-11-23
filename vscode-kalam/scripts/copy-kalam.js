// Copie l'interpréteur Python Kalam dans l'extension avant l'empaquetage,
// pour que l'extension marche sans « pip install » (seul Python est requis).
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "kalam");
const dest = path.join(__dirname, "..", "python", "kalam");

fs.rmSync(path.join(__dirname, "..", "python"), { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const file of fs.readdirSync(src)) {
  if (file.endsWith(".py")) {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
  }
}
console.log("Interpréteur Kalam copié dans", dest);
