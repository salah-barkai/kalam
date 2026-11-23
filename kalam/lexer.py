"""Lexer (taggâ') : découpe le code source Kalam en jetons."""

import unicodedata

from .errors import KalamError

# Mots-clés en arabe tchadien (écriture latine).
KEYWORDS = {
    "khalli",   # let       – déclarer une variable
    "kan",      # if        – si
    "walla",    # else / elif
    "khalas",   # end       – fin d'un bloc
    "tulma",    # while     – tant que
    "kulla",    # for each  – pour chaque
    "fi",       # in        – dans
    "min",      # from      – de
    "lahaddi",  # until     – jusqu'à
    "khidime",  # function  – fonction (travail)
    "rajja",    # return    – retourner
    "agif",     # break     – arrêter la boucle
    "fut",      # continue  – passer au suivant
    "sahi",     # true      – vrai
    "ghalat",   # false     – faux
    "mafi",     # null      – rien
    "wa",       # and       – et
    "aw",       # or        – ou
    "ma",       # not       – non
}

TWO_CHAR_OPS = {"==", "!=", "<=", ">="}
ONE_CHAR_OPS = set("+-*/%<>=()[]{},:.")
ESCAPES = {"n": "\n", "t": "\t", "\\": "\\", '"': '"', "'": "'"}


def strip_accents(text):
    """'ôri' -> 'ori', 'khalâs' -> 'khalas' : les accents sont optionnels."""
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


class Token:
    __slots__ = ("type", "value", "line", "col", "length")

    def __init__(self, type_, value, line, col=0, length=1):
        self.type = type_
        self.value = value
        self.line = line
        self.col = col          # colonne 0-based
        self.length = length    # nombre de caractères dans le source

    def __repr__(self):
        return f"Token({self.type}, {self.value!r}, satir={self.line}:{self.col})"


def tokenize(source):
    tokens = []
    i = 0
    line = 1
    line_start = 0  # index du début de la ligne courante
    depth = 0       # à l'intérieur de () [] {} les retours à la ligne sont ignorés
    n = len(source)

    def add(type_, value, start):
        tokens.append(Token(type_, value, line, start - line_start, max(1, i - start)))

    while i < n:
        c = source[i]

        if c == "\n":
            if depth == 0:
                tokens.append(Token("NL", None, line, i - line_start, 1))
            line += 1
            i += 1
            line_start = i
            continue

        if c in " \t\r":
            i += 1
            continue

        if c == "#":
            while i < n and source[i] != "\n":
                i += 1
            continue

        start = i

        if c.isdigit():
            while i < n and source[i].isdigit():
                i += 1
            if i + 1 < n and source[i] == "." and source[i + 1].isdigit():
                i += 1
                while i < n and source[i].isdigit():
                    i += 1
                add("NUM", float(source[start:i]), start)
            else:
                add("NUM", int(source[start:i]), start)
            continue

        if c.isalpha() or c == "_":
            while i < n and (source[i].isalnum() or source[i] in "_'"):
                i += 1
            word = source[start:i]
            plain = strip_accents(word).replace("'", "")
            if plain.lower() in KEYWORDS:
                add("KW", plain.lower(), start)
            else:
                add("ID", plain, start)
            continue

        if c in "\"'":
            quote = c
            i += 1
            chars = []
            while i < n and source[i] not in (quote, "\n"):
                if source[i] == "\\" and i + 1 < n and source[i + 1] != "\n":
                    i += 1
                    chars.append(ESCAPES.get(source[i], "\\" + source[i]))
                else:
                    chars.append(source[i])
                i += 1
            if i >= n or source[i] != quote:
                raise KalamError(
                    "al-kitaba di ma indaha guillemet fôg al-akhir (guillemet fermant manquant)",
                    line, start - line_start, max(1, i - start),
                )
            i += 1
            add("STR", "".join(chars), start)
            continue

        if source[i:i + 2] in TWO_CHAR_OPS:
            i += 2
            add("OP", source[start:i], start)
            continue

        if c in ONE_CHAR_OPS:
            if c in "([{":
                depth += 1
            elif c in ")]}":
                depth = max(0, depth - 1)
            i += 1
            add("OP", c, start)
            continue

        raise KalamError(
            f"harf {c!r} da ma na'arfah (caractère inconnu)", line, start - line_start, 1
        )

    tokens.append(Token("NL", None, line, i - line_start, 1))
    tokens.append(Token("EOF", None, line, i - line_start, 1))
    return tokens
