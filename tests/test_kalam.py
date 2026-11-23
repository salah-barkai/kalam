import unittest

from kalam import Interpreter, KalamError, run_source
from kalam.checker import check


def run(source, inputs=()):
    out = []
    feed = iter(inputs)
    interp = Interpreter(output=out.append, input_fn=lambda prompt="": next(feed))
    run_source(source, interp)
    return out


class TestKalam(unittest.TestCase):
    def test_ori(self):
        self.assertEqual(run('ori("salam")'), ["salam"])
        self.assertEqual(run("ori(1 + 2 * 3, sahi, mafi)"), ["7 sahi mafi"])

    def test_accents_optional(self):
        self.assertEqual(run('khalli x = 1\nkân x == 1\nôri("ê")\nkhalâs'), ["ê"])

    def test_variables_and_assign(self):
        self.assertEqual(run("khalli x = 5\nx = x + 1\nori(x)"), ["6"])

    def test_if_elif_else(self):
        src = """
khidime wên_nimra(n)
    kan n < 0
        rajja "tihit"
    walla kan n == 0
        rajja "sifir"
    walla
        rajja "fôg"
    khalas
khalas
ori(wên_nimra(-3), wên_nimra(0), wên_nimra(4))
"""
        self.assertEqual(run(src), ["tihit sifir fôg"])

    def test_for_range_and_list(self):
        self.assertEqual(run("kulla i fi min 1 lahaddi 3\nori(i)\nkhalas"), ["1", "2", "3"])
        self.assertEqual(run("kulla i fi min 3 lahaddi 1\nori(i)\nkhalas"), ["3", "2", "1"])
        self.assertEqual(run('kulla c fi ["a", "b"]\nori(c)\nkhalas'), ["a", "b"])

    def test_while_break_continue(self):
        src = """
khalli n = 0
tulma sahi
    n = n + 1
    kan n == 2
        fut
    khalas
    kan n > 4
        agif
    khalas
    ori(n)
khalas
"""
        self.assertEqual(run(src), ["1", "3", "4"])

    def test_recursion_and_closures(self):
        src = """
khidime fib(n)
    kan n < 2
        rajja n
    khalas
    rajja fib(n - 1) + fib(n - 2)
khalas
khidime addad(a)
    rajja khidime(b) rajja a + b khalas
khalas
khalli zid3 = addad(3)
ori(fib(15), zid3(4))
"""
        self.assertEqual(run(src), ["610 7"])

    def test_lists_dicts(self):
        src = """
khalli l = [1, 2]
zid(l, 3)
l[0] = 10
khalli d = {usum: "Ali", umur: 30}
d.madina = "Ndjamena"
ori(l, gadur(l), d.usum, d["umur"], d.madina)
"""
        self.assertEqual(run(src), ["[10, 2, 3] 3 Ali 30 Ndjamena"])

    def test_string_concat_and_division(self):
        self.assertEqual(run('ori("x=" + 5, 7 / 2, 6 / 3)'), ["x=5 3.5 2"])

    def test_logic(self):
        self.assertEqual(run("ori(sahi wa ma ghalat, ghalat aw 0, 1 == 1.0)"), ["sahi 0 sahi"])

    def test_input(self):
        self.assertEqual(run('khalli x = nimra(asal("?"))\nori(x * 2)', inputs=["21"]), ["42"])

    def test_errors(self):
        with self.assertRaises(KalamError) as ctx:
            run("ori(y)")
        self.assertIn("satir 1", str(ctx.exception))
        with self.assertRaises(KalamError):
            run("ori(1 / 0)")
        with self.assertRaises(KalamError):
            run("kan sahi\nori(1)")  # khalas manquant
        with self.assertRaises(KalamError):
            run('ori("a" - 1)')
        with self.assertRaises(KalamError):
            run("agif")


