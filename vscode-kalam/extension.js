const vscode = require("vscode");
const path = require("path");
const os = require("os");
const { Worker } = require("worker_threads");

// Le langage Kalam lui-même (copié depuis src/kalam.js à l'empaquetage).
// Il tourne dans VS Code : rien d'autre à installer.
const Kalam = require("./kalam.js");

let diagnostics;
const timers = new Map(); // uri -> timer (anti-rebond pendant la frappe)

// ---------- Soulignement des erreurs ----------

function runCheck(document) {
  if (document.languageId !== "kalam" || document.isClosed) return;
  if (!vscode.workspace.getConfiguration("kalam").get("verifier", true)) {
    diagnostics.delete(document.uri);
    return;
  }
  let problems;
  try {
    const file = document.uri.scheme === "file" ? document.fileName : null; // pour les 'jib'
    problems = Kalam.check(document.getText(), file);
  } catch (e) {
    console.error("Kalam check", e);
    return;
  }
  diagnostics.set(document.uri, problems.map((p) => toDiagnostic(document, p)));
}

// Kalam compte les colonnes en caractères (points de code), VS Code en unités UTF-16.
function utf16Column(lineText, col) {
  return Array.from(lineText).slice(0, col).join("").length;
}

function toDiagnostic(document, p) {
  const lineIndex = Math.min(Math.max(p.line - 1, 0), document.lineCount - 1);
  const lineText = document.lineAt(lineIndex).text;
  let start = Math.min(utf16Column(lineText, p.col), lineText.length);
  let end = Math.min(utf16Column(lineText, p.col + p.length), lineText.length);
  if (end <= start) {
    // Erreur en fin de ligne : souligner le dernier caractère visible.
    start = Math.max(0, lineText.trimEnd().length - 1);
    end = Math.max(start + 1, lineText.trimEnd().length);
  }
  const range = new vscode.Range(lineIndex, start, lineIndex, end);
  const severity =
    p.severity === "warning"
      ? vscode.DiagnosticSeverity.Warning
      : vscode.DiagnosticSeverity.Error;
  const d = new vscode.Diagnostic(range, p.message, severity);
  d.source = "kalam";
  return d;
}

function scheduleCheck(document, delay = 300) {
  if (document.languageId !== "kalam") return;
  const key = document.uri.toString();
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    runCheck(document);
  }, delay));
}

// ---------- Autocomplétion et aide au survol ----------

const DOCS = require("./docs.json");

