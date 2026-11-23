"""Vérificateur statique : trouve les erreurs sans exécuter le programme.

Utilisé par l'extension VS Code pour souligner les erreurs en rouge.
"""

import os

from .errors import KalamError
from .interpreter import Builtin, Interpreter, undefined_message
from .lexer import tokenize
from .parser import Node, parse

_GLOBALS = Interpreter().globals.vars
GLOBAL_NAMES = set(_GLOBALS)
BUILTIN_ARITY = {
    name: value.arity for name, value in _GLOBALS.items() if isinstance(value, Builtin)
}


def diagnostic(message, line, col, length, severity="error"):
    return {
        "line": line,
        "col": col if col is not None else 0,
        "length": length or 1,
        "message": message,
        "severity": severity,
    }


def check(source, path=None):
    """Renvoie une liste de diagnostics (dicts) pour le code source donné.

    `path` (facultatif) est le chemin du fichier : il sert à trouver les
    fichiers importés avec 'jib'.
    """
    try:
        program = parse(tokenize(source))
    except KalamError as e:
        return [diagnostic(e.message, e.line or 1, e.col, e.length)]
    base_dir = os.path.dirname(os.path.abspath(path)) if path else None
    return Checker(base_dir).run(program)


def children(node):
    for value in node.__dict__.values():
        if isinstance(value, Node):
            yield value
        elif isinstance(value, (list, tuple)):
            for item in value:
                if isinstance(item, Node):
                    yield item
                elif isinstance(item, (list, tuple)):
                    for sub in item:
                        if isinstance(sub, Node):
                            yield sub
                        elif isinstance(sub, list):
                            yield from (s for s in sub if isinstance(s, Node))


class Checker:
    def __init__(self, base_dir=None):
        self.base_dir = base_dir
        self.defined = set(GLOBAL_NAMES)
        self.user_defined = set()
        self.problems = []
        self.imports_unknown = False  # un 'jib' qu'on n'a pas pu lire
        self.seen_files = set()

    def run(self, program):
        self.collect(program)
        self.visit(program, in_loop=False, in_func=False)
        self.problems.sort(key=lambda d: (d["line"], d["col"]))
        return self.problems

    def collect(self, node):
        """1er passage : tous les noms définis quelque part dans le programme."""
        names = []
        if node.kind in ("Let", "FuncDef"):
            names.append(node.name)
        elif node.kind == "For":
            names.append(node.name)
        elif node.kind == "Assign" and node.target.kind == "Var":
            names.append(node.target.name)
        elif node.kind == "Try" and node.name:
            names.append(node.name)
        elif node.kind == "Import":
            self.collect_import(node)
        if node.kind in ("FuncDef", "Lambda"):
            names.extend(node.params)
        self.defined.update(names)
        self.user_defined.update(names)
        for child in children(node):
            self.collect(child)

    def resolve(self, node, base_dir):
        if base_dir is None:
            return None
        path = node.path if node.path.endswith(".klm") else node.path + ".klm"
        return os.path.normpath(os.path.join(base_dir, path))

    def collect_import(self, node, base_dir=None):
        """Ajoute les noms définis dans un fichier importé avec 'jib'."""
        full = self.resolve(node, base_dir or self.base_dir)
        if full is None:
            self.imports_unknown = True
            return
        if full in self.seen_files:
            return
        self.seen_files.add(full)
        try:
            with open(full, encoding="utf-8") as f:
                program = parse(tokenize(f.read()))
        except OSError:
            if base_dir is None:  # seulement pour les 'jib' du fichier ouvert
                self.report(node, f"al-file '{node.path}' da ma ligênah (fichier introuvable)")
            self.imports_unknown = True
            return
        except KalamError:
            self.imports_unknown = True
            return
        sub = Checker(os.path.dirname(full))
        sub.seen_files = self.seen_files
        sub.collect(program)
        self.defined |= sub.defined
        self.user_defined |= sub.user_defined
        self.imports_unknown |= sub.imports_unknown

    def report(self, node, message, length=None, severity="error"):
        self.problems.append(diagnostic(
            message, node.line, getattr(node, "col", 0),
            length or getattr(node, "length", 1), severity,
        ))

    def visit(self, node, in_loop, in_func):
        kind = node.kind

        if kind == "Var" and node.name not in self.defined and not self.imports_unknown:
            self.report(node, undefined_message(getattr(node, "raw", node.name)))

        elif kind == "Call" and node.callee.kind == "Var":
            name = node.callee.name
            arity = BUILTIN_ARITY.get(name)
            if arity is not None and name not in self.user_defined and len(node.args) != arity:
                self.report(
                    node.callee,
                    f"{name} bidôr {arity} argument, inta antêtah {len(node.args)}",
                )

        elif kind in ("Break", "Continue") and not in_loop:
            word = "agif" if kind == "Break" else "fut"
            self.report(node, f"'{word}' lâzim yabga juwa dôra (hors d'une boucle)", 0)

        elif kind == "Return" and not in_func:
            self.report(node, "'rajja' lâzim yabga juwa khidime (hors d'une fonction)", 0)

        if kind in ("While", "For"):
            in_loop = True
        if kind in ("FuncDef", "Lambda"):
            in_func, in_loop = True, False

        for child in children(node):
            self.visit(child, in_loop, in_func)
