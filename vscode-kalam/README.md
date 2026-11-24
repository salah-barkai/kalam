# Kalam — programmer en arabe tchadien

**Kalam** est un langage de programmation dont les mots-clés sont en **arabe tchadien**, écrit en **lettres latines**.
Il est fait pour apprendre à programmer avec les mots de tous les jours.

```
khidime salam(usum)
    ori("Salam aleykum, " + usum + "!")
khalas

kulla usum fi ["Mahamat", "Fatime", "Abakar"]
    salam(usum)
khalas
```

## Ce que fait l'extension

- **Couleurs** pour les fichiers `.klm`
- **Erreurs soulignées en rouge** pendant la frappe, avec des messages en tchadien et en français :
  `'y' da ma ligênah — sawwi 'khalli y = ...' awwal (variable non définie)`
- **Autocomplétion** des mots-clés, des fonctions et de vos propres variables
- **Aide au survol** : passez la souris sur un mot pour voir son sens et un exemple
- **Aide aux paramètres** quand vous tapez une fonction
- **Snippets** : tapez `kan`, `kulla`, `khidime`, `jarrib`… puis `Tab`
- **F5** (ou le bouton ▶) pour exécuter le fichier

## Pour commencer

1. Créez un fichier `salam.klm` et écrivez :
   ```
   ori("Salam aleykum!")
   ```
2. Appuyez sur **F5** : le programme s'exécute dans un terminal Kalam.

C'est tout : Kalam est **entièrement inclus** dans l'extension, il n'y a rien d'autre à installer.
Quand un programme pose une question (`asal`), tapez la réponse dans le terminal.
`Ctrl+C` arrête un programme qui tourne trop longtemps.

Pour utiliser Kalam **hors de VS Code** (dans un terminal : `kalam salam.klm`), téléchargez
`kalam.exe` sur la [page des versions](https://github.com/salah-barkai/kalam/releases/latest).

## Apprendre Kalam

- 📘 **Le cours complet, de A à Z** (20 chapitres, 4 projets, exercices corrigés) :
  [lire en ligne](https://salah-barkai.github.io/kalam/cours.html) ou
  [télécharger le PDF](https://salah-barkai.github.io/kalam/kalam-cours.pdf)
- ▶ **Essayer sans rien installer** : [le terrain de jeu en ligne](https://salah-barkai.github.io/kalam/essayer.html)
- 💻 **Code source** : [github.com/salah-barkai/kalam](https://github.com/salah-barkai/kalam)

## Les mots de Kalam

| Kalam | Sens | | Kalam | Sens |
|---|---|---|---|---|
| `khalli` | déclarer une variable | | `jarrib` | essayer |
| `kan` | si | | `mushkila` | en cas d'erreur |
| `walla` | sinon | | `zagil` | lancer une erreur |
| `khalas` | fin du bloc | | `jib` | importer un fichier |
| `tulma` | tant que | | `sahi` / `ghalat` | vrai / faux |
| `kulla … fi` | pour chaque … dans | | `mafi` | rien |
| `min … lahaddi` | de … jusqu'à | | `wa` / `aw` / `ma` | et / ou / non |
| `khidime` | fonction | | `agif` / `fut` | arrêter / passer |
| `rajja` | renvoyer | | | |

Fonctions utiles : `ori` (afficher), `asal` (demander), `gadur` (longueur), `zid` (ajouter),
`rattib` (trier), `jumla` (somme), `sudfa` (hasard), `fattish` (chercher), `ghayyir` (remplacer),
`al_yom` (date), `agri` / `aktib` (lire / écrire un fichier)… Survolez-les dans l'éditeur pour voir leur aide.

## Réglages

| Réglage | Rôle |
|---|---|
| `kalam.verifier` | souligner les erreurs pendant la frappe (par défaut activé) |

## Exemple : une petite boutique

```
khalli dukkan = {sukkar: 750, shay: 250}

khidime bi'(haja, kammiye)
    kan ma haja fi dukkan
        zagil haja + " ma indina"
    khalas
    rajja dukkan[haja] * kammiye
khalas

jarrib
    ori("Sukkar:", bi'("sukkar", 2), "FCFA")
    ori("Laban:", bi'("laban", 1), "FCFA")
mushkila m
    ori("Mushkila:", m)
khalas
```
