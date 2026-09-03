// SPDX-License-Identifier: CC-BY-NC-4.0
// ----------------------------------------------------------------------------
// MT_Globals.js - MosaicToolbox
//
// Version, filter definitions, and the small helpers shared by every module.
// ----------------------------------------------------------------------------

function MT_TITLE()   { return "Mosaic Toolbox"; }
function MT_VERSION() { return "__BUILD__"; }

/** Written into the FITS history of a trimmed tile. Also recognised by
 *  PhotometricMosaic, so a tile prepared here does not trigger its soft-edge
 *  warning if you ever hand one to it. */
function MT_TRIM_TAG() { return "TrimMosaicTile"; }

/**
 * The fixed channel slots offered in the user interface.
 *
 * `key`     - short identifier appended to the output prefix (MosaicR, MosaicHa...)
 * `label`   - text shown in the dialog
 * `aliases` - upper-cased FILTER keyword values that map to this slot
 *
 * @returns {Object[]}
 */
function MT_STANDARD_FILTERS()
{
   return [
      { key: "L", label: "L  (Luminance)",
        aliases: [ "L", "LUM", "LUMINANCE", "CLEAR", "CLS", "NONE", "OPEN",
                   "IRCUT", "UVIR", "UV/IR", "UV-IR", "LP", "LPRO", "L-PRO", "LENH" ] },
      { key: "R", label: "R  (Red)",
        aliases: [ "R", "RED" ] },
      { key: "G", label: "G  (Green)",
        aliases: [ "G", "GREEN", "V" ] },
      { key: "B", label: "B  (Blue)",
        aliases: [ "B", "BLUE" ] },
      { key: "S", label: "S  (SII)",
        aliases: [ "S", "S2", "SII", "S-II", "SULPHUR", "SULFUR", "SII3NM", "SII6NM" ] },
      { key: "H", label: "H  (Ha)",
        aliases: [ "H", "HA", "H-A", "H_ALPHA", "HALPHA", "H-ALPHA", "HYDROGEN",
                   "HA3NM", "HA6NM", "HA7NM" ] },
      { key: "O", label: "O  (OIII)",
        aliases: [ "O", "O3", "OIII", "O-III", "OXYGEN", "OIII3NM", "OIII6NM" ] }
   ];
}

/** @returns {Number} Number of free-text channel slots the user can name. */
function MT_CUSTOM_SLOTS() { return 3; }

/** @returns {String} Key used internally for images whose filter is unknown. */
function MT_UNASSIGNED() { return "?"; }

// ----------------------------------------------------------------------------
// Abort
// ----------------------------------------------------------------------------

/**
 * Throws if the user has pressed the console's abort button.
 *
 * Called only at boundaries where stopping leaves a coherent result - between
 * tiles and between joins - never in the middle of writing an accumulator.
 */
function mtCheckAbort()
{
   if ( console.abortRequested )
   {
      // Marked so the per-channel error handler can tell "the user stopped this"
      // from "this channel failed", and stop the whole run rather than moving on
      // to the next channel. `abortRequested` is read-only; PixInsight clears it
      // when the script returns.
      let e = new Error( mtT( "err.aborted" ) );
      e.mtAborted = true;
      throw e;
   }
}

// ----------------------------------------------------------------------------
// Timing
// ----------------------------------------------------------------------------

/**
 * @param {Number} startTime Milliseconds, from new Date().getTime()
 * @returns {String} e.g. "3.412 s" or "4 min 12.7 s"
 */
function mtElapsed( startTime )
{
   let s = (new Date().getTime() - startTime)/1000;
   if ( s < 60 )
      return format( "%.3f s", s );
   let m = Math.floor( s/60 );
   return format( "%d min %.1f s", m, s - m*60 );
}

// ----------------------------------------------------------------------------
// FITS helpers
// ----------------------------------------------------------------------------

/**
 * Reads a string valued FITS keyword, stripped of quotes and padding.
 * @param {ImageWindow} window
 * @param {String} name Keyword name, e.g. "FILTER"
 * @returns {String} Trimmed value, or "" if the keyword is absent/empty.
 */
function mtFitsString( window, name )
{
   if ( !window || window.isNull )
      return "";
   for ( let k of window.keywords )
      if ( k.name === name )
      {
         let v = k.strippedValue !== undefined ? k.strippedValue : k.value;
         if ( v === undefined || v === null )
            return "";
         v = ("" + v).trim();
         if ( v.length >= 2 && v.charAt( 0 ) === "'" && v.charAt( v.length-1 ) === "'" )
            v = v.substring( 1, v.length-1 ).trim();
         return v;
      }
   return "";
}

/**
 * Reads a numeric FITS keyword.
 * @param {ImageWindow} window
 * @param {String} name
 * @param {Number} defaultValue Returned when the keyword is absent or unusable.
 * @returns {Number}
 */
