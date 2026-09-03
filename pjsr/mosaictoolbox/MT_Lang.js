// SPDX-License-Identifier: CC-BY-NC-4.0
// ----------------------------------------------------------------------------
// MT_Lang.js - MosaicToolbox
//
// Translation layer.
//
// Keys are the English strings themselves, so an entry that is missing from the
// catalogue simply shows in English rather than as a placeholder or an error.
// Long passages - the tooltips, which are the script's real documentation - use
// a short symbolic key instead and carry both languages in the catalogue, since
// embedding a paragraph of HTML as a lookup key would be unmaintainable.
//
// Every format string keeps its placeholders in the same order in both
// languages, so format() can be applied to whichever one is returned.
// ----------------------------------------------------------------------------

/** @returns {Object[]} The languages offered, in menu order. */
function MT_LANGUAGES()
{
   return [ { code: "en", label: "English" },
            { code: "fr", label: "Français" } ];
}

/** @type String Active language code. Set from the settings before the UI is built. */
var MT_LANG = "en";

/** @type Object Lazily built catalogue. */
var MT_CATALOGUE = null;

/**
 * @param {String} code "en" or "fr"
 */
function mtSetLanguage( code )
{
   MT_LANG = (code === "fr") ? "fr" : "en";
}

/** @returns {String} */
function mtLanguage()
{
   return MT_LANG;
}

/**
 * Translates one string.
 *
 * @param {String} key The English text, or a symbolic key for long passages.
 * @returns {String} The active language's text; English, or the key itself, when
 *          there is nothing better to return.
 */
function mtT( key )
{
   let entry = mtCatalogue()[key];
   if ( entry === undefined )
      return key;
   if ( MT_LANG !== "en" && entry[MT_LANG] !== undefined )
      return entry[MT_LANG];
   return (entry.en !== undefined) ? entry.en : key;
}

// ----------------------------------------------------------------------------

/**
 * @returns {Object} key -> { en?, fr }
 */
