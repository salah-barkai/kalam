// Tests de Kalam :  npm test   (ou  node --test test/)
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const Kalam = require("../src/kalam.js");

const ROOT = path.resolve(__dirname, "..");

function run(source, inputs = []) {
  const out = [];
  const feed = inputs.slice();
  Kalam.run(source, { output: (l) => out.push(l), input: () => (feed.length ? feed.shift() : null) });
  return out;
}

function throwsKalam(fn, pattern) {
  assert.throws(fn, (e) => e instanceof Kalam.KalamError && (!pattern || pattern.test(e.toString())));
}

test("ori", () => {
  assert.deepEqual(run('ori("salam")'), ["salam"]);
  assert.deepEqual(run("ori(1 + 2 * 3, sahi, mafi)"), ["7 sahi mafi"]);
});

test("les accents sont facultatifs", () => {
  assert.deepEqual(run('khalli x = 1\nkân x == 1\nôri("ê")\nkhalâs'), ["ê"]);
});

test("variables et affectation", () => {
  assert.deepEqual(run("khalli x = 5\nx = x + 1\nori(x)"), ["6"]);
});

test("kan / walla kan / walla", () => {
  const src = `
khidime wên_nimra(n)
    kan n < 0
        rajja "tihit"
    walla kan n == 0
        rajja "sifir"
    walla
        rajja "fôg"
    khalas
khalas
ori(wên_nimra(-3), wên_nimra(0), wên_nimra(4))`;
  assert.deepEqual(run(src), ["tihit sifir fôg"]);
});

test("kulla : intervalles et listes", () => {
  assert.deepEqual(run("kulla i fi min 1 lahaddi 3\nori(i)\nkhalas"), ["1", "2", "3"]);
  assert.deepEqual(run("kulla i fi min 3 lahaddi 1\nori(i)\nkhalas"), ["3", "2", "1"]);
  assert.deepEqual(run('kulla c fi ["a", "b"]\nori(c)\nkhalas'), ["a", "b"]);
});

test("tulma, agif, fut", () => {
  const src = `
khalli n = 0
tulma sahi
    n = n + 1
    kan n == 2
        fut
    khalas
    kan n > 4
        agif
    khalas
    ori(n)
khalas`;
  assert.deepEqual(run(src), ["1", "3", "4"]);
});

test("récursion et fermetures", () => {
  const src = `
khidime fib(n)
    kan n < 2
        rajja n
    khalas
    rajja fib(n - 1) + fib(n - 2)
khalas
khidime addad(a)
    rajja khidime(b) rajja a + b khalas
khalas
khalli zid3 = addad(3)
ori(fib(15), zid3(4))`;
  assert.deepEqual(run(src), ["610 7"]);
});

test("listes et dikt", () => {
  const src = `
khalli l = [1, 2]
zid(l, 3)
l[0] = 10
khalli d = {usum: "Ali", umur: 30}
d.madina = "Ndjamena"
ori(l, gadur(l), d.usum, d["umur"], d.madina)`;
  assert.deepEqual(run(src), ["[10, 2, 3] 3 Ali 30 Ndjamena"]);
});

test("textes, division, nombres comme en Python", () => {
  assert.deepEqual(run('ori("x=" + 5, 7 / 2, 6 / 3)'), ["x=5 3.5 2"]);
  assert.deepEqual(run("ori(-7 % 3, 0.1 + 0.2, 1 / 100000, garrib(2.5), garrib(2.675, 2))"),
    ["2 0.30000000000000004 1e-05 2 2.67"]);
  assert.deepEqual(run(`ori(["a", "b'c"], {zêt: 1})`), [`['a', "b'c"] {'zêt': 1}`]);
});

test("logique", () => {
  assert.deepEqual(run("ori(sahi wa ma ghalat, ghalat aw 0, 1 == 1.0)"), ["sahi 0 sahi"]);
});

