const vscode = require("vscode");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let terminal;
let diagnostics;
const timers = new Map();     // uri -> timer (anti-rebond pendant la frappe)
let warnedMissingPython = false;

// L'interpréteur Kalam est copié dans l'extension (dossier python/) à l'empaquetage.
const BUNDLED = path.join(__dirname, "python");

function pythonPath() {
  const configured = vscode.workspace.getConfiguration("kalam").get("python");
  if (configured) return configured;
  return process.platform === "win32" ? "python" : "python3";
}

function kalamEnv() {
  const env = { ...process.env, PYTHONIOENCODING: "utf-8" };
  if (fs.existsSync(BUNDLED)) {
    env.PYTHONPATH = env.PYTHONPATH ? BUNDLED + path.delimiter + env.PYTHONPATH : BUNDLED;
  }
  return env;
}

async function warnPython(detail) {
  if (warnedMissingPython) return;
  warnedMissingPython = true;
  const choice = await vscode.window.showWarningMessage(
    `Kalam a besoin de Python 3.8+ (« ${pythonPath()} » : ${detail}). ` +
      "Installez Python ou réglez kalam.python.",
    "Télécharger Python",
    "Réglages"
  );
  if (choice === "Télécharger Python") {
    vscode.env.openExternal(vscode.Uri.parse("https://www.python.org/downloads/"));
  } else if (choice === "Réglages") {
    vscode.commands.executeCommand("workbench.action.openSettings", "kalam.python");
  }
}

// ---------- Soulignement des erreurs ----------

function runCheck(document) {
  if (document.languageId !== "kalam") return;
  if (!vscode.workspace.getConfiguration("kalam").get("verifier", true)) {
    diagnostics.delete(document.uri);
    return;
  }
  const version = document.version;
  const args = ["-m", "kalam", "--check", "-"];
  if (document.uri.scheme === "file") args.push(document.fileName); // pour les 'jib'
  const proc = spawn(pythonPath(), args, {
    env: kalamEnv(),
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (d) => (stdout += d));
  proc.stderr.on("data", (d) => (stderr += d));

  proc.on("error", (err) => warnPython(err.code || err.message));

  proc.on("close", () => {
    // Le document a changé pendant la vérification : un nouveau résultat arrive.
    if (document.isClosed || document.version !== version) return;
    let problems;
    try {
      problems = JSON.parse(stdout);
    } catch {
      if (stderr.trim()) warnPython(stderr.trim().split("\n").pop());
      return;
    }
    diagnostics.set(document.uri, problems.map((p) => toDiagnostic(document, p)));
  });

  proc.stdin.end(document.getText(), "utf8");
}

function toDiagnostic(document, p) {
  const lineIndex = Math.min(Math.max(p.line - 1, 0), document.lineCount - 1);
  const lineText = document.lineAt(lineIndex).text;
  let start = Math.min(p.col, lineText.length);
  let end = Math.min(start + p.length, lineText.length);
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

async function runFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "kalam") {
    vscode.window.showWarningMessage("Iftah file .klm awwal (ouvrez d'abord un fichier .klm).");
    return;
  }
  if (editor.document.isDirty) {
    await editor.document.save();
  }
  const file = editor.document.fileName;

  if (!terminal || terminal.exitStatus !== undefined) {
    const env = kalamEnv();
    terminal = vscode.window.createTerminal({
      name: "Kalam",
      env: { PYTHONPATH: env.PYTHONPATH || "", PYTHONIOENCODING: "utf-8" },
    });
  }
  terminal.show(true);
  const isPowerShell = /powershell|pwsh/i.test(vscode.env.shell || "");
  const prefix = isPowerShell ? "& " : "";
  terminal.sendText(`${prefix}"${pythonPath()}" -m kalam "${file}"`);
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
        warnedMissingPython = false;
        vscode.workspace.textDocuments.forEach((doc) => scheduleCheck(doc, 0));
      }
    }),
    vscode.window.onDidCloseTerminal((t) => {
      if (t === terminal) terminal = undefined;
    })
  );

  vscode.workspace.textDocuments.forEach((doc) => scheduleCheck(doc, 0));
}

function deactivate() {
  timers.forEach(clearTimeout);
}

module.exports = { activate, deactivate };
