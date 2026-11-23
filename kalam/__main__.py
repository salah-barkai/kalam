"""Point d'entrée : `python -m kalam fichier.klm` ou `python -m kalam` (REPL)."""

import os
import sys

from . import __version__
from .errors import KalamError
from .interpreter import Interpreter, to_text
from .lexer import strip_accents, tokenize
from .parser import parse

BLOCK_OPENERS = {"kan", "tulma", "kulla", "khidime", "jarrib"}


def run_file(path):
    try:
        with open(path, encoding="utf-8") as f:
            source = f.read()
    except OSError:
        print(f"Mushkila: al-file '{path}' da ma ligênah (fichier introuvable)", file=sys.stderr)
        return 1
    try:
        Interpreter(base_dir=os.path.dirname(os.path.abspath(path))).run(parse(tokenize(source)))
    except KalamError as e:
        print(e, file=sys.stderr)
        return 1
    except RecursionError:
        print("Mushkila: al-khidime nâdat nafisha katîr marra (récursion trop profonde)", file=sys.stderr)
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
    print(f"Kalam {__version__} — marhaba! Aktib 'amrug' walla Ctrl+C kan tidôr tamrug.")
    interp = Interpreter()
    while True:
        try:
            source = input("kalam> ")
            if strip_accents(source.strip()) in ("amrug", "murug", "marug", "exit", "quit"):
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
            print("Mushkila: al-khidime nâdat nafisha katîr marra (récursion trop profonde)")
    print("Ma'a salâma!")


def main(argv=None):
    sys.setrecursionlimit(10000)
    # Les accents (ô, û, â...) doivent s'afficher correctement sous Windows.
    for stream in (sys.stdout, sys.stderr, sys.stdin):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] in ("-h", "--help", "awinni"):
        print("Kikkêf tisawwi : python -m kalam [file.klm]")
        return 0
    if argv and argv[0] == "--check":
        # Analyse sans exécuter ; sortie JSON (utilisée par l'extension VS Code).
        # `--check -` lit le code sur l'entrée standard.
        import json
        from .checker import check
        # `--check - chemin.klm` : code sur stdin, chemin utilisé pour les 'jib'.
        path = argv[1] if len(argv) > 1 else "-"
        real_path = argv[2] if len(argv) > 2 else (None if path == "-" else path)
        if path == "-":
            source = sys.stdin.buffer.read().decode("utf-8", errors="replace")
        else:
            with open(path, encoding="utf-8") as f:
                source = f.read()
        sys.stdout.write(json.dumps(check(source, real_path), ensure_ascii=False))
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