function stripAccents(text) {
  return text.normalize("NFD").replace(/\p{Mn}/gu, "").replace(/'/g, "");
}

function keywordMarkdown(name, k) {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${name}** — *${k.sens}*\n\n${k.doc}\n\n`);
  md.appendCodeblock(k.exemple, "kalam");
  return md;
}

function builtinMarkdown(b) {
  const md = new vscode.MarkdownString();
  md.appendCodeblock(b.sig, "kalam");
  md.appendMarkdown(b.doc);
  return md;
}

// Noms définis par l'utilisateur dans le fichier (khalli x, khidime f, kulla i …)
function userNames(document) {
  const names = new Map();
  const re = /\b(khall[iî]|khid[iî]m[eê]|k[uû]ll[aâ])\s+([\p{L}_][\p{L}\p{N}_']*)/gu;
  const text = document.getText();
  let m;
  while ((m = re.exec(text))) {
    const kind = stripAccents(m[1]).startsWith("khidime") ? "khidime" : "variable";
    if (!names.has(m[2])) names.set(m[2], kind);
  }
  return names;
}

const completionProvider = {
  provideCompletionItems(document) {
    const items = [];
    for (const [name, k] of Object.entries(DOCS.keywords)) {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Keyword);
      item.detail = k.sens;
      item.documentation = keywordMarkdown(name, k);
      items.push(item);
    }
    for (const [name, b] of Object.entries(DOCS.builtins)) {
      const isConst = !b.sig.includes("(");
      const item = new vscode.CompletionItem(
        name,
        isConst ? vscode.CompletionItemKind.Constant : vscode.CompletionItemKind.Function
      );
      item.detail = b.sig;
      item.documentation = builtinMarkdown(b);
      if (!isConst) {
        item.insertText = new vscode.SnippetString(`${name}($0)`);
        item.command = { command: "editor.action.triggerParameterHints", title: "" };
      }
      items.push(item);
    }
    for (const [name, kind] of userNames(document)) {
      if (DOCS.keywords[name] || DOCS.builtins[name]) continue;
      const item = new vscode.CompletionItem(
        name,
        kind === "khidime" ? vscode.CompletionItemKind.Method : vscode.CompletionItemKind.Variable
      );
      item.detail = kind === "khidime" ? "khidime (fi l-file da)" : "mutaghayyir (fi l-file da)";
      items.push(item);
    }
    return items;
  },
};

const hoverProvider = {
  provideHover(document, position) {
    const range = document.getWordRangeAtPosition(position, /[\p{L}_][\p{L}\p{N}_']*/u);
    if (!range) return;
    const word = document.getText(range);
    const plain = stripAccents(word);
    const k = DOCS.keywords[plain.toLowerCase()];
    if (k) return new vscode.Hover(keywordMarkdown(plain.toLowerCase(), k), range);
    const b = DOCS.builtins[plain];
    if (b) return new vscode.Hover(builtinMarkdown(b), range);
  },
};

const signatureProvider = {
  provideSignatureHelp(document, position) {
    // Remonte jusqu'à la parenthèse ouvrante pour trouver la fonction appelée.
    const text = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    let depth = 0;
    let commas = 0;
    for (let i = text.length - 1; i >= 0; i--) {
      const c = text[i];
      if (c === ")" || c === "]" || c === "}") depth++;
      else if (c === "[" || c === "{") depth--;
      else if (c === "(") {
        if (depth === 0) {
          const m = /([\p{L}_][\p{L}\p{N}_']*)\s*$/u.exec(text.slice(0, i));
          const b = m && DOCS.builtins[stripAccents(m[1])];
          if (!b) return;
          const sig = new vscode.SignatureInformation(b.sig, new vscode.MarkdownString(b.doc));
          const inner = b.sig.slice(b.sig.indexOf("(") + 1, b.sig.indexOf(")"));
          sig.parameters = inner
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p && p !== "…")
            .map((p) => new vscode.ParameterInformation(p));
          const help = new vscode.SignatureHelp();
          help.signatures = [sig];
          help.activeSignature = 0;
          help.activeParameter = Math.min(commas, Math.max(0, sig.parameters.length - 1));
          return help;
        }
        depth--;
      } else if (c === "," && depth === 0) commas++;
    }
  },
};

// ---------- Exécution (F5) ----------

let lastTerminal = null;

async function runFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "kalam") {
    vscode.window.showWarningMessage("Iftah file .klm awwal (ouvrez d'abord un fichier .klm).");
    return;
  }
  const doc = editor.document;
  if (doc.isDirty && doc.uri.scheme === "file") await doc.save();
  const name = doc.uri.scheme === "file" ? path.basename(doc.fileName) : "barnâmij";
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  const baseDir = doc.uri.scheme === "file"
    ? path.dirname(doc.fileName)
    : folder ? folder.uri.fsPath : os.homedir();

  if (lastTerminal) lastTerminal.dispose();
  lastTerminal = vscode.window.createTerminal({
    name: `Kalam — ${name}`,
    pty: kalamPseudoterminal(doc.getText(), baseDir, name),
    iconPath: new vscode.ThemeIcon("play"),
  });
  lastTerminal.show();
}

// Un terminal « maison » : la sortie du programme s'y affiche, et les réponses
// aux questions (asal) y sont tapées. Ctrl+C arrête le programme.
function kalamPseudoterminal(source, baseDir, name) {
  const writeEmitter = new vscode.EventEmitter();
  const closeEmitter = new vscode.EventEmitter();
  const shared = new SharedArrayBuffer(8 + 65536);
  const control = new Int32Array(shared, 0, 2);
  const data = new Uint8Array(shared, 8);
  let worker = null;
  let waiting = false;
  let finished = false;
  let line = "";

  const write = (text) => writeEmitter.fire(text.replace(/\r?\n/g, "\r\n"));
  const dim = (text) => `\x1b[2m${text}\x1b[0m`;

  function answer(text, eof = false) {
    const bytes = Buffer.from(text, "utf8").subarray(0, data.length);
    data.set(bytes);
    control[1] = bytes.length;
    Atomics.store(control, 0, eof ? 2 : 1);
    Atomics.notify(control, 0);
    waiting = false;
  }

  function finish(message) {
    finished = true;
    worker = null;
    write("\n" + dim(message + " — addi ayyi zirr le tagfil (appuyez sur une touche pour fermer)") + "\n");
  }

  function start() {
    const t0 = Date.now();
    write(dim(`▶ kalam ${name}`) + "\n");
    worker = new Worker(path.join(__dirname, "runner.js"), {
      workerData: { source, baseDir, shared },
      resourceLimits: { stackSizeMb: 64 },
    });
    worker.on("message", (m) => {
      if (m.type === "out") write(m.text + "\n");
      else if (m.type === "ask") { write(m.prompt); waiting = true; }
      else if (m.type === "error") write(`\x1b[31m${m.text}\x1b[0m\n`);
      else if (m.type === "done") finish(`${m.ok ? "khalas" : "wagaf be mushkila"} (${Date.now() - t0} ms)`);
    });
    worker.on("error", (e) => {
      write(`\x1b[31mMushkila dâkhiliya : ${e.message}\x1b[0m\n`);
      finish("wagaf");
    });
  }

  return {
    onDidWrite: writeEmitter.event,
    onDidClose: closeEmitter.event,
    open: start,
    close() {
      if (worker) worker.terminate();
    },
    handleInput(input) {
      if (finished) { closeEmitter.fire(); return; }
      if (input === "\x03") { // Ctrl+C
        write("^C\n");
        if (worker) worker.terminate();
        finish("Al-barnâmij wagaf (programme arrêté)");
        return;
      }
      if (!waiting) return;
      for (const ch of input) {
        if (ch === "\r" || ch === "\n") {
          write("\n");
          const text = line;
          line = "";
          answer(text);
          if (!waiting) return;
        } else if (ch === "\x7f" || ch === "\b") {
          if (line) {
            line = Array.from(line).slice(0, -1).join("");
            write("\b \b");
          }
        } else if (ch === "\x04") { // Ctrl+D : fin de l'entrée
          answer("", true);
        } else if (ch >= " ") {
          line += ch;
          write(ch);
        }
      }
    },
  };
}

// ---------- Activation ----------

function activate(context) {
  diagnostics = vscode.languages.createDiagnosticCollection("kalam");
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider("kalam", completionProvider),
    vscode.languages.registerHoverProvider("kalam", hoverProvider),
    vscode.languages.registerSignatureHelpProvider("kalam", signatureProvider, "(", ","),
    vscode.commands.registerCommand("kalam.run", runFile),
    vscode.workspace.onDidOpenTextDocument((doc) => scheduleCheck(doc, 0)),
    vscode.workspace.onDidChangeTextDocument((e) => scheduleCheck(e.document)),
    vscode.workspace.onDidSaveTextDocument((doc) => scheduleCheck(doc, 0)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      clearTimeout(timers.get(doc.uri.toString()));
      diagnostics.delete(doc.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("kalam")) {
        vscode.workspace.textDocuments.forEach((doc) => scheduleCheck(doc, 0));
      }
    }),
    vscode.window.onDidCloseTerminal((t) => {
      if (t === lastTerminal) lastTerminal = null;
    })
  );

  vscode.workspace.textDocuments.forEach((doc) => scheduleCheck(doc, 0));
}

function deactivate() {
  timers.forEach(clearTimeout);
}

module.exports = { activate, deactivate };