function mtFitsNumber( window, name, defaultValue )
{
   if ( !window || window.isNull )
      return defaultValue;
   for ( let k of window.keywords )
      if ( k.name === name )
      {
         let v = k.numericValue;
         if ( v !== undefined && v !== null && isFinite( v ) )
            return v;
      }
   return defaultValue;
}

/**
 * Normalises a raw FILTER value for alias matching: upper case, and every
 * character that is not a letter or a digit removed. "H-alpha 3nm" -> "HALPHA3NM".
 * @param {String} s
 * @returns {String}
 */
function mtNormaliseFilter( s )
{
   return ("" + s).toUpperCase().replace( /[^A-Z0-9]/g, "" );
}

/**
 * Maps a raw FILTER keyword value onto one of the standard channel keys.
 * @param {String} rawFilter
 * @returns {String} A standard key ("L".."O"), or "" if there is no match.
 */
function mtMatchStandardFilter( rawFilter )
{
   let n = mtNormaliseFilter( rawFilter );
   if ( !n.length )
      return "";
   let filters = MT_STANDARD_FILTERS();
   // Exact alias match first, so that "S" never steals "SII" and so on.
   for ( let f of filters )
      for ( let a of f.aliases )
         if ( mtNormaliseFilter( a ) === n )
            return f.key;
   // Then a prefix match, longest alias wins ("HA6NMOPTOLONG" -> H).
   let best = "";
   let bestLen = 0;
   for ( let f of filters )
      for ( let a of f.aliases )
      {
         let an = mtNormaliseFilter( a );
         if ( an.length > 1 && an.length > bestLen && n.startsWith( an ) )
         {
            best = f.key;
            bestLen = an.length;
         }
      }
   return best;
}

// ----------------------------------------------------------------------------
// Identifier helpers
// ----------------------------------------------------------------------------

/**
 * Converts arbitrary text into a valid PixInsight view identifier fragment.
 * @param {String} s
 * @returns {String} Empty string if nothing usable remains.
 */
function mtSanitiseId( s )
{
   let t = ("" + s).replace( /[^A-Za-z0-9_]/g, "_" ).replace( /_+/g, "_" );
   t = t.replace( /^_+/, "" ).replace( /_+$/, "" );
   return t;
}

/**
 * View.viewById() returns null - not a null View - when nothing matches, so its
 * result must be tested before .isNull is touched.
 *
 * @param {String} id
 * @returns {View|null}
 */
function mtViewById( id )
{
   let v = View.viewById( id );
   if ( v === null || v === undefined || v.isNull )
      return null;
   return v;
}

/**
 * @param {String} id
 * @returns {String} `id`, or `id_2`, `id_3`... if a view with that id exists.
 */
function mtUniqueId( id )
{
   let base = mtSanitiseId( id );
   if ( !base.length )
      base = "MT_view";
   if ( /^[0-9]/.test( base ) )
      base = "_" + base;
   let candidate = base;
   for ( let i = 2; mtViewById( candidate ) !== null; ++i )
      candidate = base + "_" + i;
   return candidate;
}

/**
 * Frees a window unconditionally. Safe to call with null/closed windows.
 * @param {ImageWindow} window
 */
function mtForceClose( window )
{
   try
   {
      if ( window && !window.isNull )
         window.forceClose();
   }
   catch ( x )
   {
      // A window the user already closed by hand; nothing to do.
   }
}

// ----------------------------------------------------------------------------
// Core enumerations
//
// These are stored and compared by NAME, never by numeric value. The numbers are
// not stable or guessable - InterpolationAlgorithm.NearestNeighbor is 0, so a
// numeric default of 0 silently means "nearest neighbour", which is the worst
// possible choice for reprojection. Names also survive a PixInsight upgrade that
// renumbers an enumeration.
// ----------------------------------------------------------------------------

/**
 * Builds { text, name, value } for an enumeration, skipping members that do not
 * exist in the running PixInsight version.
 * @param {Object} enumeration
 * @param {Object[]} entries { text, name }
 * @returns {Object[]}
 */
function mtEnumItems( enumeration, entries )
{
   let out = [];
   for ( let e of entries )
      if ( enumeration !== undefined && enumeration[e.name] !== undefined )
         out.push( { text: e.text, name: e.name, value: enumeration[e.name] } );
   return out;
}

