const vscode = require("vscode");
const { spawn } = require("child_process");

let terminal;
let diagnostics;
const timers = new Map();     // uri -> timer (anti-rebond pendant la frappe)
let warnedMissingPython = false;

function pythonPath() {
  return vscode.workspace.getConfiguration("kalam").get("python") || "python";
}

// ---------- Soulignement des erreurs ----------

function runCheck(document) {
  if (document.languageId !== "kalam") return;
  if (!vscode.workspace.getConfiguration("kalam").get("verifier", true)) {
    diagnostics.delete(document.uri);
    return;
  }
  const version = document.version;
  const proc = spawn(pythonPath(), ["-m", "kalam", "--check", "-"], {
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (d) => (stdout += d));
  proc.stderr.on("data", (d) => (stderr += d));

  proc.on("error", (err) => {
    if (!warnedMissingPython) {
      warnedMissingPython = true;
      vscode.window.showWarningMessage(
        `Kalam : impossible de lancer « ${pythonPath()} » (${err.code || err.message}). ` +
          "Vérifiez le réglage kalam.python."
      );
    }
  });

  proc.on("close", () => {
    // Le document a changé pendant la vérification : un nouveau résultat arrive.
    if (document.isClosed || document.version !== version) return;
    let problems;
    try {
      problems = JSON.parse(stdout);
    } catch {
      if (stderr.includes("No module named kalam") && !warnedMissingPython) {
        warnedMissingPython = true;
        vscode.window.showWarningMessage(
          "Kalam : le module Python « kalam » n'est pas installé. " +
            "Lancez « python -m pip install -e . » dans le dossier du projet Kalam."
        );
      }
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
    terminal = vscode.window.createTerminal("Kalam");
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