test("asal", () => {
  assert.deepEqual(run('khalli x = nimra(asal("?"))\nori(x * 2)', ["21"]), ["42"]);
  throwsKalam(() => run('asal("?")'), /fin de l'entrée/);
});

test("erreurs", () => {
  throwsKalam(() => run("ori(y)"), /satir 1/);
  throwsKalam(() => run("ori(1 / 0)"));
  throwsKalam(() => run("kan sahi\nori(1)"));
  throwsKalam(() => run('ori("a" - 1)'));
  throwsKalam(() => run("agif"));
});

test("le nom de variable est affiché comme il est écrit", () => {
  throwsKalam(() => run("ori(natîja)"), /'natîja' da ma ligênah/);
});

test("raccourcis += -= *= /=", () => {
  assert.deepEqual(run("khalli x = 5\nx += 3\nx -= 1\nx *= 2\nx /= 7\nori(x)"), ["2"]);
  assert.deepEqual(run('khalli l = [1]\nl[0] += 4\nkhalli t = "a"\nt += "b"\nori(l, t)'), ["[5] ab"]);
});

test("les clés de dikt gardent leurs accents", () => {
  assert.deepEqual(run('khalli d = {zêt: 1}\nori(d["zêt"], d.zêt, "zêt" fi d)'), ["1 1 sahi"]);
});

test("appartenance avec fi", () => {
  assert.deepEqual(run('ori(2 fi [1, 2], "x" fi "bamya", "a" fi {a: 1}, ma 5 fi [1])'), ["sahi ghalat sahi sahi"]);
});

test("fonctions mathématiques", () => {
  assert.deepEqual(run("ori(aktar(3, 9, 2), agall([4, 1]), jumla([1, 2, 3]), garrib(2.6), mutlag(-3))"), ["9 1 6 3 3"]);
});

test("fonctions de textes et de listes", () => {
  const src = 'ori(fattish("bamya", "y"), fattish([5, 6], 6), ghayyir("salam", "a", "o"), '
    + 'gata("Ndjamena", 1, 3), gallib("abc"), naddif(" x "), bada_be("Sarh", "Sa"))';
  assert.deepEqual(run(src), ["3 1 solom dj cba x sahi"]);
  assert.deepEqual(run('ori(gadur("Tchad 👏"), gallib("ab👏"))'), ["7 👏ba"]);
});

test("jarrib / mushkila attrape les erreurs", () => {
  const src = 'jarrib\n    ori(1 / 0)\n    ori("la")\nmushkila m\n    ori("ligêna:", m)\nkhalas';
  assert.deepEqual(run(src), ["ligêna: ma tagdar tigassim be sifir (division par zéro)"]);
});

test("zagil jette n'importe quelle valeur", () => {
  assert.deepEqual(run("jarrib\n    zagil {kod: 7}\nmushkila e\n    ori(e.kod)\nkhalas"), ["7"]);
  throwsKalam(() => run('zagil "khalas"'), /khalas/);
});

test("jarrib ne bloque pas rajja / agif", () => {
  const src = `
khidime f()
    kulla i fi min 1 lahaddi 5
        jarrib
            kan i == 3
                rajja i
            khalas
        mushkila
            ori("la")
        khalas
    khalas
khalas
ori(f())`;
  assert.deepEqual(run(src), ["3"]);
});

test("jib et fichiers", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "kalam-test-"));
  try {
    fs.writeFileSync(path.join(d, "adawat.klm"), "khidime marratên(x)\n    rajja x * 2\nkhalas\n");
    const out = [];
    Kalam.run('jib "adawat"\njib "adawat.klm"\nori(marratên(21))\n'
      + 'aktib("a.txt", "salam")\naktib("a.txt", "!", sahi)\nori(agri("a.txt"))',
    { output: (l) => out.push(l), baseDir: d });
    assert.deepEqual(out, ["42", "salam!"]);
    throwsKalam(() => Kalam.run('jib "mafi"', { baseDir: d }));
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test("récursion profonde : erreur claire, pas de plantage", () => {
  throwsKalam(() => run("khidime f(n)\n    rajja f(n + 1)\nkhalas\nf(1)"), /récursion trop profonde/);
});

test("maxSteps arrête une boucle infinie", () => {
  assert.throws(() => Kalam.run("tulma sahi\n    khalli x = 1\nkhalas", { maxSteps: 1000, output() {} }),
    (e) => e instanceof Kalam.KalamError && /boucle infinie/.test(e.toString()));
});

// ---------------------------------------------------------------- vérificateur

test("vérificateur : programme correct", () => {
  const src = "khidime f(a)\n    rajja a * 2\nkhalas\nkulla i fi min 1 lahaddi 3\n    ori(f(i))\nkhalas\n";
  assert.deepEqual(Kalam.check(src), []);
});

test("vérificateur : position des erreurs de syntaxe", () => {
  const [d] = Kalam.check("khalli x = 1\nkan x > 1\n    ori(x)\n");
  assert.deepEqual([d.line, d.col, d.length], [2, 0, 3]);
  const [s] = Kalam.check('ori("abc\n');
  assert.deepEqual([s.line, s.col], [1, 4]);
});

test("vérificateur : problèmes trouvés sans exécuter", () => {
  const src = "ori(y)\nagif\nrajja 1\nori(gadur(1, 2))\nkhidime f(a)\n    rajja a + b\nkhalas\n";
  assert.deepEqual(Kalam.check(src).map((d) => [d.line, d.col]), [[1, 4], [2, 0], [3, 0], [4, 4], [6, 14]]);
});

test("vérificateur : cas sans fausse alerte", () => {
  assert.deepEqual(Kalam.check("jarrib\n    zagil 1\nmushkila m\n    ori(m)\nkhalas\n"), []);
  assert.deepEqual(Kalam.check('jib "adawat"\nori(salam(1))\n'), []);
  assert.deepEqual(Kalam.check("khidime gadur(a, b)\n    rajja a\nkhalas\nori(gadur(1, 2))\n"), []);
});

test("vérificateur : suit les fichiers importés", () => {
  const file = path.join(ROOT, "examples", "x.klm");
  assert.deepEqual(Kalam.check('jib "adawat"\nori(khatt(3))', file), []);
  assert.equal(Kalam.check('jib "adawat"\nori(z)', file).length, 1);
  assert.match(Kalam.check('jib "mafi_hini"', file)[0].message, /fichier introuvable/);
});

// ---------------------------------------------------------------- documentation et cours

test("l'aide VS Code couvre tous les mots-clés et toutes les fonctions", () => {
  const docs = JSON.parse(fs.readFileSync(path.join(ROOT, "vscode-kalam", "docs.json"), "utf8"));
  assert.deepEqual(new Set(Object.keys(docs.keywords)), Kalam.KEYWORDS);
  assert.deepEqual(new Set(Object.keys(docs.builtins)), new Set(Kalam.builtinNames()));
});

test("tous les programmes du cours s'exécutent comme annoncé", () => {
  const { processCourse, COURSE_MD } = require("../tools/build-site.js");
  const { count } = processCourse(fs.readFileSync(COURSE_MD, "utf8"));
  assert.ok(count > 90);
});

test("tous les exemples sont sans erreur", () => {
  const dir = path.join(ROOT, "examples");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".klm"))) {
    const file = path.join(dir, f);
    assert.deepEqual(Kalam.check(fs.readFileSync(file, "utf8"), file), [], f);
  }
});