class TestRichFeatures(unittest.TestCase):
    def test_compound_assign(self):
        self.assertEqual(run("khalli x = 5\nx += 3\nx -= 1\nx *= 2\nx /= 7\nori(x)"), ["2"])
        self.assertEqual(run('khalli l = [1]\nl[0] += 4\nkhalli t = "a"\nt += "b"\nori(l, t)'), ["[5] ab"])

    def test_dict_keys_keep_accents(self):
        self.assertEqual(run('khalli d = {zêt: 1}\nori(d["zêt"], d.zêt, "zêt" fi d)'), ["1 1 sahi"])

    def test_membership(self):
        self.assertEqual(
            run('ori(2 fi [1, 2], "x" fi "bamya", "a" fi {a: 1}, ma 5 fi [1])'),
            ["sahi ghalat sahi sahi"],
        )

    def test_math(self):
        self.assertEqual(
            run("ori(aktar(3, 9, 2), agall([4, 1]), jumla([1, 2, 3]), garrib(2.6), mutlag(-3))"),
            ["9 1 6 3 3"],
        )

    def test_text_and_lists(self):
        src = 'ori(fattish("bamya", "y"), fattish([5, 6], 6), ghayyir("salam", "a", "o"), ' \
              'gata("Ndjamena", 1, 3), gallib("abc"), naddif(" x "), bada_be("Sarh", "Sa"))'
        self.assertEqual(run(src), ["3 1 solom dj cba x sahi"])

    def test_try_catch_builtin_error(self):
        src = "jarrib\n    ori(1 / 0)\n    ori(\"la\")\nmushkila m\n    ori(\"ligêna:\", m)\nkhalas"
        self.assertEqual(run(src), ["ligêna: ma tagdar tigassim be sifir (division par zéro)"])

    def test_throw_any_value(self):
        src = "jarrib\n    zagil {kod: 7}\nmushkila e\n    ori(e.kod)\nkhalas"
        self.assertEqual(run(src), ["7"])
        with self.assertRaises(KalamError) as ctx:
            run('zagil "khalas"')
        self.assertIn("khalas", str(ctx.exception))

    def test_try_does_not_swallow_control_flow(self):
        src = """
khidime f()
    kulla i fi min 1 lahaddi 5
        jarrib
            kan i == 3
                rajja i
            khalas
        mushkila
            ori("la")
        khalas
    khalas
khalas
ori(f())
"""
        self.assertEqual(run(src), ["3"])

    def test_import_and_files(self):
        import os
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "adawat.klm"), "w", encoding="utf-8") as f:
                f.write("khidime marratên(x)\n    rajja x * 2\nkhalas\n")
            out = []
            interp = Interpreter(output=out.append, base_dir=d)
            run_source('jib "adawat"\njib "adawat.klm"\nori(marratên(21))\n'
                       'aktib("a.txt", "salam")\naktib("a.txt", "!", sahi)\nori(agri("a.txt"))',
                       interp)
            self.assertEqual(out, ["42", "salam!"])
            with self.assertRaises(KalamError):
                run_source('jib "mafi"', Interpreter(base_dir=d))


class TestDocs(unittest.TestCase):
    def test_vscode_docs_cover_everything(self):
        """Chaque mot-clé et chaque fonction doit avoir son aide dans VS Code."""
        import json
        import os
        from kalam.lexer import KEYWORDS
        path = os.path.join(os.path.dirname(__file__), "..", "vscode-kalam", "docs.json")
        with open(path, encoding="utf-8") as f:
            docs = json.load(f)
        self.assertEqual(set(docs["keywords"]), KEYWORDS)
        self.assertEqual(set(docs["builtins"]), set(Interpreter().globals.vars))


class TestCourse(unittest.TestCase):
    def test_every_course_program_runs(self):
        """Tous les programmes du cours (docs/cours.md) s'exécutent comme annoncé."""
        import os
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
        import build_site
        with open(build_site.COURSE_MD, encoding="utf-8") as f:
            source = f.read()
        _, _, count = build_site.process_course(source)
        self.assertGreater(count, 90)


class TestChecker(unittest.TestCase):
    def test_valid_program_has_no_problems(self):
        src = "khidime f(a)\n    rajja a * 2\nkhalas\nkulla i fi min 1 lahaddi 3\n    ori(f(i))\nkhalas\n"
        self.assertEqual(check(src), [])

    def test_syntax_error_position(self):
        [d] = check("khalli x = 1\nkan x > 1\n    ori(x)\n")
        self.assertEqual((d["line"], d["col"], d["length"]), (2, 0, 3))

    def test_unterminated_string(self):
        [d] = check('ori("abc\n')
        self.assertEqual((d["line"], d["col"]), (1, 4))

    def test_static_problems(self):
        src = "ori(y)\nagif\nrajja 1\nori(gadur(1, 2))\nkhidime f(a)\n    rajja a + b\nkhalas\n"
        found = [(d["line"], d["col"]) for d in check(src)]
        self.assertEqual(found, [(1, 4), (2, 0), (3, 0), (4, 4), (6, 14)])

    def test_try_variable_is_defined(self):
        self.assertEqual(check("jarrib\n    zagil 1\nmushkila m\n    ori(m)\nkhalas\n"), [])

    def test_unknown_import_disables_undefined_check(self):
        # Sans chemin, on ne peut pas lire le fichier importé : pas de fausse alerte.
        self.assertEqual(check('jib "adawat"\nori(salam(1))\n'), [])

    def test_user_function_shadows_builtin(self):
        self.assertEqual(check("khidime gadur(a, b)\n    rajja a\nkhalas\nori(gadur(1, 2))\n"), [])


if __name__ == "__main__":
    unittest.main()
