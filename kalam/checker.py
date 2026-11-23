"""Vérificateur statique : trouve les erreurs sans exécuter le programme.

Utilisé par l'extension VS Code pour souligner les erreurs en rouge.
"""

from .errors import KalamError
from .interpreter import Interpreter
from .lexer import tokenize
from .parser import Node, parse

BUILTIN_ARITY = {
    name: fn.arity for name, fn in Interpreter().globals.vars.items()
}


def diagnostic(message, line, col, length, severity="error"):
    return {
        "line": line,
        "col": col if col is not None else 0,
        "length": length or 1,
        "message": message,
        "severity": severity,
    }


def check(source):
    """Renvoie une liste de diagnostics (dicts) pour le code source donné."""
    try:
        program = parse(tokenize(source))
    except KalamError as e:
        return [diagnostic(e.message, e.line or 1, e.col, e.length)]
    return Checker().run(program)


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
    def __init__(self):
        self.defined = set(BUILTIN_ARITY)
        self.user_defined = set()
        self.problems = []

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
        if node.kind in ("FuncDef", "Lambda"):
            names.extend(node.params)
        self.defined.update(names)
        self.user_defined.update(names)
        for child in children(node):
            self.collect(child)

    def report(self, node, message, length=None, severity="error"):
        self.problems.append(diagnostic(
            message, node.line, getattr(node, "col", 0),
            length or getattr(node, "length", 1), severity,
        ))

    def visit(self, node, in_loop, in_func):
        kind = node.kind

        if kind == "Var" and node.name not in self.defined:
            self.report(node, f"'{node.name}' ma ma'arûf (variable non définie)")

        elif kind == "Call" and node.callee.kind == "Var":
            name = node.callee.name
            arity = BUILTIN_ARITY.get(name)
            if arity is not None and name not in self.user_defined and len(node.args) != arity:
                self.report(
                    node.callee,
                    f"{name} bidôr {arity} argument, ligît {len(node.args)}",
                )

        elif kind in ("Break", "Continue") and not in_loop:
            word = "agif" if kind == "Break" else "fut"
            self.report(node, f"'{word}' barra min al-loop (hors d'une boucle)", 0)

        elif kind == "Return" and not in_func:
            self.report(node, "'rajja' barra min khidma (hors d'une fonction)", 0)

        if kind in ("While", "For"):
            in_loop = True
        if kind in ("FuncDef", "Lambda"):
            in_func, in_loop = True, False

        for child in children(node):
            self.visit(child, in_loop, in_func)