function mtCatalogue()
{
   if ( MT_CATALOGUE !== null )
      return MT_CATALOGUE;

   MT_CATALOGUE = {

   // =========================================================================
   // Dialog - section bars and short controls
   // =========================================================================
   "Language:":                       { fr: "Langue :" },
   "Channels":                        { fr: "Canaux" },
   "Images":                          { fr: "Images" },
   "Tile preparation":                { fr: "Préparation des tuiles" },
   "Common mosaic grid":              { fr: "Grille commune de la mosaïque" },
   "Photometric join":                { fr: "Jonction photométrique" },
   "Output":                          { fr: "Sortie" },

   "Other channels:":                 { fr: "Autres canaux :" },
   "Rescan windows":                  { fr: "Réanalyser les fenêtres" },
   "Renumber tiles":                  { fr: "Renuméroter les tuiles" },
   "Remove selected":                 { fr: "Retirer la sélection" },
   "Set channel:":                    { fr: "Attribuer le canal :" },
   "Set tile:":                       { fr: "Attribuer la tuile :" },
   "Apply":                           { fr: "Appliquer" },
   "Edge trim:":                      { fr: "Érosion des bords :" },
   "Interpolation:":                  { fr: "Interpolation :" },
   "Clamping:":                       { fr: "Écrêtage :" },
   "arcsec/px:":                      { fr: "arcsec/px :" },
   "degrees:":                        { fr: "degrés :" },
   "RA (deg):":                       { fr: "AD (deg) :" },
   "Dec (deg):":                      { fr: "Déc (deg) :" },
   "Overlay":                         { fr: "Superposition" },
   "Random":                          { fr: "Aléatoire" },
   "Average":                         { fr: "Moyenne" },
   "Join mode:":                      { fr: "Mode de jonction :" },
   "Blend band:":                     { fr: "Bande de fondu :" },
   "Join order:":                     { fr: "Ordre de jonction :" },
   "Star detection:":                 { fr: "Détection d'étoiles :" },
   "Sample size:":                    { fr: "Taille d'échantillon :" },
   "Star rejection:":                 { fr: "Rejet des étoiles :" },
   "Smoothness:":                     { fr: "Lissage :" },
   "Auto taper":                      { fr: "Estompage automatique" },
   "Output prefix:":                  { fr: "Préfixe de sortie :" },
   "Autocrop to the area all channels cover":
      { fr: "Rogner automatiquement à la zone couverte par tous les canaux" },
   "Auto-stretch the result":         { fr: "Étirement automatique du résultat" },
   "Keep intermediate windows":       { fr: "Conserver les fenêtres intermédiaires" },
   "Rebuild astrometric solution":    { fr: "Reconstruire la solution astrométrique" },
   "Check plan":                      { fr: "Vérifier le plan" },
   "Run":                             { fr: "Exécuter" },
   "Cancel":                          { fr: "Annuler" },

   "Auto":                                  { fr: "Automatique" },
   "Rows first, then join the rows":        { fr: "Les rangées d'abord, puis joindre les rangées" },
   "Columns first, then join the columns":  { fr: "Les colonnes d'abord, puis joindre les colonnes" },

   // Interpolation algorithms and sky projections (combo items). Proper names -
   // Lanczos, Mitchell-Netravali, Mercator, Hammer-Aitoff - are left alone.
   "Bicubic spline":       { fr: "Spline bicubique" },
   "Bicubic B-spline":     { fr: "B-spline bicubique" },
   "Catmull-Rom spline":   { fr: "Spline Catmull-Rom" },
   "Bilinear":             { fr: "Bilinéaire" },
   "Nearest neighbour":    { fr: "Plus proche voisin" },
   "Gnomonic":             { fr: "Gnomonique" },
   "Stereographic":        { fr: "Stéréographique" },
   "Plate-carree":         { fr: "Plate-carrée" },
   "Zenithal equal area":  { fr: "Zénithale équivalente" },
   "Orthographic":         { fr: "Orthographique" },

   "Auto resolution":   { fr: "Résolution auto" },
   "Auto rotation":     { fr: "Rotation auto" },
   "Auto centre":       { fr: "Centre auto" },
   "Auto projection":   { fr: "Projection auto" },
   "Auto dimensions":   { fr: "Dimensions auto" },

   // Tree headers
   "Window":     { fr: "Fenêtre" },
   "Channel":    { fr: "Canal" },
   "Tile":       { fr: "Tuile" },
   "FILTER":     { fr: "FILTER" },
   "RA":         { fr: "AD" },
   "Dec":        { fr: "Déc" },
   "arcsec/px":  { fr: "arcsec/px" },
   "unsolved":   { fr: "non résolue" },
   "(none)":     { fr: "(aucun)" },

   // Channel labels
   "L  (Luminance)": { fr: "L  (Luminance)" },
   "R  (Red)":       { fr: "R  (Rouge)" },
   "G  (Green)":     { fr: "G  (Vert)" },
   "B  (Blue)":      { fr: "B  (Bleu)" },
   "S  (SII)":       { fr: "S  (SII)" },
   "H  (Ha)":        { fr: "H  (Ha)" },
   "O  (OIII)":      { fr: "O  (OIII)" },
   "  (custom)":     { fr: "  (personnalisé)" },

   // =========================================================================
   // Dialog - long passages
   // =========================================================================
   "ui.tagline":
   {
      en: "Multi-filter mosaic assembly onto one common grid.",
      fr: "Assemblage de mosaïques multi-filtres sur une grille commune."
   },

   "ui.header":
   {
      en: "<p>Every selected tile of every selected channel is reprojected onto <i>one</i> " +
          "astrometric grid, its soft edges are eroded, and the tiles are joined " +
          "photometrically, rows first and then columns. All channels therefore share " +
          "identical coordinates, field of view and dimensions.</p>" +
          "<p>Inputs must be <i>linear</i>, <i>plate solved</i>, and <i>already corrected for " +
          "gradients</i> (DBE, ABE, GraXpert, YAGEx, or NormalizeScaleGradient during " +
          "preprocessing). " +
          "The join matches the tiles to each other; it cannot remove a gradient they share, and " +
          "an uncorrected one in a single tile is carried into the mosaic.</p>" +
          "<p>Nothing else is needed: registration, edge trimming and the join are all done here.</p>",
      fr: "<p>Chaque tuile sélectionnée de chaque canal sélectionné est reprojetée sur " +
          "<i>une seule</i> grille astrométrique, ses bords incomplets sont érodés, puis les " +
          "tuiles sont jointes photométriquement, les rangées d'abord puis les colonnes. " +
          "Tous les canaux partagent donc des coordonnées, un champ et des dimensions " +
          "identiques.</p>" +
          "<p>Les images doivent être <i>linéaires</i>, <i>résolues astrométriquement</i> et " +
          "<i>déjà corrigées de leurs gradients</i> (DBE, ABE, GraXpert, YAGEx ou " +
          "NormalizeScaleGradient au prétraitement). La jonction ajuste les tuiles les unes " +
          "aux autres : elle ne peut pas retirer un gradient qu'elles partagent, et un gradient " +
          "non corrigé dans une seule tuile est reporté dans la mosaïque.</p>" +
          "<p>Rien d'autre n'est nécessaire : l'enregistrement, l'érosion des bords et la " +
          "jonction sont tous réalisés ici.</p>"
   },

   "tip.language":
   {
      en: "<p>Interface language. Changing it reopens the dialog; your image table and settings " +
          "are kept.</p>",
      fr: "<p>Langue de l'interface. Un changement réouvre la fenêtre ; votre tableau " +
          "d'images et vos réglages sont conservés.</p>"
   },

   "tip.filter":
   {
      en: "<p>Assemble the <b>%LABEL%</b> channel. Output: <i>%ID%</i></p>",
      fr: "<p>Assembler le canal <b>%LABEL%</b>. Sortie : <i>%ID%</i></p>"
   },

   "tip.custom":
   {
      en: "<p>Name up to %N% extra channels, for example <i>NIR</i> or <i>Ha3nm</i>. A named " +
          "channel appears in the table's channel selector and produces <i>%PREFIX%&lt;name&gt;</i>.</p>",
      fr: "<p>Nommez jusqu'à %N% canaux supplémentaires, par exemple <i>NIR</i> ou " +
          "<i>Ha3nm</i>. Un canal nommé apparaît dans le sélecteur de canal du tableau et " +
          "produit <i>%PREFIX%&lt;nom&gt;</i>.</p>"
   },

   "tip.tree":
   {
      en: "<p>One row per plate-solved image. <b>Channel</b> comes from the FILTER keyword and " +
          "<b>Tile</b> from the sky coordinates; correct either with the controls below.</p>" +
          "<p>Images sharing a tile number must cover the same patch of sky. Unticked rows and " +
          "rows whose channel is switched off are ignored.</p>" +
          "<p>Tiles are grouped automatically when their centres fall within 15% of a frame of " +
          "each other. If your pointing varied more than that between filters, or your tiles " +
          "overlap by more than about 85%, fix the numbers with <b>Set tile</b>.</p>",
      fr: "<p>Une ligne par image résolue astrométriquement. <b>Canal</b> provient du mot-clé " +
          "FILTER et <b>Tuile</b> des coordonnées célestes ; corrigez l'un ou l'autre avec les " +
          "contrôles ci-dessous.</p>" +
          "<p>Les images portant le même numéro de tuile doivent couvrir la même portion de " +
          "ciel. Les lignes décochées et celles dont le canal est désactivé sont ignorées.</p>" +
          "<p>Les tuiles sont regroupées automatiquement lorsque leurs centres se trouvent à " +
          "moins de 15 % d'un champ l'un de l'autre. Si votre pointage a varié davantage entre " +
          "filtres, ou si vos tuiles se recouvrent à plus de 85 % environ, corrigez les numéros " +
          "avec <b>Attribuer la tuile</b>.</p>"
   },

   "tip.rescan":
   {
      en: "<p>Rebuild the table from the images currently open, re-reading their FILTER keywords " +
          "and astrometric solutions. Manual channel and tile edits are lost.</p>",
      fr: "<p>Reconstruire le tableau à partir des images actuellement ouvertes, en relisant " +
          "leurs mots-clés FILTER et leurs solutions astrométriques. Les modifications " +
          "manuelles de canal et de tuile sont perdues.</p>"
   },
   "tip.renumber":
   {
      en: "<p>Re-derive the tile numbers from the sky coordinates, leaving the channel " +
          "assignments untouched.</p>",
      fr: "<p>Recalculer les numéros de tuile à partir des coordonnées célestes, sans " +
          "toucher aux canaux attribués.</p>"
   },
   "tip.remove":
   {
      en: "<p>Drop the selected rows from the table.</p>",
      fr: "<p>Retirer du tableau les lignes sélectionnées.</p>"
   },
   "tip.setChannel":
   {
      en: "<p>Channel to assign to the selected rows.</p>",
      fr: "<p>Canal à attribuer aux lignes sélectionnées.</p>"
   },
   "tip.applyChannel":
   {
      en: "<p>Assign the channel above to every selected row.</p>",
      fr: "<p>Attribuer le canal ci-dessus à chaque ligne sélectionnée.</p>"
   },
   "tip.setTile":
   {
      en: "<p>Tile number to assign to the selected rows. Images that cover the same patch of " +
          "sky must carry the same number.</p>",
      fr: "<p>Numéro de tuile à attribuer aux lignes sélectionnées. Les images couvrant la " +
          "même portion de ciel doivent porter le même numéro.</p>"
   },
   "tip.applyTile":
   {
      en: "<p>Assign the tile number above to every selected row.</p>",
      fr: "<p>Attribuer le numéro de tuile ci-dessus à chaque ligne sélectionnée.</p>"
   },

   "tip.trim":
   {
      en: "<p>Pixels eroded from the outline of every reprojected tile. Reprojection and " +
          "integration both leave partially covered pixels around the edge; if they survive they " +
          "show up as fine lines along the joins.</p><p>5 is a good starting point. 0 disables " +
          "trimming.</p>",
      fr: "<p>Pixels érodés sur le contour de chaque tuile reprojetée. La reprojection comme " +
          "l'intégration laissent des pixels partiellement couverts sur le bord ; s'ils " +
          "subsistent, ils apparaissent en fines lignes le long des jonctions.</p>" +
          "<p>5 est un bon point de départ. 0 désactive l'érosion.</p>"
   },
   "tip.interpolation":
   {
      en: "<p>Pixel interpolation used when reprojecting a tile onto the common grid. <i>Auto</i> " +
          "picks an algorithm from the scaling ratio and is right in nearly every case.</p>",
      fr: "<p>Interpolation utilisée pour reprojeter une tuile sur la grille commune. " +
          "<i>Automatique</i> choisit l'algorithme selon le rapport d'échelle et convient dans " +
          "presque tous les cas.</p>"
   },
   "tip.clamping":
   {
      en: "<p>Linear clamping threshold for the interpolation algorithms that support it. 0.3 is " +
          "the standard value.</p>",
      fr: "<p>Seuil d'écrêtage linéaire pour les algorithmes d'interpolation qui le " +
          "prennent en charge. 0,3 est la valeur habituelle.</p>"
   },

   "tip.autoResolution":
   {
      en: "<p>Automatic: the finest image scale found among all tiles, so nothing is downsampled.</p>",
      fr: "<p>Automatique : la plus fine échelle trouvée parmi toutes les tuiles, afin que " +
          "rien ne soit sous-échantillonné.</p>"
   },
   "tip.autoRotation":
   {
      en: "<p>Automatic: the rotation of the first tile, so the mosaic keeps the orientation of " +
          "your data.</p>",
      fr: "<p>Automatique : la rotation de la première tuile, afin que la mosaïque conserve " +
          "l'orientation de vos données.</p>"
   },
   "tip.autoCentre":
   {
      en: "<p>Automatic: iteratively optimised so the mosaic is centred on the union of the tiles.</p>",
      fr: "<p>Automatique : optimisé itérativement pour centrer la mosaïque sur la réunion " +
          "des tuiles.</p>"
   },
   "tip.autoProjection":
   {
      en: "<p>Automatic: gnomonic below 10 degrees of field, then Mercator, stereographic and " +
          "Hammer-Aitoff as the field grows.</p>",
      fr: "<p>Automatique : gnomonique en dessous de 10 degrés de champ, puis Mercator, " +
          "stéréographique et Hammer-Aitoff à mesure que le champ s'agrandit.</p>"
   },
   "tip.autoDimensions":
   {
      en: "<p>Automatic: the smallest canvas that holds every tile.</p>",
      fr: "<p>Automatique : la plus petite toile contenant toutes les tuiles.</p>"
   },

   "tip.overlay":
   {
      en: "<p>The reference is used up to the join line and the corrected target after it. A hard " +
          "cut, which is what you want once the gradient has been matched. The normal choice.</p>",
      fr: "<p>La référence est utilisée jusqu'à la ligne de jonction, puis la cible " +
          "corrigée au-delà. Une coupure nette, ce que l'on veut une fois le gradient ajusté. " +
          "Le choix habituel.</p>"
   },
   "tip.random":
   {
      en: "<p>Pixels in the blend band are taken at random from either image. Breaks up the seam " +
          "without softening stars.</p>",
      fr: "<p>Les pixels de la bande de fondu sont pris aléatoirement dans l'une ou l'autre " +
          "image. Casse la couture sans adoucir les étoiles.</p>"
   },
   "tip.averageMode":
   {
      en: "<p>The blend band is the mean of both images. Lowest noise, but any registration error " +
          "shows as doubled stars.</p>",
      fr: "<p>La bande de fondu est la moyenne des deux images. Bruit minimal, mais toute erreur " +
          "d'enregistrement se traduit par des étoiles dédoublées.</p>"
   },
   "tip.blendBand":
   {
      en: "<p>Width of the blend band, as a percentage of the overlap thickness. Used by Random " +
          "and Average only.</p>",
      fr: "<p>Largeur de la bande de fondu, en pourcentage de l'épaisseur du recouvrement. " +
          "Utilisée uniquement par Aléatoire et Moyenne.</p>"
   },
   "tip.joinOrder":
   {
      en: "<p>Tiles are joined two at a time. Building strips first and then joining the strips " +
          "gives each join the most overlap to measure. <i>Auto</i> picks whichever axis produces " +
          "the fewer, longer strips.</p>",
      fr: "<p>Les tuiles sont jointes deux à deux. Construire d'abord des bandes puis joindre " +
          "ces bandes donne à chaque jonction le plus grand recouvrement à mesurer. " +
          "<i>Automatique</i> choisit l'axe produisant les bandes les moins nombreuses et les " +
          "plus longues.</p>"
   },
   "tip.starDetection":
   {
      en: "<p>Log sensitivity of the star detector, used for both the photometric scale and for " +
          "keeping stars out of the gradient samples. Lower finds fainter stars. -1 is the " +
          "PixInsight default and suits most data; raise it towards 0 on a very rich field, lower " +
          "it if a sparse overlap yields too few stars.</p>",
      fr: "<p>Sensibilité logarithmique du détecteur d'étoiles, utilisée à la fois pour " +
          "le facteur d'échelle photométrique et pour exclure les étoiles des échantillons " +
          "de gradient. Plus bas détecte des étoiles plus faibles. -1 est la valeur par défaut " +
          "de PixInsight et convient à la plupart des données ; augmentez vers 0 sur un champ " +
          "très riche, diminuez si un recouvrement pauvre fournit trop peu d'étoiles.</p>"
   },
   "tip.sampleSize":
   {
      en: "<p>Side of the square samples the gradient is measured on. Large enough to average " +
          "down the noise, small enough to follow the gradient: 20-30 px suits most data. Reduced " +
          "automatically for one join if the overlap is too thin to fit six squares across it.</p>",
      fr: "<p>Côté des carrés sur lesquels le gradient est mesuré. Assez grand pour " +
          "moyenner le bruit, assez petit pour suivre le gradient : 20 à 30 px conviennent à la " +
          "plupart des données. Réduit automatiquement pour une jonction donnée si le " +
          "recouvrement est trop mince pour y loger six carrés.</p>"
   },
   "tip.starRejection":
   {
      en: "<p>A sample square is thrown away if it comes within this many star radii of a " +
          "detected star. Raise it if bright haloes are leaking into the gradient model; lower it " +
          "if a dense field leaves too few samples.</p>",
      fr: "<p>Un carré d'échantillon est écarté s'il s'approche d'une étoile détectée " +
          "à moins de ce nombre de rayons stellaires. Augmentez si des halos brillants " +
          "contaminent le modèle de gradient ; diminuez si un champ dense laisse trop peu " +
          "d'échantillons.</p>"
   },
   "tip.smoothness":
   {
      en: "<p>How closely the gradient model follows the samples, as a log10 value.</p>" +
          "<p>The residuals are normalised before fitting, so this means the same thing on every " +
          "data set: <b>0</b> lets the fit deviate from the samples by about one robust sigma of " +
          "their scatter - it smooths through the noise but follows real structure. Lower hugs " +
          "the samples more closely and risks absorbing nebulosity into the model; higher gives a " +
          "stiffer surface that may leave a residual gradient at the join.</p>",
      fr: "<p>Fidélité du modèle de gradient aux échantillons, en valeur log10.</p>" +
          "<p>Les résidus sont normalisés avant l'ajustement : ce réglage a donc le même " +
          "sens sur tous les jeux de données. <b>0</b> autorise l'ajustement à s'écarter des " +
          "échantillons d'environ un sigma robuste de leur dispersion : il lisse le bruit mais " +
          "suit les structures réelles. Plus bas colle davantage aux échantillons et risque " +
          "d'absorber la nébulosité dans le modèle ; plus haut donne une surface plus rigide " +
          "qui peut laisser un gradient résiduel à la jonction.</p>"
   },
   "tip.taper":
   {
      en: "<p>Beyond the overlap there is nothing left to measure, so the correction is held at " +
          "its value along the overlap edge and then faded into a plain constant offset over the " +
          "taper distance. Automatic uses twice the overlap thickness.</p>",
      fr: "<p>Au-delà du recouvrement il n'y a plus rien à mesurer : la correction est donc " +
          "maintenue à sa valeur le long du bord du recouvrement, puis estompée vers un simple " +
          "décalage constant sur la distance d'estompage. Le mode automatique utilise le double " +
          "de l'épaisseur du recouvrement.</p>"
   },

   "tip.prefix":
   {
      en: "<p>The channel key is appended to this: <i>Mosaic</i> gives MosaicL, MosaicR, MosaicG, " +
          "MosaicB, MosaicS, MosaicH, MosaicO.</p>",
      fr: "<p>La clé du canal est ajoutée à ce préfixe : <i>Mosaic</i> donne MosaicL, " +
          "MosaicR, MosaicG, MosaicB, MosaicS, MosaicH, MosaicO.</p>"
   },
   "tip.autocrop":
   {
      en: "<p>Crop every mosaic to the largest rectangle in which <i>all</i> the channels hold " +
          "data everywhere: no empty border, no black wedges in the corners, no ragged edge left " +
          "to trim by hand.</p>" +
          "<p>The rectangle is worked out once from all the finished channels together and then " +
          "applied to every one of them, so the outputs keep identical coordinates, field of view " +
          "and dimensions. Cropping each channel to its own data would undo exactly the guarantee " +
          "the common grid exists to provide.</p>" +
          "<p>The sky outside that rectangle is discarded, and the astrometric solution is " +
          "carried through the crop.</p>",
      fr: "<p>Rogner chaque mosaïque au plus grand rectangle où <i>tous</i> les canaux " +
          "contiennent des données partout : plus de bordure vide, plus de coins noirs, plus de " +
          "bord irrégulier à rogner à la main.</p>" +
          "<p>Le rectangle est calculé une seule fois à partir de tous les canaux terminés, " +
          "puis appliqué à chacun d'eux : les sorties conservent ainsi des coordonnées, un " +
          "champ et des dimensions identiques. Rogner chaque canal sur ses propres données " +
          "annulerait précisément la garantie qu'apporte la grille commune.</p>" +
          "<p>Le ciel hors de ce rectangle est perdu, et la solution astrométrique est " +
          "conservée à travers le rognage.</p>"
   },
   "tip.autostretch":
   {
      en: "<p>Attach an auto-stretch screen transfer function to each finished mosaic, so you can " +
          "see it straight away instead of a black frame.</p>" +
          "<p>This is a <b>display</b> stretch, the same one the STF auto-stretch button applies. " +
          "No pixel is modified - the mosaics stay linear and ready for channel combination or " +
          "further processing. Reset it any time from the STF window.</p>" +
          "<p>The statistics come from the mosaic's data area only, so the black surround of an " +
          "uncropped mosaic cannot skew the stretch.</p>",
      fr: "<p>Attacher une fonction de transfert d'écran (STF) à chaque mosaïque terminée, " +
          "afin de la voir immédiatement au lieu d'un cadre noir.</p>" +
          "<p>Il s'agit d'un étirement <b>d'affichage</b>, le même que celui du bouton " +
          "d'étirement automatique STF. Aucun pixel n'est modifié : les mosaïques restent " +
          "linéaires et prêtes pour la combinaison des canaux ou la suite du traitement. " +
          "Réinitialisez-le à tout moment depuis la fenêtre STF.</p>" +
          "<p>Les statistiques ne portent que sur la zone de données de la mosaïque : le fond " +
          "noir d'une mosaïque non rognée ne peut donc pas fausser l'étirement.</p>"
   },
   "tip.keepIntermediates":
   {
      en: "<p>Off: only the finished mosaics stay open. On: every reprojected tile and partial " +
          "strip is kept as well, which is useful for diagnosing a bad join but uses a lot of " +
          "memory - each one is a full mosaic canvas.</p>",
      fr: "<p>Décoché : seules les mosaïques terminées restent ouvertes. Coché : chaque " +
          "tuile reprojetée et chaque bande partielle sont également conservées, ce qui aide " +
          "à diagnostiquer une mauvaise jonction mais consomme beaucoup de mémoire : chacune " +
          "occupe une toile entière.</p>"
   },
   "tip.regenerate":
   {
      en: "<p>Re-derive each finished mosaic's astrometric solution from its header, so the result " +
          "is plate solved and ready for annotation or further reprojection.</p>",
      fr: "<p>Recalculer la solution astrométrique de chaque mosaïque terminée à partir de " +
          "son en-tête, afin que le résultat soit résolu et prêt pour l'annotation ou une " +
          "reprojection ultérieure.</p>"
   },
   "tip.checkPlan":
   {
      en: "<p>Validate the configuration and print the mosaic grid and the planned join order to " +
          "the console, without processing anything.</p>",
      fr: "<p>Valider la configuration et afficher dans la console la grille de la mosaïque et " +
          "l'ordre de jonction prévu, sans rien traiter.</p>"
   },
   "tip.run":
   {
      en: "<p>Build every selected channel.</p>",
      fr: "<p>Construire tous les canaux sélectionnés.</p>"
   },

   "<p><i>No channel selected.</i></p>":
      { fr: "<p><i>Aucun canal sélectionné.</i></p>" },
   "Will create: ": { fr: "Sera créé : " },

   "msg.noSolvedImages":
   {
      en: "<p>No plate-solved image is open.</p><p>%TITLE% reprojects the tiles itself, so every " +
          "input needs an astrometric solution. Run <i>Script &gt; Image Analysis &gt; " +
          "ImageSolver</i> on your registered tiles first.</p>",
      fr: "<p>Aucune image résolue astrométriquement n'est ouverte.</p><p>%TITLE% reprojette " +
          "lui-même les tuiles : chaque image doit donc posséder une solution astrométrique. " +
          "Lancez d'abord <i>Script &gt; Image Analysis &gt; ImageSolver</i> sur vos tuiles.</p>"
   },

   // =========================================================================
   // Console - headings and progress
   // =========================================================================
   "Channels found: ":         { fr: "Canaux trouvés : " },
   "none":                     { fr: "aucun" },
   "Not present, unticked: ":  { fr: "Absents, décochés : " },
   "Optimising the mosaic centre and area":
      { fr: "Optimisation du centre et de l'étendue de la mosaïque" },
   "Mosaic layout":            { fr: "Disposition de la mosaïque" },
   "Planned join order":       { fr: "Ordre de jonction prévu" },
   "Per channel:":             { fr: "Par canal :" },
   "Autocrop":                 { fr: "Rognage automatique" },
   "Screen stretch":           { fr: "Étirement d'affichage" },
   "Overlap":                  { fr: "Recouvrement" },
   "Stars":                    { fr: "Étoiles" },
   "Scale":                    { fr: "Échelle" },
   "Gradient":                 { fr: "Gradient" },
   "Applying":                 { fr: "Application" },

   "Centre     : RA %s  Dec %s":   { fr: "Centre     : AD %s  Déc %s" },
   "Resolution : %.4f arcsec/px":  { fr: "Résolution : %.4f arcsec/px" },
   "Rotation   : %.4f deg":        { fr: "Rotation   : %.4f deg" },
   "Dimensions : %d x %d px":      { fr: "Dimensions : %d x %d px" },

   "A single tile; no joins are required.":
      { fr: "Une seule tuile ; aucune jonction n'est nécessaire." },
   "Joining tiles into rows, then joining the rows.":
      { fr: "Jonction des tuiles en rangées, puis jonction des rangées." },
   "Joining tiles into columns, then joining the columns.":
      { fr: "Jonction des tuiles en colonnes, puis jonction des colonnes." },
   "Row":     { fr: "Rangée" },
   "Column":  { fr: "Colonne" },
   "row":     { fr: "rangée" },
   "column":  { fr: "colonne" },
   "rows":    { fr: "rangées" },
   "columns": { fr: "colonnes" },
   "  %s %d: tiles %s":  { fr: "  %s %d : tuiles %s" },

   "\nEffective image scale: %.3f arcsec/px (%.2f um at %d mm)":
      { fr: "\nÉchelle d'image effective : %.3f arcsec/px (%.2f um à %d mm)" },
   "* Channel %s  (%d tile%s)":
      { fr: "* Canal %s  (%d tuile%s)" },
   "\n* Reprojecting %s  (channel %s, tile %d of %d)":
      { fr: "\n* Reprojection de %s  (canal %s, tuile %d sur %d)" },
   "  Trimming %d px from the tile edges":
      { fr: "  Érosion de %d px sur les bords de la tuile" },
   "\n--- Channel %s, %s: joining tile%s %s ---":
      { fr: "\n--- Canal %s, %s : jonction, tuile%s %s ---" },
   "\n--- Channel %s: joining %d %s ---":
      { fr: "\n--- Canal %s : jonction de %d %s ---" },
   "\n* Channel %s -> <b>%s</b>":
      { fr: "\n* Canal %s -> <b>%s</b>" },
   "\nReference: <b>%s</b>, Target: <b>%s</b>":
      { fr: "\nRéférence : <b>%s</b>, Cible : <b>%s</b>" },

   "Overlap %d x %d px at (%d,%d), %d shared pixels, %s join, target %s":
      { fr: "Recouvrement %d x %d px en (%d,%d), %d pixels partagés, jonction %s, cible %s" },
   "horizontal": { fr: "horizontale" },
   "vertical":   { fr: "verticale" },
   "below":      { fr: "en dessous" },
   "above":      { fr: "au-dessus" },
   "right":      { fr: "à droite" },
   "left":       { fr: "à gauche" },

   "%d detected, %d inside the shared band, %d used for photometry  (%s)":
      { fr: "%d détectées, %d dans la bande partagée, %d utilisées pour la photométrie  (%s)" },
   "Channel %d: x %.5f  (%d stars, %d rejected, %.2f%% scatter)":
      { fr: "Canal %d : x %.5f  (%d étoiles, %d rejetées, %.2f%% de dispersion)" },
   "Channel %d: x %.5f  (from %d overlap pixels)":
      { fr: "Canal %d : x %.5f  (à partir de %d pixels du recouvrement)" },
   "Channel %d: x %.5f  (assumed)":
      { fr: "Canal %d : x %.5f  (supposé)" },
   "Channel %d: %d samples (%d rejected), median offset %.3e, spread %.3e":
      { fr: "Canal %d : %d échantillons (%d rejetés), décalage médian %.3e, dispersion %.3e" },
   "%d px squares, %s":
      { fr: "carrés de %d px, %s" },
   "%d px written, taper %d px  (%s)":
      { fr: "%d px écrits, estompage %d px  (%s)" },
   "Join completed in ":
      { fr: "Jonction terminée en " },

   "Crop method: ":   { fr: "Méthode de rognage : " },
   "Basis : %s":      { fr: "Critère : %s" },
   "Crop  : %d x %d px at (%d,%d)  -  was %d x %d, keeping %.1f%%":
      { fr: "Rognage : %d x %d px en (%d,%d)  -  était %d x %d, conserve %.1f%%" },
   "largest rectangle covered by all %d channel(s), %d px search grid":
      { fr: "plus grand rectangle couvert par les %d canaux, grille de recherche de %d px" },
   "%d mosaic(s) cropped  (%s)":
      { fr: "%d mosaïque(s) rognée(s)  (%s)" },
   "The mosaics already fill the grid; nothing to crop.":
      { fr: "Les mosaïques remplissent déjà la grille ; rien à rogner." },
   "Display only - the mosaics are still linear.":
      { fr: "Affichage seulement - les mosaïques restent linéaires." },

   "* %s summary":   { fr: "* Bilan %s" },
   "Grid: %d x %d px, %.4f arcsec/px, centre RA %s Dec %s":
      { fr: "Grille : %d x %d px, %.4f arcsec/px, centre AD %s Déc %s" },
   "\nTotal time ":  { fr: "\nDurée totale " },
   "  Nothing was assembled.": { fr: "  Rien n'a été assemblé." },
   "All %d mosaics share the same grid: identical coordinates, field of view and dimensions.":
      { fr: "Les %d mosaïques partagent la même grille : coordonnées, champ et dimensions identiques." },
   "Plan check complete. Nothing was modified.":
      { fr: "Vérification du plan terminée. Rien n'a été modifié." },
   ": plan check": { fr: " : vérification du plan" },
   "  %-10s %d tile(s)  ->  %s": { fr: "  %-10s %d tuile(s)  ->  %s" },

   // =========================================================================
   // Warnings
   // =========================================================================
   "Warning: ": { fr: "Avertissement : " },
   "Warning: %d open image(s) have no astrometric solution and were left unticked.":
      { fr: "Avertissement : %d image(s) ouverte(s) sans solution astrométrique ont été laissées décochées." },
   "Warning: channel %s is missing tiles inside a %s; joining %d separate fragments.":
      { fr: "Avertissement : il manque des tuiles au canal %s dans une %s ; jonction de %d fragments séparés." },
   "Sample size %d is too large for a %d px overlap; using %d here.":
      { fr: "La taille d'échantillon %d est trop grande pour un recouvrement de %d px ; %d est utilisée ici." },
   "Channel %d: only %d usable star pair(s); scale estimated from the overlap pixels instead.":
      { fr: "Canal %d : seulement %d paire(s) d'étoiles exploitable(s) ; l'échelle est estimée sur les pixels du recouvrement." },
   "Channel %d: the scale could not be measured; using 1.0. The join may show a brightness step.":
      { fr: "Canal %d : l'échelle n'a pas pu être mesurée ; 1,0 est utilisé. La jonction peut présenter une marche de luminosité." },
   "Warning: %d pixel(s) (%.2f%%) fell outside [0,1] (range %.5f to %.5f) and were clipped.":
      { fr: "Avertissement : %d pixel(s) (%.2f%%) sortaient de [0,1] (de %.5f à %.5f) et ont été écrêtés." },
   "%d pixel(s) (%.2f%%) of the corrected target were not finite and were left untouched - the gradient model diverged there.":
      { fr: "%d pixel(s) (%.2f%%) de la cible corrigée n'étaient pas finis et ont été laissés intacts - le modèle de gradient y a divergé." },
   "The Crop process could not be driven on this build; cropping by copying pixels instead.":
      { fr: "Le processus Crop n'a pas pu être piloté sur cette version ; le rognage se fera par copie des pixels." },
   "Warning: could not compute a stretch for ":
      { fr: "Avertissement : impossible de calculer un étirement pour " },
   "Warning: nothing to crop (":
      { fr: "Avertissement : rien à rogner (" },
   "Warning: the computed crop is only %d x %d px; leaving the mosaics uncropped.":
      { fr: "Avertissement : le rognage calculé ne fait que %d x %d px ; les mosaïques sont laissées non rognées." },
   "*** Autocrop failed: ":
      { fr: "*** Échec du rognage automatique : " },
   "  The mosaics are intact, just uncropped.":
      { fr: "  Les mosaïques sont intactes, simplement non rognées." },
   "*** Channel %s failed: ":
      { fr: "*** Échec du canal %s : " },
   "FAILED: ": { fr: "ÉCHEC : " },
   "aborted":  { fr: "interrompu" },

   // =========================================================================
   // Errors
   // =========================================================================
   "No channel is selected. Enable at least one filter, or name a custom channel.":
      { fr: "Aucun canal n'est sélectionné. Activez au moins un filtre, ou nommez un canal personnalisé." },
   "The output prefix must contain at least one letter, digit or underscore.":
      { fr: "Le préfixe de sortie doit contenir au moins une lettre, un chiffre ou un tiret bas." },
   "No images are assigned to the selected channels.":
      { fr: "Aucune image n'est attribuée aux canaux sélectionnés." },
   "err.notSolved":
   {
      en: "'%s' has no astrometric solution. Plate solve it first (Script > Image Analysis > " +
          "ImageSolver), then press 'Rescan windows'.",
      fr: "'%s' n'a pas de solution astrométrique. Résolvez-la d'abord (Script > Image " +
          "Analysis > ImageSolver), puis cliquez sur « Réanalyser les fenêtres »."
   },
   "err.duplicateTile":
   {
      en: "Channel '%s' has two images on tile %d ('%s' and '%s'). Give one of them a different " +
          "tile number, or disable it.",
      fr: "Le canal '%s' comporte deux images sur la tuile %d ('%s' et '%s'). Donnez à l'une " +
          "d'elles un autre numéro de tuile, ou désactivez-la."
   },
   "err.joinNoReference":
   {
      en: "Join: the reference view is not available.",
      fr: "Jonction : la vue de référence n'est pas disponible."
   },
   "err.joinNoTarget":
   {
      en: "Join: the target view is not available.",
      fr: "Jonction : la vue cible n'est pas disponible."
   },
   "err.joinColourDepth":
   {
      en: "Join: '%s' and '%s' do not have the same number of channels.",
      fr: "Jonction : '%s' et '%s' n'ont pas le même nombre de canaux."
   },
   "err.joinDimensions":
   {
      en: "Join: '%s' and '%s' have different dimensions.",
      fr: "Jonction : '%s' et '%s' n'ont pas les mêmes dimensions."
   },
   "err.noOverlap":
   {
      en: "'%s' and '%s' do not overlap. Check the tile numbering, or the mosaic layout.",
      fr: "'%s' et '%s' ne se recouvrent pas. Vérifiez la numérotation des tuiles ou la " +
          "disposition de la mosaïque."
   },
   "err.targetContained":
   {
      en: "The target image '%s' lies entirely inside '%s'. It adds no new sky and cannot be " +
          "joined. Usually this means two images share a tile number.",
      fr: "L'image cible '%s' est entièrement contenue dans '%s'. Elle n'apporte aucun ciel " +
          "nouveau et ne peut pas être jointe. Cela signifie généralement que deux images " +
          "portent le même numéro de tuile."
   },
   "err.referenceContained":
   {
      en: "The reference image '%s' lies entirely inside '%s'. Reverse the join order for this pair.",
      fr: "L'image de référence '%s' est entièrement contenue dans '%s'. Inversez l'ordre de " +
          "jonction pour cette paire."
   },
   "err.fewSquares":
   {
      en: "Only %d star-free sample square(s) fit in the overlap between '%s' and '%s'. Reduce " +
          "'Sample size', or accept that these tiles need more overlap.",
      fr: "Seulement %d carré(s) d'échantillon sans étoile tiennent dans le recouvrement " +
          "entre '%s' et '%s'. Réduisez la taille d'échantillon, ou admettez que ces tuiles " +
          "ont besoin de plus de recouvrement."
   },
   "err.fewSamples":
   {
      en: "Only %d usable gradient samples in the overlap - at least 4 are needed to model it. " +
          "The overlap may be too small, or 'Sample size' too large.",
      fr: "Seulement %d échantillon(s) de gradient exploitable(s) dans le recouvrement - il en " +
          "faut au moins 4 pour le modéliser. Le recouvrement est peut-être trop petit, ou la " +
          "taille d'échantillon trop grande."
   },
   "err.tooThin":
   {
      en: "The usable part of the overlap is only %d sample square(s) wide by %d deep - too thin " +
          "to model a two-dimensional gradient. Reduce 'Sample size', or accept that these tiles " +
          "need more overlap.",
      fr: "La partie exploitable du recouvrement ne fait que %d carré(s) d'échantillon de " +
          "large sur %d de profondeur - trop mince pour modéliser un gradient bidimensionnel. " +
          "Réduisez la taille d'échantillon, ou admettez que ces tuiles ont besoin de plus de " +
          "recouvrement."
   },
   "err.splineFailed":
   {
      en: "The gradient surface spline could not be fitted. Try a larger 'Smoothness', " +
          "or a smaller 'Sample size' to get more samples.",
      fr: "La spline de surface du gradient n'a pas pu être ajustée. Essayez un lissage plus " +
          "élevé, ou une taille d'échantillon plus petite pour obtenir plus d'échantillons."
   },
   "err.noPixels":
   {
      en: "The join produced no usable pixels. The gradient model may have diverged; try a larger " +
          "'Smoothness'.",
      fr: "La jonction n'a produit aucun pixel exploitable. Le modèle de gradient a peut-être " +
          "divergé ; essayez un lissage plus élevé."
   },
   "err.tooManyNonFinite":
   {
      en: " Try a larger 'Smoothness', or a smaller 'Sample size' so the model has more support.",
      fr: " Essayez un lissage plus élevé, ou une taille d'échantillon plus petite pour " +
          "donner plus d'appui au modèle."
   },
   "err.stranded":
   {
      en: "This channel falls into pieces that do not overlap each other: tiles %s cannot reach " +
          "the rest of the mosaic. Usually a %s between them has no image in this channel, or a " +
          "tile number is wrong. Fix the table and run again, or untick the stranded images.",
      fr: "Ce canal se scinde en morceaux qui ne se recouvrent pas : les tuiles %s ne peuvent pas " +
          "rejoindre le reste de la mosaïque. En général, une %s intermédiaire n'a pas " +
          "d'image dans ce canal, ou un numéro de tuile est erroné. Corrigez le tableau et " +
          "relancez, ou décochez les tuiles isolées."
   },
   "err.trimTooTight":
   {
      en: "Tiles %s only just touch the rest of this channel, and the edge trim removes what " +
          "little overlap there was. Reduce 'Edge trim', or accept that these tiles need more " +
          "overlap.",
      fr: "Les tuiles %s touchent à peine le reste de ce canal, et l'érosion des bords " +
          "supprime le peu de recouvrement qui existait. Réduisez l'érosion des bords, ou " +
          "admettez que ces tuiles ont besoin de plus de recouvrement."
   },
   "err.fragmentsNoOverlap":
   {
      en: "These %s were expected to overlap from the tile coordinates, but do not in the pixel " +
          "data. Reduce 'Edge trim', or check that the tiles really do overlap.",
      fr: "Ces %s auraient dû se recouvrir d'après les coordonnées des tuiles, mais ne se " +
          "recouvrent pas dans les pixels. Réduisez l'érosion des bords, ou vérifiez que les " +
          "tuiles se recouvrent réellement."
   },
   "err.windowGone":
   {
      en: "'%s' is no longer open. Press 'Rescan windows' and try again.",
      fr: "'%s' n'est plus ouverte. Cliquez sur « Réanalyser les fenêtres » et réessayez."
   },
   "err.noSolutionShort":
   {
      en: "'%s' has no usable astrometric solution.",
      fr: "'%s' n'a pas de solution astrométrique exploitable."
   },
   "err.aborted":
   {
      en: "Aborted by the user. Channels already finished have been kept.",
      fr: "Interrompu par l'utilisateur. Les canaux déjà terminés ont été conservés."
   },
   "no finished mosaics":
      { fr: "aucune mosaïque terminée" },
   "default mode, pixel margins":
      { fr: "mode par défaut, marges en pixels" },
   "default mode, fractional margins":
      { fr: "mode par défaut, marges fractionnaires" },
   "the channels share no fully covered rectangle":
      { fr: "les canaux ne partagent aucun rectangle entièrement couvert" },
   "err.noSolutions":
   {
      en: "No astrometric solutions were supplied to the mosaic grid.",
      fr: "Aucune solution astrométrique n'a été fournie à la grille de la mosaïque."
   },
   "err.badResolution":
   {
      en: "Invalid mosaic resolution. It must be greater than zero.",
      fr: "Résolution de mosaïque invalide. Elle doit être supérieure à zéro."
   },
   "err.badRotation":
   {
      en: "Invalid mosaic rotation angle.",
      fr: "Angle de rotation de la mosaïque invalide."
   },
   "err.badDimensions":
   {
      en: "Invalid mosaic dimensions: %d x %d.",
      fr: "Dimensions de mosaïque invalides : %d x %d."
   },
   "err.badOrigin":
   {
      en: "Invalid projection origin.",
      fr: "Origine de projection invalide."
   },
   "err.sourceGone":
   {
      en: "The source window is no longer available.",
      fr: "La fenêtre source n'est plus disponible."
   },
   "err.reprojectionEmpty":
   {
      en: "Reprojection of '%s' produced no image.",
      fr: "La reprojection de '%s' n'a produit aucune image."
   },
   "err.cropFailed":
   {
      en: "Crop failed on '%s'.",
      fr: "Le rognage a échoué sur '%s'."
   },
   "err.cropWrongSize":
   {
      en: "Crop produced %d x %d instead of %d x %d on '%s'.",
      fr: "Le rognage a produit %d x %d au lieu de %d x %d sur '%s'."
   },
   "err.gridTooLarge":
   {
      en: "The computed mosaic is %d x %d pixels, which is too large to process. Check that all " +
          "tiles really belong to the same mosaic, or set the dimensions manually.",
      fr: "La mosaïque calculée fait %d x %d pixels, ce qui est trop grand à traiter. " +
          "Vérifiez que toutes les tuiles appartiennent bien à la même mosaïque, ou fixez " +
          "les dimensions manuellement."
   },
   "No tiles to lay out.": { fr: "Aucune tuile à disposer." },
   "err.nothingToJoin":
   {
      en: "Channel %s: nothing to join.",
      fr: "Canal %s : rien à joindre."
   },
   "err.cannotProject":
   {
      en: "Could not project the centre of '%s' onto the mosaic grid.",
      fr: "Impossible de projeter le centre de '%s' sur la grille de la mosaïque."
   },
   "warn.regenerateFailed":
   {
      en: "Warning: could not regenerate the astrometric solution of %s: %s",
      fr: "Avertissement : la solution astrométrique de %s n'a pas pu être reconstruite : %s"
   },
   "warn.stretchFailed":
   {
      en: "Warning: screen stretch failed on %s: %s",
      fr: "Avertissement : l'étirement d'affichage a échoué sur %s : %s"
   },

   // Warnings that carry no arguments
   "warn.noSolutionAfterCrop":
   {
      en: "Warning: the astrometric solution of %s could not be rebuilt after cropping; re-solve " +
          "it if you need it.",
      fr: "Avertissement : la solution astrométrique de %s n'a pas pu être reconstruite " +
          "après le rognage ; résolvez-la à nouveau si vous en avez besoin."
   },
   "warn.channelsDiffer":
   {
      en: "The channels do not all have the same number of tiles (%s). The outputs will still " +
          "share one grid and one size, but the sky coverage will differ between channels.",
      fr: "Les canaux n'ont pas tous le même nombre de tuiles (%s). Les sorties partageront " +
          "toujours une seule grille et une seule taille, mais la couverture du ciel différera " +
          "d'un canal à l'autre."
   },
   "warn.emptyChannel":
   {
      en: "Channel '%s' is enabled but has no images; it will be skipped.",
      fr: "Le canal '%s' est activé mais ne contient aucune image ; il sera ignoré."
   },
   "warn.unassigned":
   {
      en: "%d image(s) have no channel assigned and will be ignored.",
      fr: "%d image(s) n'ont aucun canal attribué et seront ignorées."
   },
   "warn.noTrim":
   {
      en: "Edge trimming is disabled. Reprojection leaves soft edges, which can produce fine " +
          "lines along the joins.",
      fr: "L'érosion des bords est désactivée. La reprojection laisse des bords incomplets, " +
          "ce qui peut produire de fines lignes le long des jonctions."
   }

   };
   return MT_CATALOGUE;
}

/**
 * Substitutes %NAME% placeholders in a translated passage.
 *
 * @param {String} key
 * @param {Object} values e.g. { "TITLE": "Mosaic Toolbox" }. Quote any key whose
 *        name is a preprocessor #define (TITLE, VERSION), or it will be substituted.
 * @returns {String}
 */
function mtTv( key, values )
{
   let s = mtT( key );
   for ( let name in values )
   {
      // Function form: a value containing $&, $` or $1 must be inserted
      // literally, not re-expanded as a replacement pattern. Output prefixes
      // are typed by the user, so this is reachable.
      let value = "" + values[name];
      s = s.replace( new RegExp( "%" + name + "%", "g" ), () => value );
   }
   return s;
}

// ----------------------------------------------------------------------------
// EOF MT_Lang.js