// ---------------------------------------------------------------- ligne de commande

test("ligne de commande : exécution, saisie, erreurs, vérification", () => {
  const cli = path.join(ROOT, "src", "cli.js");
  const opts = { cwd: path.join(ROOT, "examples"), encoding: "utf8" };
  assert.match(execFileSync(process.execPath, [cli, "salam.klm"], opts), /Salam aleykum/);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "kalam-cli-"));
  try {
    fs.writeFileSync(path.join(d, "a.klm"), 'khalli n = nimra(asal("n? "))\nori(n * 2)\n');
    assert.equal(execFileSync(process.execPath, [cli, path.join(d, "a.klm")], { ...opts, input: "21\n" }), "n? 42\n");
    fs.writeFileSync(path.join(d, "e.klm"), "ori(y)\n");
    assert.throws(() => execFileSync(process.execPath, [cli, path.join(d, "e.klm")], { ...opts, stdio: "pipe" }),
      (e) => e.status === 1 && /satir 1/.test(e.stderr));
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
  const diag = JSON.parse(execFileSync(process.execPath, [cli, "--check", "-"], { ...opts, input: "kan sahi\n" }));
  assert.equal(diag[0].line, 1);
  const repl = execFileSync(process.execPath, [cli], { ...opts, input: "1 + 2 * 3\namrug\n" });
  assert.match(repl, /kalam> 7/);
});
