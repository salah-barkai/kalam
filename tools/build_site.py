"""Construit le site de Kalam (dossier site/) et le cours PDF.

    python tools/build_site.py            # site + cours HTML + PDF
    python tools/build_site.py --no-pdf   # sans le PDF
    python tools/build_site.py --check    # vérifie seulement les programmes du cours

Chaque bloc ```kalam du cours est exécuté et son vrai résultat est inséré
sous le code. Options d'un bloc (après le mot kalam) :
    entrees="a|b"       réponses données aux appels asal(), dans l'ordre
    erreur              le programme DOIT s'arrêter sur une erreur (affichée)
    hasard              résultat aléatoire : affiché comme « exemple de résultat »
    fichier="x.klm"     le code est enregistré sous ce nom (pour jib), pas exécuté
"""

import argparse
import datetime
import html
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from kalam import Interpreter, KalamError, run_source  # noqa: E402
from kalam.checker import check  # noqa: E402
from kalam.lexer import KEYWORDS  # noqa: E402

SITE = os.path.join(ROOT, "site")
COURSE_MD = os.path.join(ROOT, "docs", "cours.md")
BUILTINS = set(Interpreter().globals.vars)

BLOCK_RE = re.compile(r"^```kalam([^\n]*)\n(.*?)^```[ \t]*$", re.S | re.M)
OPT_RE = re.compile(r'(\w+)(?:="([^"]*)")?')


# ---------------------------------------------------------------- coloration

TOKEN_RE = re.compile(
    r"(?P<comment>#[^\n]*)"
    r"|(?P<string>\"(?:\\.|[^\"\\\n])*\"?|(?<![\w'])'(?:\\.|[^'\\\n])*'?)"
    r"|(?P<number>\b\d+(?:\.\d+)?\b)"
    r"|(?P<word>[^\W\d][\w']*)"
    r"|(?P<op>==|!=|<=|>=|[+\-*/]=|[-+*/%<>=])"
    r"|(?P<other>.)",
    re.S,
)


def plain(word):
    d = unicodedata.normalize("NFD", word)
    return "".join(c for c in d if unicodedata.category(c) != "Mn").replace("'", "")


def highlight(code):
    out = []
    for m in TOKEN_RE.finditer(code):
        kind = m.lastgroup
        text = html.escape(m.group())
        if kind == "word":
            p = plain(m.group())
            if p.lower() in ("sahi", "ghalat", "mafi") or p == "PI":
                kind = "const"
            elif p.lower() in KEYWORDS:
                kind = "kw"
            elif p in BUILTINS and code[m.end():m.end() + 1] == "(":
                kind = "fn"
            else:
                kind = None
        if kind in (None, "other"):
            out.append(text)
        else:
            out.append(f'<span class="t-{kind}">{text}</span>')
    return "".join(out)


# ---------------------------------------------------------------- exécution

class BlockFailure(Exception):
    pass


def run_block(code, opts, workdir, where):
    if "fichier" in opts:
        with open(os.path.join(workdir, opts["fichier"]), "w", encoding="utf-8") as f:
            f.write(code)
        return None

    if "erreur" not in opts:
        problems = check(code, os.path.join(workdir, "cours.klm"))
        if problems:
            raise BlockFailure(f"{where}: le vérificateur signale {problems}")

    answers = opts.get("entrees")
    answers = iter(answers.split("|")) if answers else iter(())
    lines = []

    def ask(prompt=""):
        try:
            answer = next(answers)
        except StopIteration:
            raise BlockFailure(f"{where}: pas assez de réponses pour asal()")
        lines.append(prompt + answer)
        return answer

    random.seed(2026)
    old_cwd = os.getcwd()
    os.chdir(workdir)
    try:
        run_source(code, Interpreter(output=lines.append, input_fn=ask, base_dir=workdir))
        if "erreur" in opts:
            raise BlockFailure(f"{where}: le programme devait échouer mais a réussi")
        return lines, False
    except KalamError as e:
        if "erreur" not in opts:
            raise BlockFailure(f"{where}: erreur inattendue : {e}\n{code}")
        lines.append(str(e))
        return lines, True
    finally:
        os.chdir(old_cwd)


def render_block(code, opts, result):
    parts = ['<figure class="prog">']
    if "fichier" in opts:
        parts.append(f'<figcaption>Fichier <code>{html.escape(opts["fichier"])}</code></figcaption>')
    parts.append(f'<pre class="code"><code>{highlight(code.rstrip())}</code></pre>')
    if result is not None:
        lines, failed = result
        label = "Exemple de résultat" if "hasard" in opts else "Résultat"
        cls = "out err" if failed else "out"
        body = html.escape("\n".join(lines)) if lines else "<em>(rien n'est affiché)</em>"
        parts.append(f'<div class="{cls}"><span class="out-label">{label}</span><pre>{body}</pre></div>')
    parts.append("</figure>")
    return "".join(parts)


def process_course(source):
    """Remplace chaque bloc kalam par son HTML (code + résultat). Renvoie (md, blocs)."""
    rendered = {}
    workdir = tempfile.mkdtemp(prefix="kalam-cours-")
    count = 0

    def replace(m):
        nonlocal count
        count += 1
        opts = {k: v for k, v in OPT_RE.findall(m.group(1))}
        line_no = source.count("\n", 0, m.start()) + 1
        code = m.group(2)
        result = run_block(code, opts, workdir, f"cours.md, ligne {line_no}")
        token = f"KALAMBLOCK{count:04d}"
        rendered[token] = render_block(code, opts, result)
        return f"\n{token}\n"

    try:
        md = BLOCK_RE.sub(replace, source)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    return md, rendered, count


