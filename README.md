<p align="center"><img src="assets/logo.png" width="160" alt="Logo Kalam"></p>

# Kalam

**Kalam** est un langage de programmation en **arabe tchadien**, écrit en **lettres latines**.
Le but est que les Tchadiens puissent apprendre à programmer avec des mots qu'ils utilisent tous les jours.

```
khidime salam(usum)
    ori("Salam aleykum, " + usum + "!")
khalas

kulla usum fi ["Mahamat", "Fatime", "Abakar"]
    salam(usum)
khalas
```

## Lancer Kalam

Il faut seulement Python 3.8 ou plus récent.

```sh
python -m kalam examples/salam.klm   # exécuter un fichier .klm
python -m kalam                      # mode interactif (REPL), taper "amrug" pour sortir
python -m kalam --check fichier.klm  # vérifier sans exécuter (sortie JSON)
python -m unittest discover tests    # lancer les tests
```

Pour pouvoir lancer `kalam fichier.klm` depuis n'importe quel dossier :

```sh
python -m pip install -e .
```

## Extension VS Code

Le dossier [vscode-kalam/](vscode-kalam/) contient une extension qui apporte :

- la coloration syntaxique des fichiers `.klm` (mots-clés, fonctions, textes, commentaires) ;
- **les erreurs soulignées en rouge pendant la frappe** : erreurs de syntaxe, variables non définies,
  mauvais nombre d'arguments, `agif`/`fut` hors d'une boucle, `rajja` hors d'une fonction
  (réglage `kalam.verifier` pour désactiver) ;
- l'indentation automatique après `kan`, `tulma`, `kulla`, `khidime`, `walla` ;
- le pliage des blocs et `Ctrl+/` pour commenter ;
- des snippets : `kan`, `kanw`, `tulma`, `kulla`, `kullamin`, `khidime`, `khalli`, `ori` ;
- **F5** (ou le bouton ▶ en haut à droite) pour exécuter le fichier.

Installation : copier le dossier `vscode-kalam` dans `~/.vscode/extensions/salah-barkai.kalam-0.1.0`
puis recharger VS Code (`Ctrl+Shift+P` → « Developer: Reload Window »).

## Mots-clés

| Kalam | Sens | Équivalent |
|---|---|---|
| `khalli` | laisse / soit | `let` (déclarer une variable) |
| `kan` | si | `if` |
| `walla kan` | ou bien si | `elif` |
| `walla` | sinon | `else` |
| `khalas` | c'est fini | fin d'un bloc |
| `tulma` | tant que | `while` |
| `kulla … fi` | chaque … dans | `for … in` |
| `min … lahaddi` | de … jusqu'à | intervalle (inclusif) |
| `khidime` | travail (le mot tchadien pour « travail ») | `function` |
| `rajja` | rends | `return` |
| `agif` | arrête | `break` |
| `fut` | passe | `continue` |
| `sahi` / `ghalat` | vrai / faux | `true` / `false` |
| `mafi` | il n'y a rien | `null` |
| `wa` / `aw` / `ma` | et / ou / non | `and` / `or` / `not` |

Les accents sont facultatifs : `ôri`, `khalâs`, `kân` marchent comme `ori`, `khalas`, `kan`.
Les commentaires commencent par `#`.

## Fonctions intégrées

| Fonction | Rôle |
|---|---|
| `ori(a, b, ...)` | afficher (« montre ») |
| `asal("question")` | demander une saisie à l'utilisateur |
| `nimra(x)` | convertir en nombre |
| `kitaba(x)` | convertir en texte |
| `gadur(x)` | longueur d'un texte, d'une liste ou d'un dictionnaire |
| `shakal(x)` | type de la valeur (`nimra`, `kitaba`, `liste`, `dikt`, …) |
| `zid(liste, x)` | ajouter à une liste |
| `shil(liste)` / `shil(liste, i)` | retirer d'une liste |
| `mafatih(dikt)` | clés d'un dictionnaire |
| `rattib(liste)` | trier |
| `gassim(texte, sep)` / `lumm(liste, sep)` | découper / joindre |
| `kabir(t)` / `saghayyar(t)` | majuscules / minuscules |
| `sudfa(a, b)` | nombre aléatoire entre a et b |
| `jidir(x)` | racine carrée |

## Guide rapide

```
# Variables
khalli umur = 20
umur = umur + 1

# Conditions
kan umur >= 18 wa ma (umur > 60)
    ori("kabîr")
walla kan umur > 60
    ori("ajûz")
walla
    ori("saghayyar")
khalas

# Boucles
kulla i fi min 1 lahaddi 10
    ori(i)
khalas

khalli n = 3
tulma n > 0
    ori(n)
    n = n - 1
khalas

# Listes et dictionnaires
khalli khudar = ["bamya", "basal"]
zid(khudar, "tamatim")
khalli nafar = {usum: "Halime", hille: "Abéché"}
ori(nafar.usum, nafar["hille"], khudar[0])

# Fonctions (et fonctions anonymes)
khidime fi_nafsa(x)
    rajja x * x
khalas
khalli marratên = khidime(x) rajja x * 2 khalas
```

## Messages d'erreur

Les erreurs sont en arabe tchadien avec une traduction française :

```
Mushkila fi satir 3: 'z' da ma ligênah — sawwi 'khalli z = ...' awwal (variable non définie)
```

## Structure du projet

```
kalam/lexer.py        découpe le texte en jetons (mots-clés, nombres, textes…)
kalam/parser.py       construit l'arbre syntaxique
kalam/interpreter.py  exécute le programme
kalam/checker.py      trouve les erreurs sans exécuter (utilisé par VS Code)
kalam/__main__.py     ligne de commande et REPL
examples/             programmes d'exemple (.klm)
tests/                tests unitaires
```