/** @returns {Object[]} Pixel interpolation algorithms, best default first. */
function mtInterpolationItems()
{
   return mtEnumItems( InterpolationAlgorithm, [
      { text: "Auto",                 name: "Auto" },
      { text: "Lanczos-4",            name: "Lanczos4" },
      { text: "Lanczos-3",            name: "Lanczos3" },
      { text: "Bicubic spline",       name: "BicubicSpline" },
      { text: "Bicubic B-spline",     name: "BicubicBSpline" },
      { text: "Mitchell-Netravali",   name: "MitchellNetravaliFilter" },
      { text: "Catmull-Rom spline",   name: "CatmullRomSplineFilter" },
      { text: "Bilinear",             name: "Bilinear" },
      { text: "Nearest neighbour",    name: "NearestNeighbor" }
   ] );
}

/** @returns {Object[]} Sky projections, best default first. */
function mtProjectionItems()
{
   return mtEnumItems( Projection, [
      { text: "Gnomonic",              name: "Gnomonic" },
      { text: "Stereographic",         name: "Stereographic" },
      { text: "Plate-carree",          name: "PlateCarree" },
      { text: "Mercator",              name: "Mercator" },
      { text: "Hammer-Aitoff",         name: "HammerAitoff" },
      { text: "Zenithal equal area",   name: "ZenithalEqualArea" },
      { text: "Orthographic",          name: "Orthographic" }
   ] );
}

/**
 * @param {Object[]} items From mtEnumItems()
 * @param {String} name
 * @returns {Number} The named member's value, or the first item's value when the
 *          name is unknown - which is why the tables above lead with the default.
 */
function mtEnumValue( items, name )
{
   if ( items.length === 0 )
      return 0;
   for ( let it of items )
      if ( it.name === name )
         return it.value;
   return items[0].value;
}

/** @param {String} name @returns {Number} */
function mtInterpolationValue( name ) { return mtEnumValue( mtInterpolationItems(), name ); }

/** @param {String} name @returns {Number} */
function mtProjectionValue( name ) { return mtEnumValue( mtProjectionItems(), name ); }

// ----------------------------------------------------------------------------
// Robust statistics
//
// Written for typed arrays and for partial fills (`n` may be less than
// `values.length`), which is what the sample and photometry passes produce.
// ----------------------------------------------------------------------------

/**
 * @param {Number[]|Float64Array|Float32Array} values
 * @param {Number} n Number of leading entries to consider; defaults to all.
 * @returns {Number} 0 for an empty input.
 */
function mtMedian( values, n )
{
   let len = (n === undefined) ? values.length : n;
   if ( len <= 0 )
      return 0;
   let a = new Float64Array( len );
   for ( let i = 0; i < len; ++i )
      a[i] = values[i];
   a.sort();
   let h = len >> 1;
   return (len & 1) ? a[h] : (a[h-1] + a[h])/2;
}

/**
 * Median absolute deviation, scaled to be consistent with the standard
 * deviation of a normal distribution.
 * @param {Number[]|Float64Array} values
 * @param {Number} median Precomputed median of the same data.
 * @param {Number} n Number of leading entries to consider; defaults to all.
 * @returns {Number}
 */
function mtMAD( values, median, n )
{
   let len = (n === undefined) ? values.length : n;
   if ( len <= 0 )
      return 0;
   let d = new Float64Array( len );
   for ( let i = 0; i < len; ++i )
      d[i] = Math.abs( values[i] - median );
   d.sort();
   let h = len >> 1;
   let mad = (len & 1) ? d[h] : (d[h-1] + d[h])/2;
   return 1.4826 * mad;
}

/**
 * @param {Number[]|Float64Array} values
 * @param {Number} n
 * @returns {Number}
 */
function mtMean( values, n )
{
   let len = (n === undefined) ? values.length : n;
   if ( len <= 0 )
      return 0;
   let s = 0;
   for ( let i = 0; i < len; ++i )
      s += values[i];
   return s/len;
}

// ----------------------------------------------------------------------------
// Coordinate formatting
// ----------------------------------------------------------------------------

/**
 * @param {Number} deg Right ascension in degrees
 * @returns {String} "hh mm ss.s"
 */
function mtFormatRA( deg )
{
   let h = deg / 15;
   while ( h < 0 )  h += 24;
   while ( h >= 24 ) h -= 24;
   let hh = Math.floor( h );
   let m = (h - hh) * 60;
   let mm = Math.floor( m );
   let ss = (m - mm) * 60;
   return format( "%02d %02d %04.1f", hh, mm, ss );
}

/**
 * @param {Number} deg Declination in degrees
 * @returns {String} "+dd mm ss"
 */
function mtFormatDec( deg )
{
   let sign = deg < 0 ? "-" : "+";
   let a = Math.abs( deg );
   let dd = Math.floor( a );
   let m = (a - dd) * 60;
   let mm = Math.floor( m );
   let ss = (m - mm) * 60;
   return format( "%s%02d %02d %02.0f", sign, dd, mm, ss );
}

// ----------------------------------------------------------------------------
// EOF MT_Globals.js
