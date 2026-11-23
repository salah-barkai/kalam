"""Interpréteur : exécute l'arbre syntaxique Kalam."""

import math
import os
import random
import time

from .errors import KalamError


class BreakSignal(Exception):
    pass


class ContinueSignal(Exception):
    pass


class ReturnSignal(Exception):
    def __init__(self, value):
        self.value = value


class Environment:
    def __init__(self, parent=None):
        self.vars = {}
        self.parent = parent

    def define(self, name, value):
        self.vars[name] = value

    def find(self, name):
        env = self
        while env is not None:
            if name in env.vars:
                return env
            env = env.parent
        return None

    def get(self, name, line):
        env = self.find(name)
        if env is None:
            raise KalamError(f"'{name}' da ma ligênah — sawwi 'khalli {name} = ...' awwal (variable non définie)", line)
        return env.vars[name]

    def assign(self, name, value):
        env = self.find(name) or self
        env.vars[name] = value


class Function:
    def __init__(self, name, params, body, closure):
        self.name = name
        self.params = params
        self.body = body
        self.closure = closure

    def __repr__(self):
        return f"<khidime {self.name}>"


class Builtin:
    def __init__(self, name, fn, arity=None):
        self.name = name
        self.fn = fn
        self.arity = arity  # None = nombre variable d'arguments

    def __repr__(self):
        return f"<khidime {self.name}>"


# ---------- affichage ----------

def to_text(value, nested=False):
    if value is True:
        return "sahi"
    if value is False:
        return "ghalat"
    if value is None:
        return "mafi"
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else repr(value)
    if isinstance(value, str):
        return repr(value) if nested else value
    if isinstance(value, list):
        return "[" + ", ".join(to_text(v, True) for v in value) + "]"
    if isinstance(value, dict):
        return "{" + ", ".join(f"{to_text(k, True)}: {to_text(v, True)}" for k, v in value.items()) + "}"
    return str(value)


def type_name(value):
    if isinstance(value, bool):
        return "sahi/ghalat"
    if value is None:
        return "mafi"
    if isinstance(value, (int, float)):
        return "nimra"
    if isinstance(value, str):
        return "kitaba"
    if isinstance(value, list):
        return "liste"
    if isinstance(value, dict):
        return "dikt"
    return "khidime"


def truthy(value):
    if value is None or value is False:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0
    if isinstance(value, (str, list, dict)):
        return len(value) > 0
    return True


# ---------- interpréteur ----------

