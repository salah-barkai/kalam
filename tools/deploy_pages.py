"""Publie le site (dossier site/) sur la branche gh-pages de GitHub.

    python tools/build_site.py      # construit le site et le PDF
    python tools/deploy_pages.py    # publie sur https://<compte>.github.io/kalam/

La branche gh-pages ne contient que le site construit ; elle est remplacée
à chaque publication.
"""

import os
import shutil
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")


def git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True)


def main():
    if not os.path.exists(os.path.join(SITE, "index.html")):
        raise SystemExit("Le site n'est pas construit : lancez d'abord tools/build_site.py")
    remote = subprocess.run(["git", "remote", "get-url", "origin"], cwd=ROOT,
                            check=True, capture_output=True, text=True).stdout.strip()
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                            check=True, capture_output=True, text=True).stdout.strip()
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "site")
        shutil.copytree(SITE, out)
        # Sans ce fichier, GitHub Pages (Jekyll) ignore les fichiers qui
        # commencent par « _ », comme py/kalam/__init__.py.
        open(os.path.join(out, ".nojekyll"), "w").close()
        git("init", "-q", "-b", "gh-pages", cwd=out)
        git("add", "-A", cwd=out)
        git("commit", "-q", "-m", f"Site Kalam (depuis {commit})", cwd=out)
        git("push", "-q", "--force", remote, "gh-pages", cwd=out)
    print("Site publié sur la branche gh-pages.")


if __name__ == "__main__":
    main()
