<p align="center"><img src="assets/logo.png" width="160" alt="Logo Kalam"></p>

# Kalam

**Kalam** est un langage de programmation en **arabe tchadien**, écrit en **lettres latines**.
Le but est que les Tchadiens puissent apprendre à programmer avec des mots qu'ils utilisent tous les jours.

<p align="center">
  <a href="https://salah-barkai.github.io/kalam/essayer.html"><b>▶ Essayer en ligne</b></a> ·
  <a href="https://salah-barkai.github.io/kalam/cours.html"><b>📘 Le cours complet</b></a> ·
  <a href="https://salah-barkai.github.io/kalam/kalam-cours.pdf"><b>Cours PDF</b></a> ·
  <a href="https://marketplace.visualstudio.com/items?itemName=salah-barkai.kalam"><b>Extension VS Code</b></a> ·
  <a href="https://github.com/salah-barkai/kalam/releases/latest"><b>kalam.exe</b></a>
</p>

```
khidime salam(usum)
    ori("Salam aleykum, " + usum + "!")
khalas

kulla usum fi ["Mahamat", "Fatime", "Abakar"]
    salam(usum)
khalas
```

## Installer Kalam

Kalam ne demande **rien d'autre** : pas de Python, pas de Node.js.

**Dans un terminal (Windows)** : téléchargez `kalam.exe` sur la
[page des versions](https://github.com/salah-barkai/kalam/releases/latest), puis une seule fois :

```sh
kalam.exe rakkib        # « installe » : kalam devient utilisable partout
```

Ensuite, dans n'importe quel nouveau terminal :

```sh
kalam salam.klm         # exécuter un fichier .klm
kalam                   # mode interactif, taper "amrug" pour sortir
kalam --check f.klm     # vérifier sans exécuter (sortie JSON)
```

**Dans VS Code** : cherchez **Kalam** dans l'onglet Extensions ([Marketplace](https://marketplace.visualstudio.com/items?itemName=salah-barkai.kalam)), ouvrez un fichier `.klm`
et appuyez sur F5. Kalam est entièrement inclus dans l'extension.

**Dans le navigateur** : le [terrain de jeu](https://salah-barkai.github.io/kalam/essayer.html).

## Extension VS Code

Le dossier [vscode-kalam/](vscode-kalam/) contient une extension qui apporte :

- la coloration syntaxique des fichiers `.klm` (mots-clés, fonctions, textes, commentaires) ;
- **les erreurs soulignées en rouge pendant la frappe** : erreurs de syntaxe, variables non définies,
  mauvais nombre d'arguments, `agif`/`fut` hors d'une boucle, `rajja` hors d'une fonction
  (réglage `kalam.verifier` pour désactiver) ;
- **l'autocomplétion** des mots-clés, des fonctions et des noms définis dans le fichier ;
- **l'aide au survol** en français : passez la souris sur un mot pour voir son sens et un exemple ;
- **l'aide aux paramètres** : en tapant `fattish(`, VS Code montre `fattish(fên, shunu)` ;
- l'indentation automatique après `kan`, `tulma`, `kulla`, `khidime`, `walla`, `jarrib`, `mushkila` ;
- le pliage des blocs et `Ctrl+/` pour commenter ;
- des snippets : `kan`, `kanw`, `tulma`, `kulla`, `kullamin`, `khidime`, `jarrib`, `jib`, `khalli`, `ori` ;
- **F5** (ou le bouton ▶ en haut à droite) pour exécuter le fichier dans un terminal Kalam intégré :
  les questions (`asal`) se répondent dedans, `Ctrl+C` arrête le programme.

Installation : dans VS Code, onglet **Extensions** (`Ctrl+Shift+X`), cherchez **Kalam** et cliquez sur *Install*
([page du Marketplace](https://marketplace.visualstudio.com/items?itemName=salah-barkai.kalam)).

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
| `x fi liste` | x est dans la liste | `in` |
| `jarrib … mushkila m … khalas` | essaie … en cas de problème | `try … catch` |
| `zagil` | jette | `throw` |
| `jib "fichier"` | apporte | `import` |

Raccourcis : `x += 1`, `x -= 1`, `x *= 2`, `x /= 2`.

Les accents sont facultatifs : `ôri`, `khalâs`, `kân` marchent comme `ori`, `khalas`, `kan`.
Les commentaires commencent par `#`.

## Fonctions intégrées

**De base**

| Fonction | Rôle |
|---|---|
| `ori(a, b, ...)` | afficher (« montre ») |
| `asal("sual")` | demander une saisie à l'utilisateur |
| `nimra(x)` / `kitaba(x)` | convertir en nombre / en texte |
| `gadur(x)` | longueur d'un texte, d'une liste ou d'un dikt |
| `shakal(x)` | type de la valeur (`nimra`, `kitaba`, `liste`, `dikt`, …) |

**Nombres**

| Fonction | Rôle |
|---|---|
| `aktar(...)` / `agall(...)` | le plus grand / le plus petit (« plus » / « moins ») |
| `jumla(liste)` | somme (« le total ») |
| `garrib(x, arkam)` | arrondir (« rapprocher ») |
| `mutlag(x)` | valeur absolue |
| `jidir(x)` | racine carrée (« la racine ») |
| `PI` | 3.14159… |
| `sudfa(a, b)` | nombre au hasard entre a et b |

**Listes et dikt**

| Fonction | Rôle |
|---|---|
| `zid(liste, x)` / `shil(liste, i)` | ajouter / retirer (« ajoute » / « enlève ») |
| `rattib(liste)` / `gallib(x)` | trier (« range ») / inverser (« retourne ») |
| `azil(liste)` / `khalbit(liste)` | choisir au hasard (« choisis ») / mélanger |
| `mafatih(dikt)` / `giyam(dikt)` | clés / valeurs |
| `nuskha(x)` | copie |

**Textes**

| Fonction | Rôle |
|---|---|
| `fattish(fên, shunu)` | position de `shunu`, ou -1 (« cherche ») |
| `ghayyir(t, gadîm, jadîd)` | remplacer (« change ») |
| `gata(x, a, b)` | couper un morceau (« coupe ») |
| `gassim(t, fasil)` / `lumm(liste, fasil)` | découper (« partage ») / joindre (« rassemble ») |
| `naddif(t)` | enlever les espaces autour (« nettoie ») |
| `bada_be(t, x)` / `kammal_be(t, x)` | commence par / finit par |
| `kabir(t)` / `saghayyar(t)` | MAJUSCULES / minuscules |

**Temps et fichiers**

| Fonction | Rôle |
|---|---|
| `al_yom()` / `as_sa()` | date du jour / heure |
| `wakit()` / `agod(s)` | secondes actuelles / attendre (« assieds-toi ») |
| `agri(file)` | lire un fichier (« lis ») |
| `aktib(file, t)` / `aktib(file, t, sahi)` | écrire / ajouter à la fin (« écris ») |

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

# Erreurs : jarrib (essaie) … mushkila (problème)
khidime gassim_be(a, b)
    kan b == 0
        zagil "ma tagdar tigassim be sifir!"
    khalas
    rajja a / b
khalas

jarrib
    ori(gassim_be(10, 0))
mushkila m
    ori("Mushkila:", m)
khalas

# Appartenance et raccourcis
kan "bamya" fi khudar
    ori("indina bamya")
khalas
umur += 1
```

## Exemples

| Fichier | Contenu |
|---|---|
| [salam.klm](examples/salam.klm) | premier programme |
| [jawla.klm](examples/jawla.klm) | tour du langage : boucles, listes, fonctions |
| [khammin.klm](examples/khammin.klm) | jeu « devine le nombre » |
| [imtihan.klm](examples/imtihan.klm) | quiz sur le Tchad |
| [dukkan.klm](examples/dukkan.klm) | gestion d'une boutique : stock, ventes, erreurs, facture dans un fichier |
| [adawat.klm](examples/adawat.klm) | petites fonctions utiles, importées avec `jib "adawat"` |

## Messages d'erreur

Les erreurs sont en arabe tchadien avec une traduction française :

```
Mushkila fi satir 3: 'z' da ma ligênah — sawwi 'khalli z = ...' awwal (variable non définie)
```

## Structure du projet

```
src/kalam.js          tout le langage : lexer, parser, interpréteur, vérificateur
                      (le même fichier tourne dans kalam.exe, VS Code et le navigateur)
src/cli.js            ligne de commande et mode interactif
vscode-kalam/         extension VS Code
docs/cours.md         le cours complet (source du PDF)
examples/             programmes d'exemple (.klm)
test/                 tests (npm test)
tools/build-exe.js    fabrique dist/kalam.exe (Node.js « Single Executable Application »)
tools/build-site.js   construit le site, le terrain de jeu et le cours PDF
tools/deploy-pages.js publie le site sur GitHub Pages (branche gh-pages)
tools/ci/site.yml     workflow GitHub Actions (tests + déploiement automatique), à activer
```

## Développer Kalam

Pour **modifier** Kalam (pas pour l'utiliser), il faut Node.js 18 ou plus récent :

```sh
npm install                 # outils de construction
npm test                    # tests : langage, vérificateur, 103 programmes du cours, ligne de commande
node src/cli.js salam.klm   # lancer Kalam sans fabriquer l'exécutable
npm run build:exe           # dist/kalam.exe
npm run build:vsix          # vscode-kalam/kalam-<version>.vsix
npm run build:site          # site/ + site/kalam-cours.pdf (Chrome ou Edge requis pour le PDF)
npm run deploy:site         # publie site/ sur https://salah-barkai.github.io/kalam/
```

Limite connue : les nombres entiers sont exacts jusqu'à 9 007 199 254 740 991 (2^53) ;
au-delà, ils sont arrondis.

Pour activer le déploiement automatique à chaque `git push`, donnez à `gh` le droit
de modifier les workflows, puis déplacez le fichier :

```sh
gh auth refresh -h github.com -s workflow
git mv tools/ci/site.yml .github/workflows/site.yml
```

Puis, dans les réglages du dépôt GitHub (Settings → Pages), choisir la source « GitHub Actions ».