# ---------------------------------------------------------------- HTML du cours

def slug(text):
    s = plain(re.sub(r"<[^>]+>", "", text)).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def build_course_html(md_text, rendered):
    import markdown  # seulement nécessaire pour produire le HTML (pip install markdown)

    body = markdown.markdown(md_text, extensions=["tables", "fenced_code"])
    for token, block in rendered.items():
        body = body.replace(f"<p>{token}</p>", block).replace(token, block)

    toc = []

    def h1(m):
        title = m.group(1)
        anchor = slug(title)
        if title.startswith("Partie"):
            num, _, name = title.partition(" — ")
            toc.append(f'<li class="toc-part"><a href="#{anchor}">{title}</a></li>')
            return (f'<section class="part" id="{anchor}"><p class="part-num">{num}</p>'
                    f'<h1>{name}</h1></section>')
        cls = "toc-annex" if title.startswith(("Annexe", "Préface")) else "toc-ch"
        toc.append(f'<li class="{cls}"><a href="#{anchor}">{title}</a></li>')
        return f'<h1 class="chapter" id="{anchor}">{title}</h1>'

    body = re.sub(r"<h1>(.*?)</h1>", h1, body)
    body = re.sub(r"<h2>(.*?)</h2>", lambda m: f'<h2 id="{slug(m.group(1))}">{m.group(1)}</h2>', body)
    return body, "\n".join(toc)


def page(template_name, **values):
    with open(os.path.join(ROOT, "tools", "templates", template_name), encoding="utf-8") as f:
        text = f.read()
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    return text


def find_browser(explicit=None):
    candidates = [explicit] if explicit else []
    candidates += [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        "google-chrome", "chromium", "chromium-browser", "microsoft-edge",
    ]
    for c in candidates:
        if c and (os.path.exists(c) or shutil.which(c)):
            return c
    return None


def make_pdf(html_path, pdf_path, browser):
    url = "file:///" + html_path.replace("\\", "/").lstrip("/")
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run(
            [browser, "--headless", "--disable-gpu", "--no-sandbox",
             f"--user-data-dir={profile}", "--no-pdf-header-footer",
             "--print-to-pdf-no-header", f"--print-to-pdf={pdf_path}", url],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180,
        )
    if not os.path.exists(pdf_path):
        raise SystemExit("Le PDF n'a pas été créé.")


# ---------------------------------------------------------------- site

def copy_tree_files(src, dest, suffix):
    os.makedirs(dest, exist_ok=True)
    names = []
    for name in sorted(os.listdir(src)):
        if name.endswith(suffix):
            shutil.copyfile(os.path.join(src, name), os.path.join(dest, name))
            names.append(name)
    return names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-pdf", action="store_true")
    ap.add_argument("--check", action="store_true", help="vérifie seulement le cours")
    ap.add_argument("--browser", help="chemin de Chrome / Edge pour le PDF")
    args = ap.parse_args()

    with open(COURSE_MD, encoding="utf-8") as f:
        source = f.read()
    try:
        md_text, rendered, count = process_course(source)
    except BlockFailure as e:
        raise SystemExit(f"ÉCHEC : {e}")
    print(f"{count} programmes du cours exécutés et vérifiés.")
    if args.check:
        return

    os.makedirs(SITE, exist_ok=True)
    for sub in ("assets",):
        os.makedirs(os.path.join(SITE, sub), exist_ok=True)
    shutil.copyfile(os.path.join(ROOT, "assets", "logo.svg"), os.path.join(SITE, "assets", "logo.svg"))
    shutil.copyfile(os.path.join(ROOT, "assets", "logo.png"), os.path.join(SITE, "assets", "logo.png"))

    # Interpréteur Python et exemples pour le terrain de jeu (Pyodide)
    py_files = copy_tree_files(os.path.join(ROOT, "kalam"), os.path.join(SITE, "py", "kalam"), ".py")
    examples = copy_tree_files(os.path.join(ROOT, "examples"), os.path.join(SITE, "exemples"), ".klm")
    # newline="\n" : sinon Windows écrit des \r\n et les noms deviennent "x.py\r"
    with open(os.path.join(SITE, "py", "manifest.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(py_files))
    with open(os.path.join(SITE, "exemples", "liste.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(examples))

    with open(os.path.join(ROOT, "assets", "logo.svg"), encoding="utf-8") as f:
        logo_svg = f.read()

    body, toc = build_course_html(md_text, rendered)
    today = datetime.date.today().strftime("%d/%m/%Y")
    course_html = page("cours.html", BODY=body, TOC=toc, LOGO=logo_svg, DATE=today)
    course_path = os.path.join(SITE, "cours.html")
    with open(course_path, "w", encoding="utf-8") as f:
        f.write(course_html)
    print("Cours HTML :", course_path)

    for name in ("index.html", "essayer.html"):
        with open(os.path.join(SITE, name), "w", encoding="utf-8") as f:
            f.write(page(name, LOGO=logo_svg, DATE=today))

    if not args.no_pdf:
        browser = find_browser(args.browser)
        if not browser:
            raise SystemExit("Chrome ou Edge introuvable : utilisez --browser ou --no-pdf.")
        pdf_path = os.path.join(SITE, "kalam-cours.pdf")
        make_pdf(course_path, pdf_path, browser)
        print("Cours PDF  :", pdf_path, f"({os.path.getsize(pdf_path) // 1024} Ko)")


if __name__ == "__main__":
    main()
