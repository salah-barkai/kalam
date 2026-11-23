class KalamError(Exception):
    """Erreur Kalam, avec le numéro de ligne (satir)."""

    def __init__(self, message, line=None):
        self.message = message
        self.line = line
        super().__init__(self.__str__())

    def __str__(self):
        if self.line is not None:
            return f"Ghalat fi satir {self.line}: {self.message}"
        return f"Ghalat: {self.message}"
