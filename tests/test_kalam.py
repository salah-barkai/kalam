import unittest

from kalam import Interpreter, KalamError, run_source


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
khidma naw_adad(n)
    kan n < 0
        rajja "salib"
    walla kan n == 0
        rajja "sifir"
    walla
        rajja "mujab"
    khalas
khalas
ori(naw_adad(-3), naw_adad(0), naw_adad(4))
"""
        self.assertEqual(run(src), ["salib sifir mujab"])

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
khidma fib(n)
    kan n < 2
        rajja n
    khalas
    rajja fib(n - 1) + fib(n - 2)
khalas
khidma addad(a)
    rajja khidma(b) rajja a + b khalas
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
khalli d = {ism: "Ali", umur: 30}
d.madina = "Ndjamena"
ori(l, gadur(l), d.ism, d["umur"], d.madina)
"""
        self.assertEqual(run(src), ["[10, 2, 3] 3 Ali 30 Ndjamena"])

    def test_string_concat_and_division(self):
        self.assertEqual(run('ori("x=" + 5, 7 / 2, 6 / 3)'), ["x=5 3.5 2"])

    def test_logic(self):
        self.assertEqual(run("ori(sahi wa ma khalat, khalat aw 0, 1 == 1.0)"), ["sahi 0 sahi"])

    def test_input(self):
        self.assertEqual(run('khalli x = adad(asal("?"))\nori(x * 2)', inputs=["21"]), ["42"])

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


if __name__ == "__main__":
    unittest.main()
