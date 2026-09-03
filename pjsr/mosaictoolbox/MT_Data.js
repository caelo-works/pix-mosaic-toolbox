// SPDX-License-Identifier: CC-BY-NC-4.0
// ----------------------------------------------------------------------------
// MT_Data.js - MosaicToolbox
//
// Everything the dialog collects and the engine consumes, plus persistence.
// ----------------------------------------------------------------------------

/**
 * One input image: a plate solved mosaic tile in one filter.
 */
class MT_Image
{
   constructor( viewId )
   {
      /** @type String Main view identifier */
      this.viewId = viewId;
      /** @type Boolean Include this image in the run */
      this.enabled = true;
      /** @type String Channel key: "L".."O", a custom name, or MT_UNASSIGNED() */
      this.filterKey = MT_UNASSIGNED();
      /** @type String Raw FILTER keyword value, for display only */
      this.rawFilter = "";
      /** @type Number Tile index, 0 based. Tiles with the same index across
        *              filters cover the same patch of sky. */
      this.tileIndex = 0;
      /** @type Number Centre right ascension, degrees */
      this.ra = 0;
      /** @type Number Centre declination, degrees */
      this.dec = 0;
      /** @type Number Image scale, degrees per pixel */
      this.resolution = 0;
      /** @type Number */
      this.width = 0;
      /** @type Number */
      this.height = 0;
      /** @type Boolean True when a usable astrometric solution was found */
      this.solved = false;
      /** @type AstrometricMetadata */
      this.metadata = null;
   }

   /** @returns {View} The main view, or a null View if it has been closed. */
   view()
   {
      return mtViewById( this.viewId );
   }

   /** @returns {Boolean} */
   isAvailable()
   {
      return this.view() !== null;
   }
}

// ----------------------------------------------------------------------------

class MosaicToolboxData
{
   constructor()
   {
      this.setDefaults();
   }

   setDefaults()
   {
      // ---- interface -------------------------------------------------------
      /** @type String Interface language code; see MT_LANGUAGES() */
      this.language = "en";

      // ---- input ----------------------------------------------------------
      /** @type MT_Image[] */
      this.images = [];

      /** @type Object Map of standard filter key -> Boolean */
      this.filterEnabled = {};
      for ( let f of MT_STANDARD_FILTERS() )
         this.filterEnabled[f.key] = true;

      /** @type String[] User named extra channels; "" means the slot is unused */
      this.customNames = [];
      for ( let i = 0; i < MT_CUSTOM_SLOTS(); ++i )
         this.customNames.push( "" );

      // ---- common astrometric grid ---------------------------------------
      this.autoResolution = true;
      this.resolutionArcsec = 1.0;      // arcsec per pixel
      this.autoRotation = true;
      this.rotation = 0;                // degrees
      this.autoCenter = true;
      this.centerRA = 0;                // degrees
      this.centerDec = 0;               // degrees
      this.autoProjection = true;
      this.projection = "Gnomonic";     // enum member NAME - see mtProjectionValue()
      this.autoDimensions = true;
      this.width = 1000;
      this.height = 1000;
      this.pixelInterpolation = "Auto"; // enum member NAME - see mtInterpolationValue()
      this.clampingThreshold = 0.3;

      // ---- tile preparation ----------------------------------------------
      this.trimPixels = 5;

      // ---- join sequencing ------------------------------------------------
      this.autoStripAxis = true;        // choose rows or columns automatically
      this.stripAxisIsRows = true;      // used when autoStripAxis is false
      this.stripTolerance = 0.35;       // fraction of a tile size

      // ---- photometric join ------------------------------------------------
      this.logStarDetection = -1.0;     // log sensitivity of the star detector
      this.sampleSize = 20;             // side of a gradient sample square, px
      this.sampleStarGrowth = 1.5;      // star rejection radius = growth*r + 2 px
      this.maxSamples = 3000;
      this.gradientSmoothness = 0;      // log10, in units of the residual sigma
      this.joinMode = 0;                // 0 = Overlay, 1 = Random, 2 = Average
      this.joinSize = 40;               // blend band, % of the overlap thickness
      this.useAutoTaper = true;
      this.taperLength = 500;           // px, when useAutoTaper is false

      // ---- output ----------------------------------------------------------
      this.autoCrop = false;            // off unless the user asks for it
      this.autoStretch = true;          // screen stretch only; never touches pixels
      this.outputPrefix = "Mosaic";
      this.keepIntermediates = false;
      this.regenerateSolution = true;
   }

