/*
 * Kalam — langage de programmation en arabe tchadien (lettres latines).
 *
 * Ce fichier contient tout le langage : lexer, parser, interpréteur et
 * vérificateur. Il fonctionne dans Node.js, dans VS Code et dans le navigateur.
 *
 *   const Kalam = require("./kalam");
 *   Kalam.run('ori("Salam!")');
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Kalam = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const VERSION = "0.2.0";

  // =====================================================================
  // Erreurs
  // =====================================================================

  class KalamError extends Error {
    constructor(message, line = null, col = null, length = 1) {
      super(message);
      this.kalamMessage = message;
      this.line = line;
      this.col = col; // 0-based
      this.length = length;
    }
    at(token) {
      if (token && this.line == null) {
        this.line = token.line;
        this.col = token.col;
        this.length = token.length;
      }
      return this;
    }
    toString() {
      return this.line != null
        ? `Mushkila fi satir ${this.line}: ${this.kalamMessage}`
        : `Mushkila: ${this.kalamMessage}`;
    }
  }

  const RECURSION_MESSAGE = "al-khidime nâdat nafisha katîr marra (récursion trop profonde)";

  function isStackOverflow(e) {
    return e instanceof RangeError && /call stack/i.test(e.message);
  }

  // =====================================================================
  // Lexer
  // =====================================================================

  const KEYWORDS = new Set([
    "khalli", "kan", "walla", "khalas", "tulma", "kulla", "fi", "min", "lahaddi",
    "khidime", "rajja", "agif", "fut", "sahi", "ghalat", "mafi", "wa", "aw", "ma",
    "jarrib", "mushkila", "zagil", "jib",
  ]);
  const TWO_CHAR_OPS = new Set(["==", "!=", "<=", ">=", "+=", "-=", "*=", "/="]);
  const ONE_CHAR_OPS = new Set("+-*/%<>=()[]{},:.");
  const ESCAPES = { n: "\n", t: "\t", "\\": "\\", '"': '"', "'": "'" };

  const RE_ALPHA = /\p{L}/u;
  const RE_ALNUM = /[\p{L}\p{N}]/u;
  const RE_DIGIT = /\p{Nd}/u;

  function stripAccents(text) {
    return text.normalize("NFD").replace(/\p{Mn}/gu, "");
  }

  function digitValue(ch) {
    const c = ch.codePointAt(0);
    if (c >= 0x30 && c <= 0x39) return c - 0x30;
    if (c >= 0x660 && c <= 0x669) return c - 0x660; // chiffres arabes ٠-٩
    if (c >= 0x6f0 && c <= 0x6f9) return c - 0x6f0; // chiffres persans ۰-۹
    return null;
  }

  function parseDigits(text) {
    let s = "";
    for (const ch of text) {
      const d = digitValue(ch);
      if (d == null) return null;
      s += d;
    }
    return s;
  }

  class Token {
    constructor(type, value, line, col = 0, length = 1, raw = null, isFloat = false) {
      this.type = type;
      this.value = value;
      this.line = line;
      this.col = col;
      this.length = length;
      this.raw = raw;
      this.isFloat = isFloat;
    }
  }

  function tokenize(source) {
    // On travaille par points de code (comme Python) pour que les colonnes
    // soient justes même avec des emoji.
    const chars = Array.from(source);
    const n = chars.length;
    const tokens = [];
    let i = 0;
    let line = 1;
    let lineStart = 0;
    let depth = 0;

    const add = (type, value, start, isFloat = false) => {
      tokens.push(new Token(type, value, line, start - lineStart, Math.max(1, i - start),
        chars.slice(start, i).join(""), isFloat));
    };

    while (i < n) {
      const c = chars[i];

      if (c === "\n") {
        if (depth === 0) tokens.push(new Token("NL", null, line, i - lineStart, 1));
        line += 1;
        i += 1;
        lineStart = i;
        continue;
      }
      if (c === " " || c === "\t" || c === "\r") { i += 1; continue; }
      if (c === "#") {
        while (i < n && chars[i] !== "\n") i += 1;
        continue;
      }

      const start = i;

      if (RE_DIGIT.test(c)) {
        while (i < n && RE_DIGIT.test(chars[i])) i += 1;
        if (i + 1 < n && chars[i] === "." && RE_DIGIT.test(chars[i + 1])) {
          i += 1;
          while (i < n && RE_DIGIT.test(chars[i])) i += 1;
          const [a, b] = chars.slice(start, i).join("").split(".");
          const value = Number(parseDigits(a) + "." + parseDigits(b));
          add("NUM", value, start, true);
        } else {
          const digits = parseDigits(chars.slice(start, i).join(""));
          if (digits == null) {
            throw new KalamError(`harf ${pyRepr(chars[start])} da ma na'arfah (caractère inconnu)`,
              line, start - lineStart, 1);
          }
          add("NUM", Number(digits), start);
        }
        continue;
      }

      if (RE_ALPHA.test(c) || c === "_") {
        while (i < n && (RE_ALNUM.test(chars[i]) || chars[i] === "_" || chars[i] === "'")) i += 1;
        const word = chars.slice(start, i).join("");
        const plain = stripAccents(word).replace(/'/g, "");
        if (KEYWORDS.has(plain.toLowerCase())) add("KW", plain.toLowerCase(), start);
        else add("ID", plain, start);
        continue;
      }

      if (c === '"' || c === "'") {
        const quote = c;
        i += 1;
        let text = "";
        while (i < n && chars[i] !== quote && chars[i] !== "\n") {
          if (chars[i] === "\\" && i + 1 < n && chars[i + 1] !== "\n") {
            i += 1;
            text += Object.prototype.hasOwnProperty.call(ESCAPES, chars[i]) ? ESCAPES[chars[i]] : "\\" + chars[i];
          } else {
            text += chars[i];
          }
          i += 1;
        }
        if (i >= n || chars[i] !== quote) {
          throw new KalamError("al-kitaba di ma indaha guillemet fôg al-akhir (guillemet fermant manquant)",
            line, start - lineStart, Math.max(1, i - start));
        }
        i += 1;
        add("STR", text, start);
        continue;
      }

      const two = c + (i + 1 < n ? chars[i + 1] : "");
      if (TWO_CHAR_OPS.has(two)) {
        i += 2;
        add("OP", two, start);
        continue;
      }
      if (ONE_CHAR_OPS.has(c)) {
        if ("([{".includes(c)) depth += 1;
        else if (")]}".includes(c)) depth = Math.max(0, depth - 1);
        i += 1;
        add("OP", c, start);
        continue;
      }

      throw new KalamError(`harf ${pyRepr(c)} da ma na'arfah (caractère inconnu)`, line, start - lineStart, 1);
    }

    tokens.push(new Token("NL", null, line, i - lineStart, 1));
    tokens.push(new Token("EOF", null, line, i - lineStart, 1));
    return tokens;
  }

  // =====================================================================
  // Parser
  // =====================================================================

  function node(kind, line, fields) {
    return Object.assign({ kind, line }, fields);
  }

  function describe(type) {
    return { NL: "satir jadîd", EOF: "akhir al-file" }[type] || type;
  }

  function tokenRepr(t) {
    if (t.value == null) return pyRepr(describe(t.type));
    if (t.type === "NUM") return t.isFloat ? pyFloatRepr(t.value) : numberText(t.value);
    return pyRepr(t.value);
  }

  class Parser {
    constructor(tokens) {
      this.tokens = tokens;
      this.pos = 0;
    }
    get tok() { return this.tokens[this.pos]; }
    peek(offset = 1) { return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]; }
    advance() {
      const t = this.tokens[this.pos];
      if (t.type !== "EOF") this.pos += 1;
      return t;
    }
    check(type, value) {
      const t = this.tok;
      return t.type === type && (value === undefined || t.value === value);
    }
    match(type, value) { return this.check(type, value) ? this.advance() : null; }
    expect(type, value, what) {
      if (this.check(type, value)) return this.advance();
      const wanted = what || (value !== undefined ? pyRepr(value) : type);
      throw new KalamError(`nidôr ${wanted}, ligît ${tokenRepr(this.tok)} (attendu ${wanted})`).at(this.tok);
    }
    skipNewlines() { while (this.match("NL")); }

    parseProgram() {
      const body = [];
      this.skipNewlines();
      while (!this.check("EOF")) {
        body.push(this.statement());
        this.endOfStatement();
      }
      return node("Program", 1, { body });
    }
    endOfStatement() {
      if (this.check("EOF")) return;
      this.expect("NL", undefined, "satir jadîd (fin de ligne)");
      this.skipNewlines();
    }
    block(opener, ...terminators) {
      this.skipNewlines();
      const stmts = [];
      const atEnd = () => terminators.some((t) => this.check("KW", t));
      while (!atEnd()) {
        if (this.check("EOF")) {
          throw new KalamError(`'${opener.value}' da ma indah 'khalas' (bloc non terminé)`).at(opener);
        }
        stmts.push(this.statement());
        if (!atEnd()) this.endOfStatement();
      }
      return stmts;
    }

    statement() {
      const t = this.tok;
      if (t.type === "KW") {
        switch (t.value) {
          case "khalli": return this.letStmt();
          case "kan": return this.ifStmt();
          case "tulma": return this.whileStmt();
          case "kulla": return this.forStmt();
          case "khidime": return this.funcDef();
          case "rajja": return this.returnStmt();
          case "agif": return this.simple("Break");
          case "fut": return this.simple("Continue");
          case "jarrib": return this.tryStmt();
          case "zagil": return this.throwStmt();
          case "jib": return this.importStmt();
        }
      }
      const expr = this.expression();
      const opTok = this.tok;
      if (opTok.type === "OP" && ["=", "+=", "-=", "*=", "/="].includes(opTok.value)) {
        this.advance();
        if (expr.kind !== "Var" && expr.kind !== "Index") {
          throw new KalamError(`ma tagdar tisawwi '${opTok.value}' hini (affectation invalide)`).at(opTok);
        }
        let value = this.expression();
        if (opTok.value !== "=") {
          value = node("Binary", opTok.line, { op: opTok.value[0], left: expr, right: value });
        }
        return node("Assign", t.line, { target: expr, value });
      }
      return node("ExprStmt", t.line, { expr });
    }
    tryStmt() {
      const t = this.advance();
      const body = this.block(t, "mushkila");
      this.expect("KW", "mushkila");
      let name = null;
      if (this.check("ID")) name = this.advance().value;
      const handler = this.block(t, "khalas");
      this.expect("KW", "khalas");
      return node("Try", t.line, { body, name, handler });
    }
    throwStmt() {
      const t = this.advance();
      return node("Throw", t.line, { value: this.expression(), col: t.col, length: t.length });
    }
    importStmt() {
      const t = this.advance();
      const p = this.expect("STR", undefined, 'usum al-file ("fichier.klm")');
      return node("Import", t.line, { path: p.value, col: p.col, length: p.length });
    }
    simple(kind) {
      const t = this.advance();
      return node(kind, t.line, { col: t.col, length: t.length });
    }
    letStmt() {
      const t = this.advance();
      const name = this.expect("ID", undefined, "usum (un nom de variable)").value;
      this.expect("OP", "=");
      return node("Let", t.line, { name, value: this.expression() });
    }
    ifStmt() {
      const t = this.advance();
      const branches = [[this.expression(), this.block(t, "walla", "khalas")]];
      let elseBody = null;
      while (this.match("KW", "walla")) {
        if (this.match("KW", "kan")) {
          branches.push([this.expression(), this.block(t, "walla", "khalas")]);
        } else {
          elseBody = this.block(t, "khalas");
          break;
        }
      }
      this.expect("KW", "khalas");
      return node("If", t.line, { branches, else_body: elseBody });
    }
    whileStmt() {
      const t = this.advance();
      const cond = this.expression();
      const body = this.block(t, "khalas");
      this.expect("KW", "khalas");
      return node("While", t.line, { cond, body });
    }
    forStmt() {
      const t = this.advance();
      const name = this.expect("ID", undefined, "usum (un nom de variable)").value;
      this.expect("KW", "fi");
      let iterable;
      if (this.match("KW", "min")) {
        const start = this.expression();
        this.expect("KW", "lahaddi");
        const end = this.expression();
        iterable = node("Range", t.line, { start, end });
      } else {
        iterable = this.expression();
      }
      const body = this.block(t, "khalas");
      this.expect("KW", "khalas");
      return node("For", t.line, { name, iterable, body });
    }
    funcDef() {
      const t = this.advance();
      const name = this.expect("ID", undefined, "usum al-khidime (nom de fonction)").value;
      const params = this.paramList();
      const body = this.block(t, "khalas");
      this.expect("KW", "khalas");
      return node("FuncDef", t.line, { name, params, body });
    }
    paramList() {
      this.expect("OP", "(");
      const params = [];
      if (!this.check("OP", ")")) {
        params.push(this.expect("ID", undefined, "usum").value);
        while (this.match("OP", ",")) params.push(this.expect("ID", undefined, "usum").value);
      }
      this.expect("OP", ")");
      return params;
    }
    returnStmt() {
      const t = this.advance();
      let value = null;
      if (!(this.check("NL") || this.check("EOF") || this.check("KW", "khalas")
        || this.check("KW", "walla") || this.check("KW", "mushkila"))) {
        value = this.expression();
      }
      return node("Return", t.line, { value, col: t.col, length: t.length });
    }

    expression() { return this.orExpr(); }
    orExpr() {
      let left = this.andExpr();
      while (this.check("KW", "aw")) {
        const t = this.advance();
        left = node("Logic", t.line, { op: "aw", left, right: this.andExpr() });
      }
      return left;
    }
    andExpr() {
      let left = this.notExpr();
      while (this.check("KW", "wa")) {
        const t = this.advance();
        left = node("Logic", t.line, { op: "wa", left, right: this.notExpr() });
      }
      return left;
    }
    notExpr() {
      if (this.check("KW", "ma")) {
        const t = this.advance();
        return node("Unary", t.line, { op: "ma", operand: this.notExpr() });
      }
      return this.comparison();
    }
    comparison() {
      let left = this.additive();
      while ((this.tok.type === "OP" && ["==", "!=", "<", ">", "<=", ">="].includes(this.tok.value))
        || this.check("KW", "fi")) {
        const t = this.advance();
        left = node("Binary", t.line, { op: t.value, left, right: this.additive() });
      }
      return left;
    }
    additive() {
      let left = this.term();
      while (this.tok.type === "OP" && (this.tok.value === "+" || this.tok.value === "-")) {
        const t = this.advance();
        left = node("Binary", t.line, { op: t.value, left, right: this.term() });
      }
      return left;
    }
    term() {
      let left = this.unary();
      while (this.tok.type === "OP" && ["*", "/", "%"].includes(this.tok.value)) {
        const t = this.advance();
        left = node("Binary", t.line, { op: t.value, left, right: this.unary() });
      }
      return left;
    }
    unary() {
      if (this.check("OP", "-")) {
        const t = this.advance();
        return node("Unary", t.line, { op: "-", operand: this.unary() });
      }
      return this.postfix();
    }
    postfix() {
      let expr = this.primary();
      for (;;) {
        if (this.check("OP", "(")) {
          const t = this.advance();
          const args = [];
          if (!this.check("OP", ")")) {
            args.push(this.expression());
            while (this.match("OP", ",")) args.push(this.expression());
          }
          this.expect("OP", ")");
          expr = node("Call", t.line, { callee: expr, args });
        } else if (this.check("OP", "[")) {
          const t = this.advance();
          const index = this.expression();
          this.expect("OP", "]");
          expr = node("Index", t.line, { obj: expr, index });
        } else if (this.check("OP", ".")) {
          const t = this.advance();
          const key = this.expect("ID", undefined, "usum").raw;
          expr = node("Index", t.line, { obj: expr, index: node("Literal", t.line, { value: key }) });
        } else {
          return expr;
        }
      }
    }
    primary() {
      const t = this.tok;
      if (t.type === "NUM" || t.type === "STR") {
        this.advance();
        return node("Literal", t.line, { value: t.value });
      }
      if (t.type === "KW" && (t.value === "sahi" || t.value === "ghalat" || t.value === "mafi")) {
        this.advance();
        return node("Literal", t.line, { value: { sahi: true, ghalat: false, mafi: null }[t.value] });
      }
      if (t.type === "KW" && t.value === "khidime") {
        this.advance();
        const params = this.paramList();
        const body = this.block(t, "khalas");
        this.expect("KW", "khalas");
        return node("Lambda", t.line, { params, body });
      }
      if (t.type === "ID") {
        this.advance();
        return node("Var", t.line, { name: t.value, raw: t.raw, col: t.col, length: t.length });
      }
      if (this.match("OP", "(")) {
        const expr = this.expression();
        this.expect("OP", ")");
        return expr;
      }
      if (this.match("OP", "[")) {
        const items = [];
        if (!this.check("OP", "]")) {
          items.push(this.expression());
          while (this.match("OP", ",")) {
            if (this.check("OP", "]")) break;
            items.push(this.expression());
          }
        }
        this.expect("OP", "]");
        return node("List", t.line, { items });
      }
      if (this.match("OP", "{")) {
        const pairs = [];
        if (!this.check("OP", "}")) {
          pairs.push(this.dictPair());
          while (this.match("OP", ",")) {
            if (this.check("OP", "}")) break;
            pairs.push(this.dictPair());
          }
        }
        this.expect("OP", "}");
        return node("Dict", t.line, { pairs });
      }
      throw new KalamError(`ma fihimt ${tokenRepr(t)} (expression attendue)`).at(t);
    }
    dictPair() {
      let key;
      if (this.check("ID") && this.peek().type === "OP" && this.peek().value === ":") {
        const k = this.advance();
        key = node("Literal", k.line, { value: k.raw });
      } else {
        key = this.expression();
      }
      this.expect("OP", ":");
      return [key, this.expression()];
    }
  }

  function parse(tokensOrSource) {
    const tokens = typeof tokensOrSource === "string" ? tokenize(tokensOrSource) : tokensOrSource;
    return new Parser(tokens).parseProgram();
  }

  // =====================================================================
  // Valeurs : affichage, types, égalité (même comportement que la version Python)
  // =====================================================================

  class KFunction {
    constructor(name, params, body, closure) {
      this.name = name;
      this.params = params;
      this.body = body;
      this.closure = closure;
    }
  }
  class Builtin {
    constructor(name, fn, arity, minArgs, maxArgs) {
      this.name = name;
      this.fn = fn;
      this.arity = arity; // null = nombre variable
      this.minArgs = minArgs;
      this.maxArgs = maxArgs;
    }
  }
  class KRange {
    constructor(start, end, step) {
      this.start = start;
      this.end = end;
      this.step = step;
    }
    *[Symbol.iterator]() {
      for (let v = this.start; this.step > 0 ? v < this.end : v > this.end; v += this.step) yield v;
    }
  }

  const isNumber = (v) => typeof v === "number";
  const isInt = (v) => typeof v === "number" && Number.isInteger(v);
  const isStr = (v) => typeof v === "string";
  const isList = Array.isArray;
  const isDict = (v) => v instanceof Map;
  const isBool = (v) => typeof v === "boolean";

  function numberText(v) {
    if (Number.isInteger(v)) {
      if (Object.is(v, -0)) return "0";
      return Math.abs(v) < 1e21 ? String(v) : BigInt(v).toString();
    }
    return pyFloatRepr(v);
  }

  // repr() d'un float Python : 0.1, 1e-05, 1.5e+16, inf, nan
  function pyFloatRepr(v) {
    if (Number.isNaN(v)) return "nan";
    if (!Number.isFinite(v)) return v > 0 ? "inf" : "-inf";
    if (v === 0) return Object.is(v, -0) ? "-0.0" : "0.0";
    const sign = v < 0 ? "-" : "";
    const [mant, expS] = Math.abs(v).toExponential().split("e");
    const e = parseInt(expS, 10);
    const digits = mant.replace(".", "");
    if (e < -4 || e >= 16) {
      const m = digits[0] + (digits.length > 1 ? "." + digits.slice(1) : "");
      return `${sign}${m}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
    }
    if (e >= 0) {
      if (digits.length <= e + 1) {
        return sign + digits + "0".repeat(e + 1 - digits.length) + ".0";
      }
      return sign + digits.slice(0, e + 1) + "." + digits.slice(e + 1);
    }
    return sign + "0." + "0".repeat(-e - 1) + digits;
  }

  function pyStrRepr(s) {
    const q = s.includes("'") && !s.includes('"') ? '"' : "'";
    let out = q;
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (ch === "\\") out += "\\\\";
      else if (ch === q) out += "\\" + q;
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (ch !== " " && /[\p{C}\p{Z}]/u.test(ch)) {
        if (c < 0x100) out += "\\x" + c.toString(16).padStart(2, "0");
        else if (c < 0x10000) out += "\\u" + c.toString(16).padStart(4, "0");
        else out += "\\U" + c.toString(16).padStart(8, "0");
      } else out += ch;
    }
    return out + q;
  }

  // repr() Python, utilisé dans les messages d'erreur du parser et du lexer
  function pyRepr(v) {
    if (isStr(v)) return pyStrRepr(v);
    if (isBool(v)) return v ? "True" : "False";
    if (v === null || v === undefined) return "None";
    if (isNumber(v)) return numberText(v);
    if (isList(v)) return "[" + v.map(pyRepr).join(", ") + "]";
    if (isDict(v)) return "{" + Array.from(v, ([k, x]) => pyRepr(k) + ": " + pyRepr(x)).join(", ") + "}";
    return toText(v);
  }

  // str() Python (pour kabir, naddif, gassim…)
  function pyStr(v) {
    return isStr(v) ? v : pyRepr(v);
  }

  function toText(value, nested = false) {
    if (value === true) return "sahi";
    if (value === false) return "ghalat";
    if (value === null || value === undefined) return "mafi";
    if (isNumber(value)) return numberText(value);
    if (isStr(value)) return nested ? pyStrRepr(value) : value;
    if (isList(value)) return "[" + value.map((v) => toText(v, true)).join(", ") + "]";
    if (isDict(value)) {
      return "{" + Array.from(value, ([k, v]) => `${toText(k, true)}: ${toText(v, true)}`).join(", ") + "}";
    }
    if (value instanceof KFunction || value instanceof Builtin) return `<khidime ${value.name}>`;
    return String(value);
  }

  function typeName(value) {
    if (isBool(value)) return "sahi/ghalat";
    if (value === null || value === undefined) return "mafi";
    if (isNumber(value)) return "nimra";
    if (isStr(value)) return "kitaba";
    if (isList(value)) return "liste";
    if (isDict(value)) return "dikt";
    return "khidime";
  }

  function truthy(value) {
    if (value === null || value === undefined || value === false) return false;
    if (isNumber(value)) return value !== 0;
    if (isStr(value)) return value.length > 0;
    if (isList(value)) return value.length > 0;
    if (isDict(value)) return value.size > 0;
    return true;
  }

  // == de Python (1 == True, listes et dikt comparés en profondeur)
  function pyEq(a, b) {
    const numA = isNumber(a) || isBool(a);
    const numB = isNumber(b) || isBool(b);
    if (numA && numB) return Number(a) === Number(b);
    if (isStr(a) && isStr(b)) return a === b;
    if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
    if (isList(a) && isList(b)) return a.length === b.length && a.every((x, i) => pyEq(x, b[i]));
    if (isDict(a) && isDict(b)) {
      if (a.size !== b.size) return false;
      for (const [k, v] of a) {
        const other = dictGet(b, k);
        if (other === undefined || !pyEq(v, other)) return false;
      }
      return true;
    }
    return a === b;
  }

  const kalamEq = (a, b) => pyEq(a, b) && typeName(a) === typeName(b);

  // Clés de dikt : textes, nombres, sahi/ghalat, mafi (pas de liste ni de dikt).
  function dictGet(d, k) { return d.get(k); }
  function dictSet(d, k, v) {
    if (isList(k) || isDict(k)) throw new TypeError("unhashable");
    d.set(k, v);
  }

  // Comparaison < de Python, pour rattib
  function pyLess(a, b) {
    const numA = isNumber(a) || isBool(a);
    const numB = isNumber(b) || isBool(b);
    if (numA && numB) return Number(a) < Number(b);
    if (isStr(a) && isStr(b)) return a < b;
    if (isList(a) && isList(b)) {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (!pyEq(a[i], b[i])) return pyLess(a[i], b[i]);
      }
      return a.length < b.length;
    }
    throw new TypeError("unorderable");
  }

  // round() de Python : arrondi « au pair » sur la valeur exacte du nombre
  function pyRound(x, n) {
    if (!Number.isFinite(x)) return x;
    if (Math.abs(x) >= 1e21 || (Number.isInteger(x) && n >= 0)) return x;
    if (n < 0) {
      const p = 10 ** -n;
      return pyRound(x / p, 0) * p;
    }
    const s = Math.abs(x).toFixed(Math.min(100, n + 40));
    const [ip, fp = ""] = s.split(".");
    const keep = fp.slice(0, n);
    const rest = fp.slice(n);
    let base = BigInt(ip + keep);
    const first = rest[0] || "0";
    const after = rest.slice(1);
    const up = first > "5" || (first === "5" && /[1-9]/.test(after))
      || (first === "5" && !/[1-9]/.test(after) && base % 2n === 1n);
    if (up) base += 1n;
    let str = base.toString().padStart(n + 1, "0");
    const res = n === 0 ? Number(str) : Number(str.slice(0, str.length - n) + "." + str.slice(str.length - n));
    return x < 0 ? -res : res;
  }

  // Modulo de Python : le résultat a le signe du diviseur
  function pyMod(a, b) {
    const r = a % b;
    return r !== 0 && (r < 0) !== (b < 0) ? r + b : r;
  }

  function codePoints(s) { return Array.from(s); }

  function pySliceIndex(i, len) {
    if (i < 0) i += len;
    return Math.min(Math.max(i, 0), len);
  }

  function pyInt(v) {
    if (isBool(v)) return Number(v);
    if (isNumber(v)) return Math.trunc(v);
    if (isStr(v) && /^\s*[+-]?\d+\s*$/.test(v)) return parseInt(v, 10);
    throw new TypeError("int");
  }

  function parseNumberText(x) {
    const text = pyStr(x).trim();
    const unsigned = text.startsWith("-") ? text.slice(1) : text;
    const digits = unsigned.length ? parseDigits(unsigned) : null;
    if (digits != null && digits.length) return text.startsWith("-") ? -Number(digits) : Number(digits);
    if (/^[+-]?(\d+(_\d+)*\.?(\d+(_\d+)*)?|\.\d+(_\d+)*)([eE][+-]?\d+)?$/.test(text)) {
      return Number(text.replace(/_/g, ""));
    }
    const lower = text.toLowerCase();
    if (/^[+-]?(inf|infinity)$/.test(lower)) return lower.startsWith("-") ? -Infinity : Infinity;
    if (/^[+-]?nan$/.test(lower)) return NaN;
    return null;
  }

  // =====================================================================
  // Environnement et hôte (affichage, saisie, fichiers, temps)
  // =====================================================================

  class Environment {
    constructor(parent = null) {
      this.vars = new Map();
      this.parent = parent;
    }
    define(name, value) { this.vars.set(name, value); }
    find(name) {
      for (let env = this; env; env = env.parent) if (env.vars.has(name)) return env;
      return null;
    }
    assign(name, value) { (this.find(name) || this).vars.set(name, value); }
  }

  function undefinedMessage(name) {
    return `'${name}' da ma ligênah — sawwi 'khalli ${name} = ...' awwal (variable non définie)`;
  }

  // Chemins simples (style POSIX ou Windows) pour le navigateur.
  const simplePath = {
    isAbsolute: (p) => p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p),
    normalize(p) {
      const abs = p.startsWith("/");
      const parts = [];
      for (const part of p.split(/[\\/]+/)) {
        if (!part || part === ".") continue;
        if (part === ".." && parts.length && parts[parts.length - 1] !== "..") parts.pop();
        else parts.push(part);
      }
      return (abs ? "/" : "") + parts.join("/");
    },
    join(base, p) { return simplePath.isAbsolute(p) ? simplePath.normalize(p) : simplePath.normalize(base + "/" + p); },
    dirname(p) {
      const n = simplePath.normalize(p);
      const i = n.lastIndexOf("/");
      return i <= 0 ? (n.startsWith("/") ? "/" : ".") : n.slice(0, i);
    },
  };

  function nodeHost() {
    if (typeof process === "undefined" || !process.versions || !process.versions.node) return null;
    const fs = require("fs");
    const path = require("path");
    return {
      output: (line) => process.stdout.write(line + "\n"),
      input: () => null,
      readFile: (p) => fs.readFileSync(p, "utf8"),
      writeFile: (p, text, append) => (append ? fs.appendFileSync(p, text, "utf8") : fs.writeFileSync(p, text, "utf8")),
      path: { join: (a, b) => path.resolve(a, b), dirname: path.dirname, normalize: path.normalize },
      sleep: (s) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s * 1000),
    };
  }

  function memoryHost(files = {}) {
    const store = new Map(Object.entries(files).map(([k, v]) => [simplePath.normalize(k), v]));
    return {
      files: store,
      output: (line) => console.log(line),
      input: (prompt) => (typeof prompt === "string" && typeof window !== "undefined" && window.prompt ? window.prompt(prompt) : null),
      readFile(p) {
        const key = simplePath.normalize(p);
        if (!store.has(key)) throw new Error("ENOENT");
        return store.get(key);
      },
      writeFile(p, text, append) {
        const key = simplePath.normalize(p);
        store.set(key, (append && store.has(key) ? store.get(key) : "") + text);
      },
      path: simplePath,
      sleep(s) {
        const end = Date.now() + Math.min(s, 5) * 1000;
        while (Date.now() < end) { /* attente active (navigateur) */ }
      },
    };
  }

  function defaultHost() {
    return nodeHost() || memoryHost();
  }

  // =====================================================================
  // Interpréteur
  // =====================================================================

  class BreakSignal {}
  class ContinueSignal {}
  class ReturnSignal {
    constructor(value) { this.value = value; }
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  class Interpreter {
    /**
     * options :
     *   output(line)      afficher une ligne
     *   input(prompt)     renvoie la réponse (texte) ou null (fin de l'entrée)
     *   baseDir           dossier pour 'jib', agri, aktib
     *   host              { readFile, writeFile, path, sleep } (sinon : Node ou mémoire)
     *   random()          nombre entre 0 et 1 (Math.random par défaut)
     *   maxSteps          arrête un programme trop long (terrain de jeu)
     */
    constructor(options = {}) {
      this.host = Object.assign({}, defaultHost(), options.host || {});
      this.output = options.output || this.host.output;
      this.input = options.input || this.host.input;
      this.baseDir = options.baseDir || ".";
      this.random = options.random || Math.random;
      this.maxSteps = options.maxSteps || 0;
      this.steps = 0;
      this.imported = new Set();
      this.globals = new Environment();
      this.installBuiltins();
    }

    installBuiltins() {
      const self = this;
      const err = (m) => new KalamError(m);

      function numbersOf(args, fname) {
        const values = args.length === 1 && isList(args[0]) ? args[0] : args;
        if (!values.length) throw err(`${fname} bidôr ashyâ (au moins une valeur)`);
        if (!values.every(isNumber)) throw err(`${fname} bidôr nimar bas (des nombres seulement)`);
        return values;
      }
      function iterItems(x) {
        if (isList(x)) return x;
        if (isStr(x)) return codePoints(x);
        if (isDict(x)) return Array.from(x.keys());
        throw new TypeError("not iterable");
      }
      function filePath(p) { return self.host.path.join(self.baseDir, toText(p)); }

      const B = {
        // ----- nombres -----
        aktar: [null, 0, Infinity, (...a) => numbersOf(a, "aktar").reduce((m, v) => (v > m ? v : m))],
        agall: [null, 0, Infinity, (...a) => numbersOf(a, "agall").reduce((m, v) => (v < m ? v : m))],
        jumla: [1, 1, 1, (l) => (truthy(l) ? numbersOf([l], "jumla").reduce((s, v) => s + v, 0) : 0)],
        garrib: [null, 1, 2, (x, digits = 0) => {
          if (!isNumber(x)) throw err("garrib bidôr nimra");
          const n = pyInt(digits);
          return pyRound(x, n);
        }],
        mutlag: [1, 1, 1, (x) => {
          if (!isNumber(x)) throw err("mutlag bidôr nimra");
          return Math.abs(x);
        }],
        // ----- textes et listes -----
        fattish: [2, 2, 2, (where, what) => {
          if (isStr(where)) {
            const idx = where.indexOf(toText(what));
            return idx < 0 ? -1 : codePoints(where.slice(0, idx)).length;
          }
          if (isList(where)) return where.findIndex((v) => kalamEq(v, what));
          throw err("fattish bidôr kitaba walla liste");
        }],
        ghayyir: [3, 3, 3, (t, a, b) => pyStr(t).split(toText(a)).join(toText(b))],
        gata: [null, 2, 3, (x, start, end) => {
          if (!isStr(x) && !isList(x)) throw err("gata bidôr kitaba walla liste");
          const items = isStr(x) ? codePoints(x) : x;
          const s = pySliceIndex(pyInt(start), items.length);
          const e = end === undefined ? items.length : pySliceIndex(pyInt(end), items.length);
          const part = items.slice(s, Math.max(s, e));
          return isStr(x) ? part.join("") : part;
        }],
        gallib: [1, 1, 1, (x) => {
          if (isStr(x)) return codePoints(x).reverse().join("");
          if (isList(x)) return x.slice().reverse();
          throw err("gallib bidôr kitaba walla liste");
        }],
        naddif: [1, 1, 1, (t) => pyStr(t).trim()],
        bada_be: [2, 2, 2, (t, p) => pyStr(t).startsWith(toText(p))],
        kammal_be: [2, 2, 2, (t, s) => pyStr(t).endsWith(toText(s))],
        azil: [1, 1, 1, (l) => {
          if ((!isList(l) && !isStr(l)) || !truthy(l)) throw err("azil bidôr liste al-indaha haja");
          const items = isStr(l) ? codePoints(l) : l;
          return items[Math.floor(self.random() * items.length)];
        }],
        khalbit: [1, 1, 1, (l) => {
          if (!isList(l)) throw err("khalbit bidôr liste");
          for (let i = l.length - 1; i > 0; i--) {
            const j = Math.floor(self.random() * (i + 1));
            [l[i], l[j]] = [l[j], l[i]];
          }
          return l;
        }],
        giyam: [1, 1, 1, (d) => {
          if (!isDict(d)) throw err("giyam bidôr dikt (dictionnaire attendu)");
          return Array.from(d.values());
        }],
        nuskha: [1, 1, 1, (x) => (isList(x) ? x.slice() : isDict(x) ? new Map(x) : x)],
        // ----- temps -----
        wakit: [0, 0, 0, () => Date.now() / 1000],
        agod: [1, 1, 1, (s) => {
          if (!isNumber(s) || s < 0) throw err("agod bidôr nimra (secondes)");
          self.host.sleep(s);
          return null;
        }],
        al_yom: [0, 0, 0, () => {
          const d = new Date();
          return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
        }],
        as_sa: [0, 0, 0, () => {
          const d = new Date();
          return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
        }],
        // ----- fichiers -----
        agri: [1, 1, 1, (p) => {
          try {
            return self.host.readFile(filePath(p));
          } catch (e) {
            throw err(`al-file '${toText(p)}' da ma ligênah (fichier introuvable)`);
          }
        }],
        aktib: [null, 2, 3, (p, text, add = false) => {
          try {
            self.host.writeFile(filePath(p), toText(text), truthy(add));
          } catch (e) {
            throw err(`ma gidirna naktubu fi '${toText(p)}'`);
          }
          return null;
        }],
        // ----- de base -----
        ori: [null, 0, Infinity, (...args) => {
          self.output(args.map((a) => toText(a)).join(" "));
          return null;
        }],
        asal: [null, 0, 1, (prompt = "") => {
          const answer = self.input(toText(prompt));
          if (answer === null || answer === undefined) throw err("asal : ma fi kalâm jâ (fin de l'entrée)");
          return String(answer);
        }],
        gadur: [1, 1, 1, (x) => {
          if (isStr(x)) return codePoints(x).length;
          if (isList(x)) return x.length;
          if (isDict(x)) return x.size;
          throw err(`gadur ma bagdar bisawwi ma'a ${typeName(x)}`);
        }],
        nimra: [1, 1, 1, (x) => {
          if (isBool(x)) return Number(x);
          if (isNumber(x)) return x;
          const v = parseNumberText(x);
          if (v === null) throw err(`${toText(x, true)} da ma nimra (ce n'est pas un nombre)`);
          return v;
        }],
        kitaba: [1, 1, 1, (x) => toText(x)],
        shakal: [1, 1, 1, (x) => typeName(x)],
        zid: [2, 2, 2, (l, item) => {
          if (!isList(l)) throw err("zid bidôr liste (liste attendue)");
          l.push(item);
          return l;
        }],
        shil: [null, 1, 2, (l, index) => {
          if (!isList(l) || !l.length) throw err("shil bidôr liste al-indaha haja (liste non vide attendue)");
          if (index === undefined) return l.pop();
          let i = pyInt(index);
          if (i < 0) i += l.length;
          if (i < 0 || i >= l.length) throw err(`index ${toText(index)} marag barra (hors limites, gadur = ${l.length})`);
          return l.splice(i, 1)[0];
        }],
        mafatih: [1, 1, 1, (d) => {
          if (!isDict(d)) throw err("mafatih bidôr dikt (dictionnaire attendu)");
          return Array.from(d.keys());
        }],
        sudfa: [2, 2, 2, (a, b) => {
          const lo = pyInt(a);
          const hi = pyInt(b);
          if (lo > hi) throw err("sudfa : al-awwal lâzim yabga agall min at-tâni");
          return lo + Math.floor(self.random() * (hi - lo + 1));
        }],
        jidir: [1, 1, 1, (x) => {
          if (!isNumber(x) && !isBool(x)) throw new TypeError("jidir");
          return Math.sqrt(Number(x));
        }],
        gassim: [null, 1, 2, (t, sep = " ") => {
          const s = toTextSep(sep);
          return pyStr(t).split(s);
        }],
        lumm: [null, 1, 2, (l, sep = "") => iterItems(l).map((v) => toText(v)).join(pyStr(sep))],
        rattib: [1, 1, 1, (l) => {
          try {
            return mergeSort(iterItems(l).slice(), pyLess);
          } catch (e) {
            if (e instanceof TypeError) throw err("rattib : ma nagdar nirattib ashyâ shakalhum mâ wâhid (types différents)");
            throw e;
          }
        }],
        kabir: [1, 1, 1, (t) => pyStr(t).toUpperCase()],
        saghayyar: [1, 1, 1, (t) => pyStr(t).toLowerCase()],
      };

      function toTextSep(sep) {
        if (!isStr(sep)) throw new TypeError("sep");
        if (sep === "") throw err("gassim : al-fâsil ma yagdar yabga fâdi (séparateur vide)");
        return sep;
      }

      for (const [name, [arity, minArgs, maxArgs, fn]] of Object.entries(B)) {
        this.globals.define(name, new Builtin(name, fn, arity, minArgs, maxArgs));
      }
      this.globals.define("PI", Math.PI);
    }

    // ----- exécution -----
    run(program) {
      if (typeof program === "string") program = parse(program);
      try {
        this.execBlock(program.body, this.globals);
      } catch (e) {
        if (e instanceof BreakSignal) throw new KalamError("'agif' lâzim yabga juwa dôra ('agif' hors d'une boucle)");
        if (e instanceof ContinueSignal) throw new KalamError("'fut' lâzim yabga juwa dôra ('fut' hors d'une boucle)");
        if (e instanceof ReturnSignal) throw new KalamError("'rajja' lâzim yabga juwa khidime ('rajja' hors d'une fonction)");
        if (isStackOverflow(e)) throw new KalamError(RECURSION_MESSAGE);
        throw e;
      }
    }

    execBlock(stmts, env) {
      let result = null;
      for (const stmt of stmts) result = this.execute(stmt, env);
      return result;
    }

    execute(n, env) {
      if (this.maxSteps && ++this.steps > this.maxSteps) {
        throw new KalamError("al-barnâmij tawwal katîr — yimkin dôra ma indaha nihâya ? (programme trop long : boucle infinie ?)", n.line);
      }
      switch (n.kind) {
        case "ExprStmt": return this.evaluate(n.expr, env);
        case "Let": env.define(n.name, this.evaluate(n.value, env)); return null;
        case "Assign": return this.execAssign(n, env);
        case "If": {
          for (const [cond, body] of n.branches) {
            if (truthy(this.evaluate(cond, env))) return this.execBlock(body, env);
          }
          if (n.else_body !== null) return this.execBlock(n.else_body, env);
          return null;
        }
        case "While":
          while (truthy(this.evaluate(n.cond, env))) {
            try {
              this.execBlock(n.body, env);
            } catch (e) {
              if (e instanceof BreakSignal) break;
              if (e instanceof ContinueSignal) continue;
              throw e;
            }
          }
          return null;
        case "For": return this.execFor(n, env);
        case "FuncDef": env.define(n.name, new KFunction(n.name, n.params, n.body, env)); return null;
        case "Return": throw new ReturnSignal(n.value !== null ? this.evaluate(n.value, env) : null);
        case "Break": throw new BreakSignal();
        case "Continue": throw new ContinueSignal();
        case "Try": return this.execTry(n, env);
        case "Throw": {
          const value = this.evaluate(n.value, env);
          const e = new KalamError(toText(value), n.line, n.col, n.length);
          e.thrown = value;
          e.hasThrown = true;
          throw e;
        }
        case "Import": return this.execImport(n);
        default: throw new Error("noeud inconnu : " + n.kind);
      }
    }

    execAssign(n, env) {
      const value = this.evaluate(n.value, env);
      const target = n.target;
      if (target.kind === "Var") {
        env.assign(target.name, value);
      } else {
        const obj = this.evaluate(target.obj, env);
        const key = this.evaluate(target.index, env);
        this.setIndex(obj, key, value, n.line);
      }
      return null;
    }

    execFor(n, env) {
      let iterable = this.evaluate(n.iterable, env);
      if (isDict(iterable)) iterable = Array.from(iterable.keys());
      else if (isList(iterable)) iterable = iterable.slice();
      else if (isStr(iterable)) iterable = codePoints(iterable);
      else if (!(iterable instanceof KRange)) {
        throw new KalamError(`ma tagdar tilfa fôg ${typeName(iterable)} (non itérable)`, n.line);
      }
      for (const item of iterable) {
        env.assign(n.name, item);
        try {
          this.execBlock(n.body, env);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
      }
      return null;
    }

    execTry(n, env) {
      let caught;
      try {
        this.execBlock(n.body, env);
        return null;
      } catch (e) {
        if (e instanceof KalamError) caught = e.hasThrown ? e.thrown : e.kalamMessage;
        else if (isStackOverflow(e)) caught = RECURSION_MESSAGE;
        else throw e;
      }
      if (n.name) env.assign(n.name, caught);
      this.execBlock(n.handler, env);
      return null;
    }

    execImport(n) {
      const p = n.path.endsWith(".klm") ? n.path : n.path + ".klm";
      const full = this.host.path.normalize(this.host.path.join(this.baseDir, p));
      if (this.imported.has(full)) return null;
      this.imported.add(full);
      let source;
      try {
        source = this.host.readFile(full);
      } catch (e) {
        throw new KalamError(`al-file '${p}' da ma ligênah (fichier introuvable)`, n.line, n.col, n.length);
      }
      const oldDir = this.baseDir;
      this.baseDir = this.host.path.dirname(full);
      try {
        this.execBlock(parse(tokenize(source)).body, this.globals);
      } catch (e) {
        if (e instanceof KalamError && !e.hasThrown) {
          throw new KalamError(`fi '${p}' satir ${e.line}: ${e.kalamMessage}`, n.line, n.col, n.length);
        }
        throw e;
      } finally {
        this.baseDir = oldDir;
      }
      return null;
    }

    // ----- évaluation -----
    evaluate(n, env) {
      switch (n.kind) {
        case "Literal": return n.value;
        case "Var": {
          const scope = env.find(n.name);
          if (!scope) throw new KalamError(undefinedMessage(n.raw || n.name), n.line, n.col, n.length);
          return scope.vars.get(n.name);
        }
        case "List": return n.items.map((i) => this.evaluate(i, env));
        case "Dict": {
          const d = new Map();
          for (const [k, v] of n.pairs) {
            const key = this.evaluate(k, env);
            const value = this.evaluate(v, env);
            try {
              dictSet(d, key, value);
            } catch (e) {
              throw new KalamError(`ma tagdar tista'mil ${typeName(key)} ke miftâh (clé invalide)`, n.line);
            }
          }
          return d;
        }
        case "Range": {
          const start = this.evaluate(n.start, env);
          const end = this.evaluate(n.end, env);
          if (!isInt(start) || !isInt(end)) {
            throw new KalamError("min ... lahaddi bidôr nimra kâmle (entiers attendus)", n.line);
          }
          const step = end >= start ? 1 : -1;
          return new KRange(start, end + step, step);
        }
        case "Lambda": return new KFunction("bala usum", n.params, n.body, env);
        case "Logic": {
          const left = this.evaluate(n.left, env);
          if (n.op === "wa") return truthy(left) ? this.evaluate(n.right, env) : left;
          return truthy(left) ? left : this.evaluate(n.right, env);
        }
        case "Unary": {
          const value = this.evaluate(n.operand, env);
          if (n.op === "ma") return !truthy(value);
          if (!isNumber(value)) throw new KalamError(`ma tagdar tisawwi '-' le ${typeName(value)}`, n.line);
          return -value;
        }
        case "Binary": return this.evalBinary(n, env);
        case "Index": return this.evalIndex(n, env);
        case "Call": {
          const fn = this.evaluate(n.callee, env);
          const args = n.args.map((a) => this.evaluate(a, env));
          return this.call(fn, args, n.line);
        }
        default: throw new Error("noeud inconnu : " + n.kind);
      }
    }

    evalBinary(n, env) {
      const a = this.evaluate(n.left, env);
      const b = this.evaluate(n.right, env);
      const op = n.op;
      const line = n.line;

      if (op === "fi") {
        if (isStr(b)) return b.includes(toText(a));
        if (isList(b)) return b.some((x) => kalamEq(a, x));
        if (isDict(b)) return Array.from(b.keys()).some((x) => kalamEq(a, x));
        throw new KalamError(`ma tagdar tifattish fi ${typeName(b)}`, line);
      }
      if (op === "==") return kalamEq(a, b);
      if (op === "!=") return !kalamEq(a, b);

      if (op === "+") {
        if (isStr(a) || isStr(b)) return toText(a) + toText(b);
        if (isList(a) && isList(b)) return a.concat(b);
      }
      if (op === "*" && isStr(a) && isInt(b)) return a.repeat(Math.max(0, b));

      if (["<", ">", "<=", ">="].includes(op) && isStr(a) && isStr(b)) {
        // comparaison de textes
      } else if (!(isNumber(a) && isNumber(b))) {
        throw new KalamError(`ma tagdar tisawwi '${op}' bên ${typeName(a)} wa ${typeName(b)}`, line);
      }

      switch (op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/":
        case "%":
          if (b === 0) throw new KalamError("ma tagdar tigassim be sifir (division par zéro)", line);
          return op === "%" ? pyMod(a, b) : a / b;
        case "<": return a < b;
        case ">": return a > b;
        case "<=": return a <= b;
        case ">=": return a >= b;
      }
      throw new KalamError(`operateur ${op} da ma na'arfah`, line);
    }

    evalIndex(n, env) {
      const obj = this.evaluate(n.obj, env);
      const key = this.evaluate(n.index, env);
      if (isDict(obj)) {
        const v = dictGet(obj, key);
        return v === undefined ? null : v;
      }
      if (isList(obj) || isStr(obj)) {
        if (!isInt(key)) throw new KalamError("al-index lâzim yabga nimra kâmle (index entier attendu)", n.line);
        const items = isStr(obj) ? codePoints(obj) : obj;
        const i = key < 0 ? key + items.length : key;
        if (i < 0 || i >= items.length) {
          throw new KalamError(`index ${key} marag barra (hors limites, gadur = ${items.length})`, n.line);
        }
        return items[i];
      }
      throw new KalamError(`ma tagdar tisawwi [] le ${typeName(obj)}`, n.line);
    }

    setIndex(obj, key, value, line) {
      if (isDict(obj)) {
        try {
          dictSet(obj, key, value);
        } catch (e) {
          throw new KalamError(`ma tagdar tista'mil ${typeName(key)} ke miftâh (clé invalide)`, line);
        }
      } else if (isList(obj)) {
        if (!isInt(key)) throw new KalamError("al-index lâzim yabga nimra kâmle (index entier attendu)", line);
        const i = key < 0 ? key + obj.length : key;
        if (i < 0 || i >= obj.length) {
          throw new KalamError(`index ${key} marag barra (hors limites, gadur = ${obj.length})`, line);
        }
        obj[i] = value;
      } else {
        throw new KalamError(`ma tagdar tibaddil ${typeName(obj)}`, line);
      }
    }

    call(fn, args, line) {
      if (fn instanceof Builtin) {
        if (fn.arity !== null && args.length !== fn.arity) {
          throw new KalamError(`${fn.name} bidôr ${fn.arity} argument, inta antêtah ${args.length}`, line);
        }
        if (args.length < fn.minArgs || args.length > fn.maxArgs) {
          throw new KalamError(`al-arguments hana ${fn.name} ma sameh`, line);
        }
        try {
          return fn.fn(...args);
        } catch (e) {
          if (e instanceof KalamError) {
            if (e.line == null) e.line = line;
            throw e;
          }
          if (e instanceof TypeError) throw new KalamError(`al-arguments hana ${fn.name} ma sameh`, line);
          throw e;
        }
      }
      if (fn instanceof KFunction) {
        if (args.length !== fn.params.length) {
          throw new KalamError(`${fn.name} bidôr ${fn.params.length} argument, inta antêtah ${args.length}`, line);
        }
        const local = new Environment(fn.closure);
        fn.params.forEach((name, i) => local.define(name, args[i]));
        try {
          this.execBlock(fn.body, local);
        } catch (e) {
          if (e instanceof ReturnSignal) return e.value;
          throw e;
        }
        return null;
      }
      throw new KalamError(`${typeName(fn)} da ma khidime (ce n'est pas une fonction)`, line);
    }
  }

  function mergeSort(items, less) {
    // tri stable qui laisse remonter les erreurs de comparaison (comme sorted())
    if (items.length < 2) return items;
    const mid = items.length >> 1;
    const a = mergeSort(items.slice(0, mid), less);
    const b = mergeSort(items.slice(mid), less);
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) out.push(less(b[j], a[i]) ? b[j++] : a[i++]);
    return out.concat(a.slice(i), b.slice(j));
  }

  // =====================================================================
  // Vérificateur (erreurs soulignées dans l'éditeur, sans exécuter)
  // =====================================================================

  const GLOBAL_NAMES = new Set();
  const BUILTIN_ARITY = new Map();
  {
    const probe = new Interpreter({ host: memoryHost() });
    for (const [name, value] of probe.globals.vars) {
      GLOBAL_NAMES.add(name);
      if (value instanceof Builtin && value.arity !== null) BUILTIN_ARITY.set(name, value.arity);
    }
  }

  function diagnostic(message, line, col, length, severity = "error") {
    return { line, col: col != null ? col : 0, length: length || 1, message, severity };
  }

  function* children(n) {
    for (const [key, value] of Object.entries(n)) {
      if (key === "kind" || key === "line") continue;
      yield* nodesIn(value);
    }
  }
  function* nodesIn(value) {
    if (value && typeof value === "object" && typeof value.kind === "string") yield value;
    else if (Array.isArray(value)) for (const v of value) yield* nodesIn(v);
  }

  class Checker {
    constructor(baseDir, host) {
      this.baseDir = baseDir;
      this.host = host;
      this.defined = new Set(GLOBAL_NAMES);
      this.userDefined = new Set();
      this.problems = [];
      this.importsUnknown = false;
      this.seenFiles = new Set();
    }
    run(program) {
      this.collect(program);
      this.visit(program, false, false);
      this.problems.sort((a, b) => a.line - b.line || a.col - b.col);
      return this.problems;
    }
    collect(n) {
      const names = [];
      if (n.kind === "Let" || n.kind === "FuncDef" || n.kind === "For") names.push(n.name);
      else if (n.kind === "Assign" && n.target.kind === "Var") names.push(n.target.name);
      else if (n.kind === "Try" && n.name) names.push(n.name);
      else if (n.kind === "Import") this.collectImport(n);
      if (n.kind === "FuncDef" || n.kind === "Lambda") names.push(...n.params);
      for (const name of names) {
        this.defined.add(name);
        this.userDefined.add(name);
      }
      for (const child of children(n)) this.collect(child);
    }
    collectImport(n) {
      if (this.baseDir == null || !this.host) {
        this.importsUnknown = true;
        return;
      }
      const p = n.path.endsWith(".klm") ? n.path : n.path + ".klm";
      const full = this.host.path.normalize(this.host.path.join(this.baseDir, p));
      if (this.seenFiles.has(full)) return;
      this.seenFiles.add(full);
      let program;
      try {
        program = parse(tokenize(this.host.readFile(full)));
      } catch (e) {
        if (!(e instanceof KalamError)) {
          this.report(n, `al-file '${n.path}' da ma ligênah (fichier introuvable)`);
        }
        this.importsUnknown = true;
        return;
      }
      const sub = new Checker(this.host.path.dirname(full), this.host);
      sub.seenFiles = this.seenFiles;
      sub.collect(program);
      for (const x of sub.defined) this.defined.add(x);
      for (const x of sub.userDefined) this.userDefined.add(x);
      this.importsUnknown = this.importsUnknown || sub.importsUnknown;
    }
    report(n, message, length = null, severity = "error") {
      this.problems.push(diagnostic(message, n.line, n.col != null ? n.col : 0,
        length || (n.length != null ? n.length : 1), severity));
    }
    visit(n, inLoop, inFunc) {
      const kind = n.kind;
      if (kind === "Var" && !this.defined.has(n.name) && !this.importsUnknown) {
        this.report(n, undefinedMessage(n.raw || n.name));
      } else if (kind === "Call" && n.callee.kind === "Var") {
        const name = n.callee.name;
        if (BUILTIN_ARITY.has(name) && !this.userDefined.has(name) && n.args.length !== BUILTIN_ARITY.get(name)) {
          this.report(n.callee, `${name} bidôr ${BUILTIN_ARITY.get(name)} argument, inta antêtah ${n.args.length}`);
        }
      } else if ((kind === "Break" || kind === "Continue") && !inLoop) {
        const word = kind === "Break" ? "agif" : "fut";
        this.report(n, `'${word}' lâzim yabga juwa dôra (hors d'une boucle)`, 0);
      } else if (kind === "Return" && !inFunc) {
        this.report(n, "'rajja' lâzim yabga juwa khidime (hors d'une fonction)", 0);
      }
      if (kind === "While" || kind === "For") inLoop = true;
      if (kind === "FuncDef" || kind === "Lambda") {
        inFunc = true;
        inLoop = false;
      }
      for (const child of children(n)) this.visit(child, inLoop, inFunc);
    }
  }

  /** Vérifie un programme sans l'exécuter. `filePath` sert à suivre les 'jib'. */
  function check(source, filePath = null, host = null) {
    let program;
    try {
      program = parse(tokenize(source));
    } catch (e) {
      if (e instanceof KalamError) return [diagnostic(e.kalamMessage, e.line || 1, e.col, e.length)];
      throw e;
    }
    const h = host || defaultHost();
    const baseDir = filePath ? h.path.dirname(h.path.join(".", filePath)) : null;
    return new Checker(baseDir, h).run(program);
  }

  /** Exécute un programme. Renvoie l'interpréteur (ses variables restent accessibles). */
  function run(source, options = {}) {
    const interp = options instanceof Interpreter ? options : new Interpreter(options);
    interp.run(parse(tokenize(source)));
    return interp;
  }

  return {
    VERSION,
    KEYWORDS,
    KalamError,
    Interpreter,
    tokenize,
    parse,
    check,
    run,
    toText,
    typeName,
    stripAccents,
    memoryHost,
    simplePath,
    builtinNames: () => Array.from(GLOBAL_NAMES),
  };
});