class Interpreter:
    def __init__(self, output=print, input_fn=input, base_dir="."):
        self.output = output
        self.input_fn = input_fn
        self.base_dir = base_dir   # dossier utilisé par 'jib' et par les fichiers
        self.imported = set()
        self.globals = Environment()
        self._install_builtins()

    def _install_builtins(self):
        def ori(*args):
            self.output(" ".join(to_text(a) for a in args))

        def asal(prompt=""):
            try:
                return self.input_fn(to_text(prompt))
            except EOFError:
                raise KalamError("asal : ma fi kalâm jâ (fin de l'entrée)")

        def gadur(x):
            if not isinstance(x, (str, list, dict)):
                raise KalamError(f"gadur ma bagdar bisawwi ma'a {type_name(x)}")
            return len(x)

        def nimra(x):
            if isinstance(x, bool):
                return int(x)
            if isinstance(x, (int, float)):
                return x
            try:
                text = str(x).strip()
                return int(text) if text.lstrip("-").isdigit() else float(text)
            except ValueError:
                raise KalamError(f"{to_text(x, True)} da ma nimra (ce n'est pas un nombre)")

        def zid(lst, item):
            if not isinstance(lst, list):
                raise KalamError("zid bidôr liste (liste attendue)")
            lst.append(item)
            return lst

        def shil(lst, index=None):
            if not isinstance(lst, list) or not lst:
                raise KalamError("shil bidôr liste al-indaha haja (liste non vide attendue)")
            return lst.pop() if index is None else lst.pop(int(index))

        def mafatih(d):
            if not isinstance(d, dict):
                raise KalamError("mafatih bidôr dikt (dictionnaire attendu)")
            return list(d.keys())

        def sudfa(a, b):
            return random.randint(int(a), int(b))

        def jidir(x):
            return x ** 0.5

        def gassim(text, sep=" "):
            return str(text).split(sep)

        def lumm(lst, sep=""):
            return str(sep).join(to_text(v) for v in lst)

        def rattib(lst):
            try:
                return sorted(lst)
            except TypeError:
                raise KalamError("rattib : ma nagdar nirattib ashyâ shakalhum mâ wâhid (types différents)")

        # ----- nombres -----
        def numbers_of(args, fname):
            values = args[0] if len(args) == 1 and isinstance(args[0], list) else list(args)
            if not values:
                raise KalamError(f"{fname} bidôr ashyâ (au moins une valeur)")
            if not all(is_number(v) for v in values):
                raise KalamError(f"{fname} bidôr nimar bas (des nombres seulement)")
            return values

        def aktar(*args):
            return max(numbers_of(args, "aktar"))

        def agall(*args):
            return min(numbers_of(args, "agall"))

        def jumla(lst):
            return sum(numbers_of([lst], "jumla")) if lst else 0

        def garrib(x, digits=0):
            if not is_number(x):
                raise KalamError("garrib bidôr nimra")
            result = round(x, int(digits))
            return int(result) if int(digits) == 0 else result

        def mutlag(x):
            if not is_number(x):
                raise KalamError("mutlag bidôr nimra")
            return abs(x)

        # ----- textes et listes -----
        def fattish(where, what):
            if isinstance(where, str):
                return where.find(to_text(what))
            if isinstance(where, list):
                for i, v in enumerate(where):
                    if v == what and type_name(v) == type_name(what):
                        return i
                return -1
            raise KalamError("fattish bidôr kitaba walla liste")

        def ghayyir(text, old, new):
            return str(text).replace(to_text(old), to_text(new))

        def gata(x, start, end=None):
            if not isinstance(x, (str, list)):
                raise KalamError("gata bidôr kitaba walla liste")
            return x[int(start):] if end is None else x[int(start):int(end)]

        def gallib(x):
            if isinstance(x, str):
                return x[::-1]
            if isinstance(x, list):
                return x[::-1]
            raise KalamError("gallib bidôr kitaba walla liste")

        def naddif(text):
            return str(text).strip()

        def bada_be(text, prefix):
            return str(text).startswith(to_text(prefix))

        def kammal_be(text, suffix):
            return str(text).endswith(to_text(suffix))

        def azil(lst):
            if not isinstance(lst, (list, str)) or not lst:
                raise KalamError("azil bidôr liste al-indaha haja")
            return random.choice(lst)

        def khalbit(lst):
            if not isinstance(lst, list):
                raise KalamError("khalbit bidôr liste")
            random.shuffle(lst)
            return lst

        def giyam(d):
            if not isinstance(d, dict):
                raise KalamError("giyam bidôr dikt (dictionnaire attendu)")
            return list(d.values())

        def nuskha(x):
            if isinstance(x, list):
                return list(x)
            if isinstance(x, dict):
                return dict(x)
            return x

        # ----- wakit (temps) -----
        def wakit():
            return time.time()

        def agod(seconds):
            if not is_number(seconds) or seconds < 0:
                raise KalamError("agod bidôr nimra (secondes)")
            time.sleep(seconds)

        def al_yom():
            return time.strftime("%d/%m/%Y")

        def as_sa():
            return time.strftime("%H:%M")

        # ----- files (fichiers) -----
        def file_path(path):
            return os.path.join(self.base_dir, to_text(path))

        def agri(path):
            try:
                with open(file_path(path), encoding="utf-8") as f:
                    return f.read()
            except OSError:
                raise KalamError(f"al-file '{to_text(path)}' da ma ligênah (fichier introuvable)")

        def aktib(path, text, add=False):
            try:
                with open(file_path(path), "a" if truthy(add) else "w", encoding="utf-8") as f:
                    f.write(to_text(text))
            except OSError:
                raise KalamError(f"ma gidirna naktubu fi '{to_text(path)}'")

        builtins = {
            "aktar": (aktar, None),      # le plus grand
            "agall": (agall, None),      # le plus petit
            "jumla": (jumla, 1),         # somme
            "garrib": (garrib, None),    # arrondir
            "mutlag": (mutlag, 1),       # valeur absolue
            "fattish": (fattish, 2),     # chercher (position, -1 si absent)
            "ghayyir": (ghayyir, 3),     # remplacer dans un texte
            "gata": (gata, None),        # couper un morceau (slice)
            "gallib": (gallib, 1),       # inverser
            "naddif": (naddif, 1),       # enlever les espaces autour
            "bada_be": (bada_be, 2),     # commence par
            "kammal_be": (kammal_be, 2), # finit par
            "azil": (azil, 1),           # choisir au hasard
            "khalbit": (khalbit, 1),     # mélanger
            "giyam": (giyam, 1),         # valeurs d'un dikt
            "nuskha": (nuskha, 1),       # copie
            "wakit": (wakit, 0),         # heure actuelle (secondes)
            "agod": (agod, 1),           # attendre
            "al_yom": (al_yom, 0),       # date du jour
            "as_sa": (as_sa, 0),         # heure (HH:MM)
            "agri": (agri, 1),           # lire un fichier
            "aktib": (aktib, None),      # écrire dans un fichier
            "ori": (ori, None),          # afficher
            "asal": (asal, None),        # demander (input)
            "gadur": (gadur, 1),         # taille / longueur
            "nimra": (nimra, 1),         # convertir en nombre
            "kitaba": (lambda x: to_text(x), 1),  # convertir en texte
            "shakal": (type_name, 1),    # type
            "zid": (zid, 2),             # ajouter à une liste
            "shil": (shil, None),        # retirer d'une liste
            "mafatih": (mafatih, 1),     # clés d'un dictionnaire
            "sudfa": (sudfa, 2),         # nombre aléatoire
            "jidir": (jidir, 1),         # racine carrée
            "gassim": (gassim, None),    # découper un texte
            "lumm": (lumm, None),        # joindre une liste
            "rattib": (rattib, 1),       # trier
            "kabir": (lambda t: str(t).upper(), 1),   # majuscules
            "saghayyar": (lambda t: str(t).lower(), 1),  # minuscules
        }
        for name, (fn, arity) in builtins.items():
            self.globals.define(name, Builtin(name, fn, arity))
        self.globals.define("PI", math.pi)

    # ----- exécution -----
    def run(self, program):
        try:
            self.exec_block(program.body, self.globals)
        except BreakSignal:
            raise KalamError("'agif' lâzim yabga juwa dôra ('agif' hors d'une boucle)")
        except ContinueSignal:
            raise KalamError("'fut' lâzim yabga juwa dôra ('fut' hors d'une boucle)")
        except ReturnSignal:
            raise KalamError("'rajja' lâzim yabga juwa khidime ('rajja' hors d'une fonction)")

    def exec_block(self, stmts, env):
        result = None
        for stmt in stmts:
            result = self.execute(stmt, env)
        return result

    def execute(self, node, env):
        method = getattr(self, "exec_" + node.kind)
        return method(node, env)

    def exec_ExprStmt(self, node, env):
        return self.evaluate(node.expr, env)

    def exec_Let(self, node, env):
        env.define(node.name, self.evaluate(node.value, env))

    def exec_Assign(self, node, env):
        value = self.evaluate(node.value, env)
        target = node.target
        if target.kind == "Var":
            env.assign(target.name, value)
        else:
            obj = self.evaluate(target.obj, env)
            key = self.evaluate(target.index, env)
            self.set_index(obj, key, value, node.line)

    def exec_If(self, node, env):
        for cond, body in node.branches:
            if truthy(self.evaluate(cond, env)):
                return self.exec_block(body, env)
        if node.else_body is not None:
            return self.exec_block(node.else_body, env)

    def exec_While(self, node, env):
        while truthy(self.evaluate(node.cond, env)):
            try:
                self.exec_block(node.body, env)
            except BreakSignal:
                break
            except ContinueSignal:
                continue

    def exec_For(self, node, env):
        iterable = self.evaluate(node.iterable, env)
        if isinstance(iterable, dict):
            iterable = list(iterable.keys())
        elif isinstance(iterable, list):
            iterable = list(iterable)  # copie : modifier la liste pendant la boucle est sûr
        elif not isinstance(iterable, (str, range)):
            raise KalamError(f"ma tagdar tilfa fôg {type_name(iterable)} (non itérable)", node.line)
        for item in iterable:
            env.assign(node.name, item)
            try:
                self.exec_block(node.body, env)
            except BreakSignal:
                break
            except ContinueSignal:
                continue

    def exec_FuncDef(self, node, env):
        env.define(node.name, Function(node.name, node.params, node.body, env))

    def exec_Return(self, node, env):
        value = self.evaluate(node.value, env) if node.value is not None else None
        raise ReturnSignal(value)

    def exec_Break(self, node, env):
        raise BreakSignal()

    def exec_Continue(self, node, env):
        raise ContinueSignal()

    def exec_Try(self, node, env):
        try:
            self.exec_block(node.body, env)
            return
        except KalamError as e:
            caught = e.thrown if hasattr(e, "thrown") else e.message
        except RecursionError:
            caught = "al-khidime nâdat nafisha katîr marra (récursion trop profonde)"
        if node.name:
            env.assign(node.name, caught)
        self.exec_block(node.handler, env)

    def exec_Throw(self, node, env):
        value = self.evaluate(node.value, env)
        err = KalamError(to_text(value), node.line, node.col, node.length)
        err.thrown = value
        raise err

    def exec_Import(self, node, env):
        from .lexer import tokenize
        from .parser import parse

        path = node.path if node.path.endswith(".klm") else node.path + ".klm"
        full = os.path.normpath(os.path.join(self.base_dir, path))
        if full in self.imported:
            return
        self.imported.add(full)
        try:
            with open(full, encoding="utf-8") as f:
                source = f.read()
        except OSError:
            raise KalamError(f"al-file '{path}' da ma ligênah (fichier introuvable)",
                             node.line, node.col, node.length)
        old_dir = self.base_dir
        self.base_dir = os.path.dirname(full)
        try:
            self.exec_block(parse(tokenize(source)).body, self.globals)
        except KalamError as e:
            if hasattr(e, "thrown"):
                raise
            raise KalamError(f"fi '{path}' satir {e.line}: {e.message}", node.line,
                             node.col, node.length)
        finally:
            self.base_dir = old_dir

    # ----- évaluation -----
    def evaluate(self, node, env):
        return getattr(self, "eval_" + node.kind)(node, env)

    def eval_Literal(self, node, env):
        return node.value

    def eval_Var(self, node, env):
        return env.get(node.name, node.line)

    def eval_List(self, node, env):
        return [self.evaluate(i, env) for i in node.items]

    def eval_Dict(self, node, env):
        return {self.evaluate(k, env): self.evaluate(v, env) for k, v in node.pairs}

    def eval_Range(self, node, env):
        start = self.evaluate(node.start, env)
        end = self.evaluate(node.end, env)
        if not all(isinstance(v, int) and not isinstance(v, bool) for v in (start, end)):
            raise KalamError("min ... lahaddi bidôr nimra kâmle (entiers attendus)", node.line)
        step = 1 if end >= start else -1
        return range(start, end + step, step)

    def eval_Lambda(self, node, env):
        return Function("bala usum", node.params, node.body, env)

    def eval_Logic(self, node, env):
        left = self.evaluate(node.left, env)
        if node.op == "wa":
            return self.evaluate(node.right, env) if truthy(left) else left
        return left if truthy(left) else self.evaluate(node.right, env)

    def eval_Unary(self, node, env):
        value = self.evaluate(node.operand, env)
        if node.op == "ma":
            return not truthy(value)
        if not is_number(value):
            raise KalamError(f"ma tagdar tisawwi '-' le {type_name(value)}", node.line)
        return -value

    def eval_Binary(self, node, env):
        a = self.evaluate(node.left, env)
        b = self.evaluate(node.right, env)
        op = node.op
        line = node.line

        if op == "fi":
            if isinstance(b, str):
                return to_text(a) in b
            if isinstance(b, (list, dict)):
                return any(a == x and type_name(a) == type_name(x) for x in b)
            raise KalamError(f"ma tagdar tifattish fi {type_name(b)}", line)
        if op == "==":
            return a == b and type_name(a) == type_name(b)
        if op == "!=":
            return not (a == b and type_name(a) == type_name(b))

        if op == "+":
            if isinstance(a, str) or isinstance(b, str):
                return to_text(a) + to_text(b)
            if isinstance(a, list) and isinstance(b, list):
                return a + b
        if op == "*" and isinstance(a, str) and is_int(b):
            return a * b

        if op in ("<", ">", "<=", ">=") and isinstance(a, str) and isinstance(b, str):
            pass
        elif not (is_number(a) and is_number(b)):
            raise KalamError(
                f"ma tagdar tisawwi '{op}' bên {type_name(a)} wa {type_name(b)}", line
            )

        if op == "+":
            return a + b
        if op == "-":
            return a - b
        if op == "*":
            return a * b
        if op in ("/", "%"):
            if b == 0:
                raise KalamError("ma tagdar tigassim be sifir (division par zéro)", line)
            if op == "%":
                return a % b
            return a // b if is_int(a) and is_int(b) and a % b == 0 else a / b
        if op == "<":
            return a < b
        if op == ">":
            return a > b
        if op == "<=":
            return a <= b
        if op == ">=":
            return a >= b
        raise KalamError(f"operateur {op} da ma na'arfah", line)

    def eval_Index(self, node, env):
        obj = self.evaluate(node.obj, env)
        key = self.evaluate(node.index, env)
        if isinstance(obj, dict):
            return obj.get(key)
        if isinstance(obj, (list, str)):
            if not is_int(key):
                raise KalamError("al-index lâzim yabga nimra kâmle (index entier attendu)", node.line)
            try:
                return obj[key]
            except IndexError:
                raise KalamError(
                    f"index {key} marag barra (hors limites, gadur = {len(obj)})", node.line
                )
        raise KalamError(f"ma tagdar tisawwi [] le {type_name(obj)}", node.line)

    def set_index(self, obj, key, value, line):
        if isinstance(obj, dict):
            obj[key] = value
        elif isinstance(obj, list):
            if not is_int(key):
                raise KalamError("al-index lâzim yabga nimra kâmle (index entier attendu)", line)
            try:
                obj[key] = value
            except IndexError:
                raise KalamError(f"index {key} marag barra (hors limites, gadur = {len(obj)})", line)
        else:
            raise KalamError(f"ma tagdar tibaddil {type_name(obj)}", line)

    def eval_Call(self, node, env):
        fn = self.evaluate(node.callee, env)
        args = [self.evaluate(a, env) for a in node.args]
        return self.call(fn, args, node.line)

    def call(self, fn, args, line):
        if isinstance(fn, Builtin):
            if fn.arity is not None and len(args) != fn.arity:
                raise KalamError(
                    f"{fn.name} bidôr {fn.arity} argument, inta antêtah {len(args)}", line
                )
            try:
                return fn.fn(*args)
            except KalamError as e:
                if e.line is None:
                    e.line = line
                raise
            except TypeError:
                raise KalamError(f"al-arguments hana {fn.name} ma sameh", line)
        if isinstance(fn, Function):
            if len(args) != len(fn.params):
                raise KalamError(
                    f"{fn.name} bidôr {len(fn.params)} argument, inta antêtah {len(args)}", line
                )
            local = Environment(fn.closure)
            for name, value in zip(fn.params, args):
                local.define(name, value)
            try:
                self.exec_block(fn.body, local)
            except ReturnSignal as r:
                return r.value
            return None
        raise KalamError(f"{type_name(fn)} da ma khidime (ce n'est pas une fonction)", line)


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)