   // -------------------------------------------------------------------------
   // Channel bookkeeping
   // -------------------------------------------------------------------------

   /**
    * The channels the user has switched on, in display order.
    * @returns {Object[]} { key, label, outputId }
    */
   activeChannels()
   {
      let out = [];
      for ( let f of MT_STANDARD_FILTERS() )
         if ( this.filterEnabled[f.key] )
            out.push( { key: f.key, label: f.label, outputId: this.outputPrefix + f.key } );
      let seen = {};
      for ( let c of out )
         seen[c.key] = true;
      for ( let name of this.customNames )
      {
         let n = ("" + name).trim();
         if ( n.length && !seen[n] )
         {
            seen[n] = true;
            out.push( { key: n, label: n + mtT( "  (custom)" ),
                        outputId: this.outputPrefix + mtSanitiseId( n ) } );
         }
      }
      return out;
   }

   /**
    * Every channel key that can be assigned to an image, including custom ones.
    * @returns {String[]}
    */
   allChannelKeys()
   {
      let keys = [];
      for ( let f of MT_STANDARD_FILTERS() )
         keys.push( f.key );
      for ( let name of this.customNames )
      {
         let n = ("" + name).trim();
         if ( n.length && keys.indexOf( n ) < 0 )
            keys.push( n );
      }
      return keys;
   }

   /**
    * Enabled images belonging to one channel, ordered by tile index.
    * @param {String} key
    * @returns {MT_Image[]}
    */
   imagesForChannel( key )
   {
      let out = this.images.filter( im => im.enabled && im.filterKey === key && im.isAvailable() );
      out.sort( (a, b) => a.tileIndex - b.tileIndex );
      return out;
   }

   /**
    * Every enabled image that is assigned to an active channel. This is the set
    * that defines the common grid, so that all channels end up identical.
    * @returns {MT_Image[]}
    */
   activeImages()
   {
      let keys = {};
      for ( let ch of this.activeChannels() )
         keys[ch.key] = true;
      return this.images.filter( im => im.enabled && keys[im.filterKey] === true && im.isAvailable() );
   }

   /**
    * @returns {String|null} A human readable reason the run cannot start, or
    *                        null when the configuration is usable.
    */
   validate()
   {
      let channels = this.activeChannels();
      if ( channels.length === 0 )
         return mtT( "No channel is selected. Enable at least one filter, or name a custom channel." );

      if ( !mtSanitiseId( this.outputPrefix ).length )
         return mtT( "The output prefix must contain at least one letter, digit or underscore." );

      let images = this.activeImages();
      if ( images.length === 0 )
         return mtT( "No images are assigned to the selected channels." );

      for ( let im of images )
         if ( !im.solved )
            return format( mtT( "err.notSolved" ), im.viewId );

      let usedChannels = 0;
      for ( let ch of channels )
      {
         let list = this.imagesForChannel( ch.key );
         if ( list.length === 0 )
            continue;
         ++usedChannels;
         // Duplicate tile indices inside one channel are always a mistake.
         let seen = {};
         for ( let im of list )
         {
            if ( seen[im.tileIndex] )
               return format( mtT( "err.duplicateTile" ), ch.key, im.tileIndex + 1,
                              seen[im.tileIndex], im.viewId );
            seen[im.tileIndex] = im.viewId;
         }
      }
      if ( usedChannels === 0 )
         return mtT( "No images are assigned to the selected channels." );

      return null;
   }

