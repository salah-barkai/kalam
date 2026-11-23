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

    def test_user_function_shadows_builtin(self):
        self.assertEqual(check("khidime gadur(a, b)\n    rajja a\nkhalas\nori(gadur(1, 2))\n"), [])


if __name__ == "__main__":
    unittest.main()
