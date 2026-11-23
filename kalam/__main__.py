"""Point d'entrée : `python -m kalam fichier.klm` ou `python -m kalam` (REPL)."""

import sys

from . import __version__
from .errors import KalamError
from .interpreter import Interpreter, to_text
from .lexer import tokenize
from .parser import parse

BLOCK_OPENERS = {"kan", "tulma", "kulla", "khidma"}


def run_file(path):
    try:
        with open(path, encoding="utf-8") as f:
            source = f.read()
    except OSError:
        print(f"Ghalat: ma ligît al-file '{path}' (fichier introuvable)", file=sys.stderr)
        return 1
    try:
        Interpreter().run(parse(tokenize(source)))
    except KalamError as e:
        print(e, file=sys.stderr)
        return 1
    except RecursionError:
        print("Ghalat: al-khidma nâdat nafisha katîr (récursion trop profonde)", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
    return 0


def block_depth(source):
    """Compte les blocs ouverts pour savoir si le REPL doit attendre 'khalas'."""
    try:
        tokens = tokenize(source)
    except KalamError:
        return 0
    depth = 0
    prev = None
    for t in tokens:
        if t.type == "KW":
            if t.value in BLOCK_OPENERS and not (t.value == "kan" and prev == "walla"):
                depth += 1
            elif t.value == "khalas":
                depth -= 1
        prev = t.value if t.type == "KW" else None
    return depth


def repl():
    print(f"Kalam {__version__} — ahlan wa sahlan! Aktub 'marûg' wala Ctrl+C le tamrug.")
    interp = Interpreter()
    while True:
        try:
            source = input("kalam> ")
            if source.strip() in ("marug", "marûg", "exit", "quit"):
                break
            while block_depth(source) > 0:
                source += "\n" + input("  ...> ")
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not source.strip():
            continue
        try:
            program = parse(tokenize(source))
            # Affiche la valeur d'une expression seule, comme une calculatrice.
            if len(program.body) == 1 and program.body[0].kind == "ExprStmt":
                value = interp.evaluate(program.body[0].expr, interp.globals)
                if value is not None:
                    print(to_text(value, nested=True))
            else:
                interp.run(program)
        except KalamError as e:
            print(e)
        except RecursionError:
            print("Ghalat: récursion trop profonde")
    print("Ma'a s-salâma!")


def main(argv=None):
    sys.setrecursionlimit(10000)
    # Les accents (ô, û, â...) doivent s'afficher correctement sous Windows.
    for stream in (sys.stdout, sys.stderr, sys.stdin):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] in ("-h", "--help", "musa'ada"):
        print("Isti'mâl : python -m kalam [file.klm]")
        return 0
    if argv and argv[0] in ("-v", "--version"):
        print(f"Kalam {__version__}")
        return 0
    if argv:
        return run_file(argv[0])
    repl()
    return 0


if __name__ == "__main__":
    sys.exit(main())