   /**
    * Non fatal observations worth showing before a long run.
    * @returns {String[]}
    */
   warnings()
   {
      let out = [];
      let channels = this.activeChannels();
      let counts = [];
      for ( let ch of channels )
      {
         let n = this.imagesForChannel( ch.key ).length;
         if ( n === 0 )
            out.push( format( mtT( "warn.emptyChannel" ), ch.key ) );
         else
            counts.push( { key: ch.key, n: n } );
      }
      if ( counts.length > 1 )
      {
         let n0 = counts[0].n;
         for ( let c of counts )
            if ( c.n !== n0 )
            {
               out.push( format( mtT( "warn.channelsDiffer" ),
                                 counts.map( c2 => c2.key + ":" + c2.n ).join( ", " ) ) );
               break;
            }
      }
      let unassigned = this.images.filter( im => im.enabled && im.filterKey === MT_UNASSIGNED() );
      if ( unassigned.length )
         out.push( format( mtT( "warn.unassigned" ), unassigned.length ) );

      if ( this.trimPixels < 1 )
         out.push( mtT( "warn.noTrim" ) );
      return out;
   }

   // -------------------------------------------------------------------------
   // Persistence. Only the settings are stored; the image list is rebuilt from
   // the open windows every time the script starts.
   // -------------------------------------------------------------------------

   #key( name ) { return "MosaicToolbox/" + name; }

   #writeB( n, v ) { Settings.write( this.#key( n ), DataType.Boolean, v ); }
   #writeI( n, v ) { Settings.write( this.#key( n ), DataType.Int32,   v|0 ); }
   #writeF( n, v ) { Settings.write( this.#key( n ), DataType.Double,  v ); }
   #writeS( n, v ) { Settings.write( this.#key( n ), DataType.UCString, "" + v ); }

   #readB( n, d ) { let v = Settings.read( this.#key( n ), DataType.Boolean );  return Settings.lastReadOK ? v : d; }
   #readI( n, d ) { let v = Settings.read( this.#key( n ), DataType.Int32 );    return Settings.lastReadOK ? v : d; }
   #readF( n, d ) { let v = Settings.read( this.#key( n ), DataType.Double );   return Settings.lastReadOK ? v : d; }
   #readS( n, d ) { let v = Settings.read( this.#key( n ), DataType.UCString ); return Settings.lastReadOK ? v : d; }

   /** Persists the interface language alone, for the language selector. */
   saveLanguage()
   {
      this.#writeS( "language", this.language );
   }

   saveSettings()
   {
      this.saveLanguage();
      for ( let f of MT_STANDARD_FILTERS() )
         this.#writeB( "filter_" + f.key, this.filterEnabled[f.key] );
      for ( let i = 0; i < MT_CUSTOM_SLOTS(); ++i )
         this.#writeS( "custom_" + i, this.customNames[i] );

      this.#writeB( "autoResolution", this.autoResolution );
      this.#writeF( "resolutionArcsec", this.resolutionArcsec );
      this.#writeB( "autoRotation", this.autoRotation );
      this.#writeF( "rotation", this.rotation );
      this.#writeB( "autoCenter", this.autoCenter );
      this.#writeF( "centerRA", this.centerRA );
      this.#writeF( "centerDec", this.centerDec );
      this.#writeB( "autoProjection", this.autoProjection );
      this.#writeS( "projection", this.projection );
      this.#writeB( "autoDimensions", this.autoDimensions );
      this.#writeI( "width", this.width );
      this.#writeI( "height", this.height );
      this.#writeS( "pixelInterpolation", this.pixelInterpolation );
      this.#writeF( "clampingThreshold", this.clampingThreshold );

      this.#writeI( "trimPixels", this.trimPixels );

      this.#writeB( "autoStripAxis", this.autoStripAxis );
      this.#writeB( "stripAxisIsRows", this.stripAxisIsRows );
      this.#writeF( "stripTolerance", this.stripTolerance );

      this.#writeF( "logStarDetection", this.logStarDetection );
      this.#writeI( "sampleSize", this.sampleSize );
      this.#writeF( "sampleStarGrowth", this.sampleStarGrowth );
      this.#writeI( "maxSamples", this.maxSamples );
      this.#writeF( "gradientSmoothness", this.gradientSmoothness );
      this.#writeI( "joinMode", this.joinMode );
      this.#writeF( "joinSize", this.joinSize );
      this.#writeB( "useAutoTaper", this.useAutoTaper );
      this.#writeI( "taperLength", this.taperLength );

      this.#writeB( "autoCrop", this.autoCrop );
      this.#writeB( "autoStretch", this.autoStretch );
      this.#writeS( "outputPrefix", this.outputPrefix );
      this.#writeB( "keepIntermediates", this.keepIntermediates );
      this.#writeB( "regenerateSolution", this.regenerateSolution );
   }

