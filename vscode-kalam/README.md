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

1. Installez [Python](https://www.python.org/downloads/) 3.8 ou plus récent (cochez « Add Python to PATH »).
2. Créez un fichier `salam.klm` et écrivez :
   ```
   ori("Salam aleykum!")
   ```
3. Appuyez sur **F5**.

L'interpréteur Kalam est déjà inclus dans l'extension, il n'y a rien d'autre à installer.

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
| `kalam.python` | commande Python à utiliser (par défaut `python`) |
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
