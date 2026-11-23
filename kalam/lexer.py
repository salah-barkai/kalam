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
    "khidma",   # function  – fonction
    "rajja",    # return    – retourner
    "agif",     # break     – arrêter la boucle
    "fut",      # continue  – passer au suivant
    "sahi",     # true      – vrai
    "khalat",   # false     – faux
    "mafi",     # null      – rien
    "wa",       # and       – et
    "aw",       # or        – ou
    "ma",       # not       – non
}

TWO_CHAR_OPS = {"==", "!=", "<=", ">="}
ONE_CHAR_OPS = set("+-*/%<>=()[]{},:.")


def strip_accents(text):
    """'ôri' -> 'ori', 'khalâs' -> 'khalas' : les accents sont optionnels."""
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


class Token:
    __slots__ = ("type", "value", "line")

    def __init__(self, type_, value, line):
        self.type = type_
        self.value = value
        self.line = line

    def __repr__(self):
        return f"Token({self.type}, {self.value!r}, satir={self.line})"


def tokenize(source):
    tokens = []
    i = 0
    line = 1
    depth = 0  # à l'intérieur de () [] {} les retours à la ligne sont ignorés
    n = len(source)

    while i < n:
        c = source[i]

        if c == "\n":
            if depth == 0:
                tokens.append(Token("NL", None, line))
            line += 1
            i += 1
            continue

        if c in " \t\r":
            i += 1
            continue

        if c == "#":
            while i < n and source[i] != "\n":
                i += 1
            continue

        if c.isdigit():
            start = i
            while i < n and source[i].isdigit():
                i += 1
            if i + 1 < n and source[i] == "." and source[i + 1].isdigit():
                i += 1
                while i < n and source[i].isdigit():
                    i += 1
                tokens.append(Token("NUM", float(source[start:i]), line))
            else:
                tokens.append(Token("NUM", int(source[start:i]), line))
            continue

        if c.isalpha() or c == "_":
            start = i
            while i < n and (source[i].isalnum() or source[i] in "_'"):
                i += 1
            word = source[start:i]
            plain = strip_accents(word).replace("'", "").lower()
            if plain in KEYWORDS:
                tokens.append(Token("KW", plain, line))
            else:
                tokens.append(Token("ID", strip_accents(word).replace("'", ""), line))
            continue

        if c in "\"'":
            quote = c
            start_line = line
            i += 1
            chars = []
            escapes = {"n": "\n", "t": "\t", "\\": "\\", '"': '"', "'": "'"}
            while i < n and source[i] != quote:
                ch = source[i]
                if ch == "\n":
                    raise KalamError("al-kalam ma khalas (guillemet fermant manquant)", start_line)
                if ch == "\\" and i + 1 < n:
                    i += 1
                    chars.append(escapes.get(source[i], "\\" + source[i]))
                else:
                    chars.append(ch)
                i += 1
            if i >= n:
                raise KalamError("al-kalam ma khalas (guillemet fermant manquant)", start_line)
            i += 1
            tokens.append(Token("STR", "".join(chars), start_line))
            continue

        two = source[i:i + 2]
        if two in TWO_CHAR_OPS:
            tokens.append(Token("OP", two, line))
            i += 2
            continue

        if c in ONE_CHAR_OPS:
            if c in "([{":
                depth += 1
            elif c in ")]}":
                depth = max(0, depth - 1)
            tokens.append(Token("OP", c, line))
            i += 1
            continue

        raise KalamError(f"harf ma ma'arûf : {c!r} (caractère inconnu)", line)

    tokens.append(Token("NL", None, line))
    tokens.append(Token("EOF", None, line))
    return tokens
