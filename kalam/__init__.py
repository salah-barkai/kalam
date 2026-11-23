"""Kalam — lugha barmaja be l-arabi at-tchadi (langage de programmation en arabe tchadien)."""

from .errors import KalamError
from .interpreter import Interpreter
from .lexer import tokenize
from .parser import parse

__version__ = "0.1.0"


def run_source(source, interpreter=None):
    interpreter = interpreter or Interpreter()
    interpreter.run(parse(tokenize(source)))
    return interpreter


__all__ = ["KalamError", "Interpreter", "tokenize", "parse", "run_source"]
