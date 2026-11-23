"""Interpréteur : exécute l'arbre syntaxique Kalam."""

import random

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
            raise KalamError(f"'{name}' ma ma'arûf (variable non définie)", line)
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
        return f"<khidma {self.name}>"


class Builtin:
    def __init__(self, name, fn, arity=None):
        self.name = name
        self.fn = fn
        self.arity = arity  # None = nombre variable d'arguments

    def __repr__(self):
        return f"<khidma {self.name}>"


# ---------- affichage ----------

def to_text(value, nested=False):
    if value is True:
        return "sahi"
    if value is False:
        return "khalat"
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
        return "sahi/khalat"
    if value is None:
        return "mafi"
    if isinstance(value, (int, float)):
        return "adad"
    if isinstance(value, str):
        return "nass"
    if isinstance(value, list):
        return "liste"
    if isinstance(value, dict):
        return "dikt"
    return "khidma"


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
    def __init__(self, output=print, input_fn=input):
        self.output = output
        self.input_fn = input_fn
        self.globals = Environment()
        self._install_builtins()

    def _install_builtins(self):
        def ori(*args):
            self.output(" ".join(to_text(a) for a in args))

        def asal(prompt=""):
            try:
                return self.input_fn(to_text(prompt))
            except EOFError:
                raise KalamError("asal : ma fi kalam jâ (fin de l'entrée)")

        def gadur(x):
            if not isinstance(x, (str, list, dict)):
                raise KalamError(f"gadur ma bisawwi ma'a {type_name(x)}")
            return len(x)

        def adad(x):
            if isinstance(x, bool):
                return int(x)
            if isinstance(x, (int, float)):
                return x
            try:
                text = str(x).strip()
                return int(text) if text.lstrip("-").isdigit() else float(text)
            except ValueError:
                raise KalamError(f"{to_text(x, True)} ma adad (ce n'est pas un nombre)")

        def zid(lst, item):
            if not isinstance(lst, list):
                raise KalamError("zid bidôr liste (append attend une liste)")
            lst.append(item)
            return lst

        def shil(lst, index=None):
            if not isinstance(lst, list) or not lst:
                raise KalamError("shil bidôr liste malyâne (liste non vide attendue)")
            return lst.pop() if index is None else lst.pop(int(index))

        def mafatih(d):
            if not isinstance(d, dict):
                raise KalamError("mafatih bidôr dikt")
            return list(d.keys())

        def sudfa(a, b):
            return random.randint(int(a), int(b))

        def jazr(x):
            return x ** 0.5

        def gassim(text, sep=" "):
            return str(text).split(sep)

        def lumm(lst, sep=""):
            return str(sep).join(to_text(v) for v in lst)

        def rattib(lst):
            try:
                return sorted(lst)
            except TypeError:
                raise KalamError("rattib : ma nagdar nirattib ashyâ min anwâ mukhtalifa")

        builtins = {
            "ori": (ori, None),          # afficher
            "asal": (asal, None),        # demander (input)
            "gadur": (gadur, 1),         # taille / longueur
            "adad": (adad, 1),           # convertir en nombre
            "nass": (lambda x: to_text(x), 1),  # convertir en texte
            "naw": (type_name, 1),       # type
            "zid": (zid, 2),             # ajouter à une liste
            "shil": (shil, None),        # retirer d'une liste
            "mafatih": (mafatih, 1),     # clés d'un dictionnaire
            "sudfa": (sudfa, 2),         # nombre aléatoire
            "jazr": (jazr, 1),           # racine carrée
            "gassim": (gassim, None),    # découper un texte
            "lumm": (lumm, None),        # joindre une liste
            "rattib": (rattib, 1),       # trier
            "kabir": (lambda t: str(t).upper(), 1),   # majuscules
            "saghayyar": (lambda t: str(t).lower(), 1),  # minuscules
        }
        for name, (fn, arity) in builtins.items():
            self.globals.define(name, Builtin(name, fn, arity))

    # ----- exécution -----
    def run(self, program):
        try:
            self.exec_block(program.body, self.globals)
        except BreakSignal:
            raise KalamError("'agif' barra min al-loop ('agif' hors d'une boucle)")
        except ContinueSignal:
            raise KalamError("'fut' barra min al-loop ('fut' hors d'une boucle)")
        except ReturnSignal:
            raise KalamError("'rajja' barra min khidma ('rajja' hors d'une fonction)")

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
            raise KalamError(f"ma tagdar tilfa fi {type_name(iterable)} (non itérable)", node.line)
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
            raise KalamError("min ... lahaddi bidôr adad sahîh (entiers attendus)", node.line)
        step = 1 if end >= start else -1
        return range(start, end + step, step)

    def eval_Lambda(self, node, env):
        return Function("bala ism", node.params, node.body, env)

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
            raise KalamError(f"ma tagdar tusawwi '-' le {type_name(value)}", node.line)
        return -value

    def eval_Binary(self, node, env):
        a = self.evaluate(node.left, env)
        b = self.evaluate(node.right, env)
        op = node.op
        line = node.line

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
                f"ma tagdar tusawwi '{op}' bên {type_name(a)} wa {type_name(b)}", line
            )

        if op == "+":
            return a + b
        if op == "-":
            return a - b
        if op == "*":
            return a * b
        if op in ("/", "%"):
            if b == 0:
                raise KalamError("ma tagdar tagassim ala sifir (division par zéro)", line)
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
        raise KalamError(f"operateur ma ma'arûf {op}", line)

    def eval_Index(self, node, env):
        obj = self.evaluate(node.obj, env)
        key = self.evaluate(node.index, env)
        if isinstance(obj, dict):
            return obj.get(key)
        if isinstance(obj, (list, str)):
            if not is_int(key):
                raise KalamError("al-index lâzim adad sahîh (index entier attendu)", node.line)
            try:
                return obj[key]
            except IndexError:
                raise KalamError(
                    f"index {key} barra (hors limites, gadur = {len(obj)})", node.line
                )
        raise KalamError(f"ma tagdar tusawwi [] le {type_name(obj)}", node.line)

    def set_index(self, obj, key, value, line):
        if isinstance(obj, dict):
            obj[key] = value
        elif isinstance(obj, list):
            if not is_int(key):
                raise KalamError("al-index lâzim adad sahîh (index entier attendu)", line)
            try:
                obj[key] = value
            except IndexError:
                raise KalamError(f"index {key} barra (hors limites, gadur = {len(obj)})", line)
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
                    f"{fn.name} bidôr {fn.arity} argument, ligît {len(args)}", line
                )
            try:
                return fn.fn(*args)
            except KalamError as e:
                if e.line is None:
                    e.line = line
                raise
            except TypeError:
                raise KalamError(f"arguments ma sameh le {fn.name}", line)
        if isinstance(fn, Function):
            if len(args) != len(fn.params):
                raise KalamError(
                    f"{fn.name} bidôr {len(fn.params)} argument, ligît {len(args)}", line
                )
            local = Environment(fn.closure)
            for name, value in zip(fn.params, args):
                local.define(name, value)
            try:
                self.exec_block(fn.body, local)
            except ReturnSignal as r:
                return r.value
            return None
        raise KalamError(f"{type_name(fn)} ma khidma (ce n'est pas une fonction)", line)


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)