   restoreSettings()
   {
      this.language = this.#readS( "language", this.language );
      for ( let f of MT_STANDARD_FILTERS() )
         this.filterEnabled[f.key] = this.#readB( "filter_" + f.key, this.filterEnabled[f.key] );
      for ( let i = 0; i < MT_CUSTOM_SLOTS(); ++i )
         this.customNames[i] = this.#readS( "custom_" + i, this.customNames[i] );

      this.autoResolution    = this.#readB( "autoResolution", this.autoResolution );
      this.resolutionArcsec  = this.#readF( "resolutionArcsec", this.resolutionArcsec );
      this.autoRotation      = this.#readB( "autoRotation", this.autoRotation );
      this.rotation          = this.#readF( "rotation", this.rotation );
      this.autoCenter        = this.#readB( "autoCenter", this.autoCenter );
      this.centerRA          = this.#readF( "centerRA", this.centerRA );
      this.centerDec         = this.#readF( "centerDec", this.centerDec );
      this.autoProjection    = this.#readB( "autoProjection", this.autoProjection );
      this.projection        = this.#readS( "projection", this.projection );
      this.autoDimensions    = this.#readB( "autoDimensions", this.autoDimensions );
      this.width             = this.#readI( "width", this.width );
      this.height            = this.#readI( "height", this.height );
      this.pixelInterpolation= this.#readS( "pixelInterpolation", this.pixelInterpolation );
      this.clampingThreshold = this.#readF( "clampingThreshold", this.clampingThreshold );

      this.trimPixels        = this.#readI( "trimPixels", this.trimPixels );

      this.autoStripAxis     = this.#readB( "autoStripAxis", this.autoStripAxis );
      this.stripAxisIsRows   = this.#readB( "stripAxisIsRows", this.stripAxisIsRows );
      this.stripTolerance    = this.#readF( "stripTolerance", this.stripTolerance );

      this.logStarDetection   = this.#readF( "logStarDetection", this.logStarDetection );
      this.sampleSize         = this.#readI( "sampleSize", this.sampleSize );
      this.sampleStarGrowth   = this.#readF( "sampleStarGrowth", this.sampleStarGrowth );
      this.maxSamples         = this.#readI( "maxSamples", this.maxSamples );
      this.gradientSmoothness = this.#readF( "gradientSmoothness", this.gradientSmoothness );
      this.joinMode           = this.#readI( "joinMode", this.joinMode );
      this.joinSize           = this.#readF( "joinSize", this.joinSize );
      this.useAutoTaper       = this.#readB( "useAutoTaper", this.useAutoTaper );
      this.taperLength        = this.#readI( "taperLength", this.taperLength );

      this.autoCrop            = this.#readB( "autoCrop", this.autoCrop );
      this.autoStretch         = this.#readB( "autoStretch", this.autoStretch );
      this.outputPrefix        = this.#readS( "outputPrefix", this.outputPrefix );
      this.keepIntermediates   = this.#readB( "keepIntermediates", this.keepIntermediates );
      this.regenerateSolution  = this.#readB( "regenerateSolution", this.regenerateSolution );
   }
}

// ----------------------------------------------------------------------------
// EOF MT_Data.js
