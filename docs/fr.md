# SNOTEL

Amène dans Gladys **l'enneigement mesuré par les stations SNOTEL** : environ 900 stations
automatiques de montagne du Natural Resources Conservation Service (NRCS) de l'USDA, dans
l'Ouest des États-Unis et en Alaska. Hauteur de neige, équivalent en eau de la neige, neige des
dernières 24 heures et température de l'air, toutes les heures, via l'API publique AWDB du NRCS.
Pas de compte, pas de clé.

> **Des valeurs horaires provisoires, pas une alerte avalanche ou crue.** Les données SNOTEL
> sont des mesures brutes que le NRCS vérifie plus tard ; elles peuvent être en retard,
> manquantes ou fausses, et l'intégration dépend de votre Gladys, de votre accès à Internet et
> d'un service public. Avant de partir en hors-piste, lisez le bulletin de votre centre
> d'avalanches. Cette intégration est non affiliée à l'USDA ni au NRCS.

## Ce que vous obtenez

- **Un appareil par station** suivie, avec ce que la station mesure : la **hauteur de neige**,
  l'**équivalent en eau** (l'eau que donnerait la neige en fondant), cette eau en **pourcentage
  de la médiane** de la date (1991-2020) quand le NRCS en a une, la **neige fraîche des
  dernières 24 heures**, la **température de l'air**, et la date de la dernière mesure.
- Les unités de votre choix : cm, mm et °C, ou pouces et °F comme les publie le NRCS.
- Une station qui n'envoie plus rien est signalée comme telle (« Pas de nouvelle mesure
  depuis… ») : une ancienne valeur n'est jamais renvoyée comme si elle était fraîche.
- Un **widget de tableau de bord** : vos stations avec leur hauteur de neige et la neige
  fraîche, ou le détail d'une station.
- Un bouton **« Chercher des stations »** qui liste les stations d'un État, par nom ou numéro,
  ou autour de votre maison, avec leur triplet, leur altitude et leur distance.
- Les scènes utilisent directement les fonctionnalités : « neige fraîche au-dessus de 20 cm »,
  c'est un jour de poudreuse.

## Prérequis

- Gladys Assistant **5.1.0** ou plus récent.
- Un accès à Internet depuis Gladys : l'intégration lit `wcc.sc.egov.usda.gov`.
- Pour « Autour de ma maison » : la position de votre maison dans Gladys (Paramètres, Maisons).
  L'intégration la demande à l'installation (permission « location »). Elle ne sert que dans le
  conteneur à trouver les stations les plus proches : jamais envoyée au NRCS, jamais stockée ni
  journalisée.
- SNOTEL couvre les montagnes de l'Ouest des États-Unis et l'Alaska. Une station d'un autre
  réseau du NRCS (SCAN, SNOLITE…) peut être suivie par son triplet : vous obtenez ce qu'elle
  mesure.

## Configuration

### Réglages

| Réglage                            | Ce qu'il fait                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Stations                           | Triplets (`1050:CA:SNTL`), numéros (`766`), adresses de pages du NRCS ou noms, séparés par des virgules. |
| Autour de ma maison                | Suit aussi les 3 stations SNOTEL les plus proches à 50, 100 ou 200 km de votre maison.                   |
| Unités                             | Métriques (cm, mm, °C) ou impériales (pouces, °F) pour les nouveaux appareils.                           |
| Langue des noms de fonctionnalités | Noms donnés aux fonctionnalités des nouveaux appareils, et langue de leurs textes.                       |

Au plus 20 stations sont suivies depuis les réglages. Enregistrez, puis ouvrez l'onglet
**Découverte** et créez les appareils voulus : une station dont l'appareil existe reste suivie
même si vous la retirez des réglages. Supprimer l'appareil arrête son suivi.

Un appareil garde les unités et les noms de sa création. Après un changement d'unités,
l'onglet Découverte propose de **mettre à jour** l'appareil ; d'ici là, ses valeurs restent dans
ses anciennes unités.

### Trouver vos stations

Le bouton **« Chercher des stations »** de la configuration liste jusqu'à 15 stations avec leur
triplet, leur État, leur altitude en pieds et en mètres et, si votre maison a une position, leur
distance :

- choisissez un **État** pour lister ses stations (les plus proches d'abord, sinon par ordre
  alphabétique) ;
- tapez un **nom** (Snowbird), un comté, un **numéro** de station (1050) ou un **triplet** ;
- laissez tout vide pour lister les stations autour de votre maison.

Copiez les triplets dans « Stations », puis enregistrez.

## Appareils

