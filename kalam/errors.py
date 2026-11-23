class KalamError(Exception):
    """Erreur Kalam, avec la ligne (satir) et, si connue, la colonne et la longueur."""

    def __init__(self, message, line=None, col=None, length=1):
        self.message = message
        self.line = line
        self.col = col        # 0-based
        self.length = length
        super().__init__(self.__str__())

    def at(self, token):
        """Place l'erreur sur un jeton (si elle n'a pas déjà de position)."""
        if token is not None and self.line is None:
            self.line, self.col, self.length = token.line, token.col, token.length
        return self

    def __str__(self):
        if self.line is not None:
            return f"Ghalat fi satir {self.line}: {self.message}"
        return f"Ghalat: {self.message}"
