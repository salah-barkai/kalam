"""Parser : transforme les jetons en arbre syntaxique (AST)."""

from .errors import KalamError


class Node:
    def __init__(self, kind, line, **fields):
        self.kind = kind
        self.line = line
        self.__dict__.update(fields)

    def __repr__(self):
        fields = {k: v for k, v in self.__dict__.items() if k not in ("kind", "line")}
        return f"{self.kind}({fields})"


class Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    # ---------- utilitaires ----------
    @property
    def tok(self):
        return self.tokens[self.pos]

    def peek(self, offset=1):
        idx = min(self.pos + offset, len(self.tokens) - 1)
        return self.tokens[idx]

    def advance(self):
        t = self.tokens[self.pos]
        if t.type != "EOF":
            self.pos += 1
        return t

    def check(self, type_, value=None):
        t = self.tok
        return t.type == type_ and (value is None or t.value == value)

    def match(self, type_, value=None):
        if self.check(type_, value):
            return self.advance()
        return None

    def expect(self, type_, value=None, what=None):
        if self.check(type_, value):
            return self.advance()
        wanted = what or (repr(value) if value else type_)
        got = self.tok.value if self.tok.value is not None else describe(self.tok.type)
        raise KalamError(f"nidôr {wanted}, ligît {got!r} (attendu {wanted})").at(self.tok)

    def skip_newlines(self):
        while self.match("NL"):
            pass

    # ---------- programme & blocs ----------
    def parse_program(self):
        stmts = []
        self.skip_newlines()
        while not self.check("EOF"):
            stmts.append(self.statement())
            self.end_of_statement()
        return Node("Program", 1, body=stmts)

    def end_of_statement(self):
        if self.check("EOF"):
            return
        self.expect("NL", what="satir jadîd (fin de ligne)")
        self.skip_newlines()

    def block(self, opener, *terminators):
        """Lit des instructions jusqu'à un mot-clé terminal (sans le consommer)."""
        self.skip_newlines()
        stmts = []
        while not any(self.check("KW", t) for t in terminators):
            if self.check("EOF"):
                raise KalamError(
                    f"'{opener.value}' da ma indah 'khalas' (bloc non terminé)"
                ).at(opener)
            stmts.append(self.statement())
            # Permet les blocs sur une seule ligne : khidime(x) rajja x * 2 khalas
            if not any(self.check("KW", t) for t in terminators):
                self.end_of_statement()
        return stmts

    # ---------- instructions ----------
    def statement(self):
        t = self.tok
        if t.type == "KW":
            handler = {
                "khalli": self.let_stmt,
                "kan": self.if_stmt,
                "tulma": self.while_stmt,
                "kulla": self.for_stmt,
                "khidime": self.func_def,
                "rajja": self.return_stmt,
                "agif": self.simple("Break"),
                "fut": self.simple("Continue"),
            }.get(t.value)
            if handler:
                return handler()

        expr = self.expression()
        if self.match("OP", "="):
            if expr.kind not in ("Var", "Index"):
                raise KalamError("ma tagdar tisawwi '=' hini (affectation invalide)").at(t)
            value = self.expression()
            return Node("Assign", t.line, target=expr, value=value)
        return Node("ExprStmt", t.line, expr=expr)

    def simple(self, kind):
        def parse():
            t = self.advance()
            return Node(kind, t.line, col=t.col, length=t.length)
        return parse

    def let_stmt(self):
        t = self.advance()
        name = self.expect("ID", what="usum (un nom de variable)").value
        self.expect("OP", "=")
        return Node("Let", t.line, name=name, value=self.expression())

    def if_stmt(self):
        t = self.advance()  # kan
        branches = [(self.expression(), self.block(t, "walla", "khalas"))]
        else_body = None
        while self.match("KW", "walla"):
            if self.match("KW", "kan"):
                branches.append((self.expression(), self.block(t, "walla", "khalas")))
            else:
                else_body = self.block(t, "khalas")
                break
        self.expect("KW", "khalas")
        return Node("If", t.line, branches=branches, else_body=else_body)

    def while_stmt(self):
        t = self.advance()
        cond = self.expression()
        body = self.block(t, "khalas")
        self.expect("KW", "khalas")
        return Node("While", t.line, cond=cond, body=body)

    def for_stmt(self):
        t = self.advance()  # kulla
        name = self.expect("ID", what="usum (un nom de variable)").value
        self.expect("KW", "fi")
        if self.match("KW", "min"):
            start = self.expression()
            self.expect("KW", "lahaddi")
            end = self.expression()
            iterable = Node("Range", t.line, start=start, end=end)
        else:
            iterable = self.expression()
        body = self.block(t, "khalas")
        self.expect("KW", "khalas")
        return Node("For", t.line, name=name, iterable=iterable, body=body)

    def func_def(self):
        t = self.advance()
        name = self.expect("ID", what="usum al-khidime (nom de fonction)").value
        params = self.param_list()
        body = self.block(t, "khalas")
        self.expect("KW", "khalas")
        return Node("FuncDef", t.line, name=name, params=params, body=body)

    def param_list(self):
        self.expect("OP", "(")
        params = []
        if not self.check("OP", ")"):
            params.append(self.expect("ID", what="usum").value)
            while self.match("OP", ","):
                params.append(self.expect("ID", what="usum").value)
        self.expect("OP", ")")
        return params

    def return_stmt(self):
        t = self.advance()
        value = None
        if not (self.check("NL") or self.check("EOF") or self.check("KW", "khalas")
                or self.check("KW", "walla")):
            value = self.expression()
        return Node("Return", t.line, value=value, col=t.col, length=t.length)

    # ---------- expressions ----------
    def expression(self):
        return self.or_expr()

    def or_expr(self):
        left = self.and_expr()
        while self.check("KW", "aw"):
            t = self.advance()
            left = Node("Logic", t.line, op="aw", left=left, right=self.and_expr())
        return left

    def and_expr(self):
        left = self.not_expr()
        while self.check("KW", "wa"):
            t = self.advance()
            left = Node("Logic", t.line, op="wa", left=left, right=self.not_expr())
        return left

    def not_expr(self):
        if self.check("KW", "ma"):
            t = self.advance()
            return Node("Unary", t.line, op="ma", operand=self.not_expr())
        return self.comparison()

    def comparison(self):
        left = self.additive()
        while self.tok.type == "OP" and self.tok.value in ("==", "!=", "<", ">", "<=", ">="):
            t = self.advance()
            left = Node("Binary", t.line, op=t.value, left=left, right=self.additive())
        return left

    def additive(self):
        left = self.term()
        while self.tok.type == "OP" and self.tok.value in ("+", "-"):
            t = self.advance()
            left = Node("Binary", t.line, op=t.value, left=left, right=self.term())
        return left

    def term(self):
        left = self.unary()
        while self.tok.type == "OP" and self.tok.value in ("*", "/", "%"):
            t = self.advance()
            left = Node("Binary", t.line, op=t.value, left=left, right=self.unary())
        return left

    def unary(self):
        if self.check("OP", "-"):
            t = self.advance()
            return Node("Unary", t.line, op="-", operand=self.unary())
        return self.postfix()

    def postfix(self):
        expr = self.primary()
        while True:
            if self.check("OP", "("):
                t = self.advance()
                args = []
                if not self.check("OP", ")"):
                    args.append(self.expression())
                    while self.match("OP", ","):
                        args.append(self.expression())
                self.expect("OP", ")")
                expr = Node("Call", t.line, callee=expr, args=args)
            elif self.check("OP", "["):
                t = self.advance()
                index = self.expression()
                self.expect("OP", "]")
                expr = Node("Index", t.line, obj=expr, index=index)
            elif self.check("OP", "."):
                t = self.advance()
                key = self.expect("ID", what="usum").value
                expr = Node("Index", t.line, obj=expr, index=Node("Literal", t.line, value=key))
            else:
                return expr

    def primary(self):
        t = self.tok
        if t.type in ("NUM", "STR"):
            self.advance()
            return Node("Literal", t.line, value=t.value)
        if t.type == "KW" and t.value in ("sahi", "ghalat", "mafi"):
            self.advance()
            return Node("Literal", t.line, value={"sahi": True, "ghalat": False, "mafi": None}[t.value])
        if t.type == "KW" and t.value == "khidime":
            # khidime anonyme : khidime(x) rajja x * 2 khalas
            self.advance()
            params = self.param_list()
            body = self.block(t, "khalas")
            self.expect("KW", "khalas")
            return Node("Lambda", t.line, params=params, body=body)
        if t.type == "ID":
            self.advance()
            return Node("Var", t.line, name=t.value, col=t.col, length=t.length)
        if self.match("OP", "("):
            expr = self.expression()
            self.expect("OP", ")")
            return expr
        if self.match("OP", "["):
            items = []
            if not self.check("OP", "]"):
                items.append(self.expression())
                while self.match("OP", ","):
                    if self.check("OP", "]"):
                        break
                    items.append(self.expression())
            self.expect("OP", "]")
            return Node("List", t.line, items=items)
        if self.match("OP", "{"):
            pairs = []
            if not self.check("OP", "}"):
                pairs.append(self.dict_pair())
                while self.match("OP", ","):
                    if self.check("OP", "}"):
                        break
                    pairs.append(self.dict_pair())
            self.expect("OP", "}")
            return Node("Dict", t.line, pairs=pairs)
        got = t.value if t.value is not None else describe(t.type)
        raise KalamError(f"ma fihimt {got!r} (expression attendue)").at(t)

    def dict_pair(self):
        if self.check("ID") and self.peek().type == "OP" and self.peek().value == ":":
            key_tok = self.advance()
            key = Node("Literal", key_tok.line, value=key_tok.value)
        else:
            key = self.expression()
        self.expect("OP", ":")
        return (key, self.expression())


def describe(token_type):
    return {"NL": "satir jadîd", "EOF": "akhir al-file"}.get(token_type, token_type)


def parse(tokens):
    return Parser(tokens).parse_program()