| Fonctionnalité                     | Type dans Gladys                | Unité        | Notes                                                              |
| ---------------------------------- | ------------------------------- | ------------ | ------------------------------------------------------------------ |
| Hauteur de neige                   | Capteur de niveau (profondeur)  | cm ou pouces | Capteur à ultrasons, horaire.                                      |
| Neige fraîche (24 h)               | Capteur de niveau (profondeur)  | cm ou pouces | Hauteur gagnée en 24 heures, voir plus bas.                        |
| Équivalent en eau de la neige      | Capteur de niveau (profondeur)  | mm ou pouces | Coussin à neige, horaire.                                          |
| Équivalent en eau, % de la médiane | Capteur de niveau (pourcentage) | %            | Valeur journalière de la veille face à la médiane de la date.      |
| Température de l'air               | Capteur de température          | °C ou °F     | Température observée, horaire.                                     |
| Dernière mesure                    | Texte                           |              | Date de la dernière mesure, ou « Pas de nouvelle mesure depuis… ». |

Une fonctionnalité n'existe que si la station la mesure. La **neige fraîche** est la hauteur de
neige actuelle moins la plus faible hauteur des 24 heures précédentes (chaque heure lissée avec
ses voisines, pour qu'une mesure aberrante du capteur ne compte pas) : la neige fraîche se
tasse, c'est donc une borne basse de ce qui est tombé. Le pourcentage de la médiane n'est donné
que si le NRCS publie une médiane pour la station : les stations récentes, en Alaska surtout,
n'en ont pas. En début de saison, une petite médiane donne de grands pourcentages.

Les valeurs sont rafraîchies toutes les heures dans le conteneur (les stations transmettent
chaque heure, parfois par paquets toutes les quelques heures). Après 12 heures sans nouvelle
mesure, les valeurs s'arrêtent et « Dernière mesure » dit depuis quand.

## Widget de tableau de bord

Ajoutez le widget **Enneigement SNOTEL** à un tableau de bord :

- sans réglage, il liste vos stations (10 au plus) : hauteur de neige et neige fraîche des 24
  heures ; une ligne passe en bleu avec une icône de neige quand il a neigé ;
- avec une station choisie, il affiche ses tuiles de hauteur de neige, de neige fraîche et
  d'équivalent en eau, puis le pourcentage de la médiane, la température de l'air et la
  dernière mesure.

Les noms sont ceux que vous avez donnés aux appareils dans Gladys.

## Exemples de scènes

- **Alerte poudreuse** : déclencheur « la valeur d'un appareil change », fonctionnalité « Neige
  fraîche (24 h) » de votre station préférée, au-dessus de 20 (cm) : envoyez-vous un message à
  6 h.
- **Manteau neigeux sous la normale** : fonctionnalité « Équivalent en eau, % de la médiane »
  sous 70 : un message pour prévoir l'eau de l'été.
- **Gel au départ du sentier** : fonctionnalité « Température de l'air » sous -15 °C.

## Sources des données, licence et quotas

- Données : le réseau SNOTEL du **Natural Resources Conservation Service de l'USDA**, lu via
  l'**API REST AWDB** publique (`wcc.sc.egov.usda.gov/awdbRestApi`). Données du gouvernement
  américain, dans le domaine public. Les valeurs horaires sont provisoires ; le NRCS les vérifie
  plus tard.
- Requêtes : au plus trois par heure pour toutes vos stations ensemble (valeurs horaires ; toutes
  les 6 heures les valeurs journalières et les médianes ; une fois par jour les métadonnées des
  stations), plus la liste des stations, une fois par semaine, si vous suivez des stations par
  nom ou autour de votre maison. L'API n'a pas de quota publié, mais son pare-feu refuse les
  rafales de requêtes (HTTP 403) : l'intégration réessaie alors simplement à l'heure suivante.
- Testée contre la vraie API le 12 novembre 2026 (stations de Californie, du Colorado, de
  l'Utah, de Washington et d'Alaska, une station sans capteur de neige et un triplet inconnu).

## Dépannage

- **« Station inconnue »** : vérifiez le triplet avec « Chercher des stations » ; une station
  inactive n'est pas dans la liste SNOTEL.
- **« Le service du NRCS (AWDB) ne répond pas »** : l'API est en panne ou refuse les requêtes un
  moment ; les mesures reviennent d'elles-mêmes.
- **Pas de hauteur de neige sur un appareil** : le capteur de la station n'envoie rien (en été,
  ou en panne) ; les autres valeurs continuent d'arriver.
- **Pas de pourcentage de la médiane** : le NRCS n'a pas de médiane pour cette station ou cette
  date.
- **Logs** : mettez `LOG_LEVEL=debug` pour voir chaque rafraîchissement. Au niveau par défaut,
  seuls le démarrage, les stations qui se taisent ou reviennent, et les erreurs sont journalisés.

## Limites

- Des données brutes et provisoires : pas une alerte avalanche, crue ou météo.
- La neige fraîche est calculée à partir de la hauteur de neige, pas mesurée : tassement, vent
  et bruit du capteur la rendent approximative.
- Cette intégration est non affiliée à l'USDA ni au NRCS. SNOTEL est un programme du NRCS de
  l'USDA.
