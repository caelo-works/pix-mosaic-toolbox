// ---- PixInsight globals the bundled modules touch ----
//
// Only what the pure-logic layer actually reaches for at the level the harness
// drives it: the printf, the console's abort flag, the small geometry value
// types (Rect, Point), FMath, the two core enumerations, and a view registry.
// Anything deeper — Image, SurfaceSpline, StarDetector, AstrometricMetadata,
// ImageReprojection, the GUI — is a PixInsight-facing path exercised by hand,
// and is stubbed here only enough that the modules defining functions over it
// load without a ReferenceError.

// PixInsight's printf. The coordinate formatters and every console line lean on
// it, so the shim rounds exactly as C does — a shim that formatted differently
// would make the tests agree with themselves and with nothing else.
function format( fmt )
{
   var args = Array.prototype.slice.call( arguments, 1 );
   if ( args.length === 1 && Array.isArray( args[0] ) )
      args = args[0];
   var i = 0;
   return String( fmt ).replace( /%([-+0 ]*)(\d+)?(?:\.(\d+))?([dfsge])/g,
      function ( _, flags, width, prec, conv )
      {
         var v = args[i++], out, neg = false;
         switch ( conv )
         {
         case 'd': out = String( Math.round( Number( v ) ) ); break;
         case 'f': out = Number( v ).toFixed( prec === undefined ? 6 : Number( prec ) ); break;
         case 'e': out = Number( v ).toExponential( prec === undefined ? 6 : Number( prec ) ); break;
         case 'g': out = String( Number( v ) ); break;
         default:  out = String( v );
         }
         if ( conv !== 's' && flags.indexOf( '+' ) >= 0 && Number( v ) >= 0 )
            out = '+' + out;
         if ( width )
         {
            var w = Number( width );
            var left = flags.indexOf( '-' ) >= 0;
            var zero = flags.indexOf( '0' ) >= 0 && !left && conv !== 's';
            if ( zero && out.charAt( 0 ) === '-' ) { neg = true; out = out.slice( 1 ); w -= 1; }
            while ( out.length < w )
               out = left ? out + ' ' : ( zero ? '0' : ' ' ) + out;
            if ( neg )
               out = '-' + out;
         }
         return out;
      } );
}

// The console. Abort is the only state the pure layer reads (mtCheckAbort);
// everything else is a no-op that a test can inspect if it wants.
var __mtConsole = { notes: [], warnings: [], errors: [] };
var console = {
   write:        function () {},
   writeln:      function () {},
   noteln:       function ( s ) { __mtConsole.notes.push( String( s ) ); },
   warningln:    function ( s ) { __mtConsole.warnings.push( String( s ) ); },
   criticalln:   function ( s ) { __mtConsole.errors.push( String( s ) ); },
   show:         function () {},
   hide:         function () {},
   flush:        function () {},
   abortEnabled: false,
   abortRequested: false
};
function mtTestConsole() { return __mtConsole; }
function mtTestConsoleReset() { __mtConsole = { notes: [], warnings: [], errors: [] }; console.abortRequested = false; }

// FMath: only the trig and the angle conversions are reached from the pure
// layer (mtPixelSizeForResolution, mtAngularDistance).
var FMath = {
   rad:  function ( d ) { return d*Math.PI/180; },
   deg:  function ( r ) { return r*180/Math.PI; },
   sin:  Math.sin, cos: Math.cos, tan: Math.tan,
   asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
   sqrt: Math.sqrt, abs: Math.abs
};

// Rect and Point: PixInsight value types, closed over integer or real bounds.
// mtLargestCoveredRect constructs a Rect from a covered region; the geometry
// helpers read x0/y0/x1/y1 and the derived width/height/area/center.
function Point( x, y ) { this.x = x; this.y = y; }
Point.prototype.toString = function () { return 'Point(' + this.x + ',' + this.y + ')'; };

