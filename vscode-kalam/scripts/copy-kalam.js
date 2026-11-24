// Copie le langage Kalam (src/kalam.js) dans l'extension avant l'empaquetage.
// L'extension n'a besoin de rien d'autre : Kalam tourne directement dans VS Code.
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "src", "kalam.js");
const dest = path.join(__dirname, "..", "kalam.js");
fs.copyFileSync(src, dest);
fs.rmSync(path.join(__dirname, "..", "python"), { recursive: true, force: true }); // ancienne version
console.log("Kalam copié dans", dest);
