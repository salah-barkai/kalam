const vscode = require("vscode");

let terminal;

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("kalam.run", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "kalam") {
        vscode.window.showWarningMessage("Iftah file .klm awwal (ouvrez d'abord un fichier .klm).");
        return;
      }
      if (editor.document.isDirty) {
        await editor.document.save();
      }
      const python = vscode.workspace.getConfiguration("kalam").get("python") || "python";
      const file = editor.document.fileName;

      if (!terminal || terminal.exitStatus !== undefined) {
        terminal = vscode.window.createTerminal("Kalam");
      }
      terminal.show(true);
      const isPowerShell = /powershell|pwsh/i.test(vscode.env.shell || "");
      const prefix = isPowerShell ? "& " : "";
      terminal.sendText(`${prefix}"${python}" -m kalam "${file}"`);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((t) => {
      if (t === terminal) terminal = undefined;
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