function Rect( x0, y0, x1, y1 )
{
   this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
}
Object.defineProperties( Rect.prototype, {
   width:  { get: function () { return this.x1 - this.x0; } },
   height: { get: function () { return this.y1 - this.y0; } },
   area:   { get: function () { return ( this.x1 - this.x0 ) * ( this.y1 - this.y0 ); } },
   center: { get: function () { return new Point( ( this.x0 + this.x1 )/2, ( this.y0 + this.y1 )/2 ); } }
} );
Rect.prototype.isNormal    = function () { return this.x1 >= this.x0 && this.y1 >= this.y0; };
Rect.prototype.isEmpty     = function () { return this.x1 <= this.x0 || this.y1 <= this.y0; };
Rect.prototype.moveTo      = function ( x, y ) { var w = this.width, h = this.height; this.x0 = x; this.y0 = y; this.x1 = x+w; this.y1 = y+h; };
Rect.prototype.translateBy = function ( dx, dy ) { this.x0 += dx; this.y0 += dy; this.x1 += dx; this.y1 += dy; };
Rect.prototype.unite       = function ( r ) { return new Rect( Math.min( this.x0, r.x0 ), Math.min( this.y0, r.y0 ), Math.max( this.x1, r.x1 ), Math.max( this.y1, r.y1 ) ); };
Rect.prototype.intersection = function ( r ) { return new Rect( Math.max( this.x0, r.x0 ), Math.max( this.y0, r.y0 ), Math.min( this.x1, r.x1 ), Math.min( this.y1, r.y1 ) ); };
Rect.prototype.toString    = function () { return 'Rect(' + this.x0 + ',' + this.y0 + ',' + this.x1 + ',' + this.y1 + ')'; };

// The two core enumerations, resolved by NAME. The numbers are arbitrary and
// deliberately not 0-based for the first entry, so a test that asserted on a
// raw enum value rather than a name would fail loudly. mtEnumValue/mtEnumItems
// only ever read them by member name.
var InterpolationAlgorithm = {
   Auto: 100, Lanczos4: 101, Lanczos3: 102, BicubicSpline: 103, BicubicBSpline: 104,
   MitchellNetravaliFilter: 105, CatmullRomSplineFilter: 106, Bilinear: 107, NearestNeighbor: 108
};
var Projection = {
   Gnomonic: 200, Stereographic: 201, PlateCarree: 202, Mercator: 203,
   HammerAitoff: 204, ZenithalEqualArea: 205, Orthographic: 206
};

// A view registry, so the identifier helpers (mtViewById, mtUniqueId) and the
// data model's availability check can be driven without PixInsight.
var __mtViews = {};
var View = {
   viewById: function ( id )
   {
      return __mtViews[id] ? { id: id, isNull: false } : null;
   }
};
function mtTestSetViews( ids )
{
   __mtViews = {};
   ( ids || [] ).forEach( function ( id ) { __mtViews[id] = true; } );
}

// The event pump; nothing to pump under node.
var CoreApplication = { processEvents: function () {} };
function processEvents() {}

// ---- Deep PixInsight objects: presence stubs only ----
//
// The modules define functions and classes over these, but the pure layer the
// harness drives never calls the paths that use them. They exist here so that
// loading a module which merely *names* one at definition time cannot throw.
var Matrix = function () {};
var Vector = function () {};
var SurfaceSpline = function () {};
var StarDetector = function () {};
var Image = function () {};
var ImageWindow = { windows: [], windowById: function () { return { isNull: true }; } };
var ImageReprojection = function () {};
var AstrometricMetadata = function () {};
var ProjectionFactory = { Create: function () { return {}; } };
var ScreenTransferFunction = function () {};
var Crop = function () {};
var FITSKeyword = function () {};
var UndoFlag = { NoSwapFile: 0, DefaultMode: 0 };
var MessageBox = function () {};
var StdIcon = {}, StdButton = {}, StdCursor = {};
var Settings = { read: function () {}, write: function () {}, lastReadOK: true };
var DataType = { Boolean: 0, Int8: 1, UInt8: 2, Int16: 3, UInt16: 4, Int32: 5, UInt32: 6,
                 Int64: 7, UInt64: 8, Float: 9, Double: 10, UCString: 11, String: 12 };
