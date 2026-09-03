// SPDX-License-Identifier: CC-BY-NC-4.0
// ----------------------------------------------------------------------------
// MT_Astrometry.js - MosaicToolbox
//
// Builds ONE astrometric grid that covers every selected tile of every selected
// filter, reprojects each tile onto it, and erodes the soft edges that
// reprojection leaves behind.
//
// The grid computation (MT_MosaicGrid) is derived from MosaicByCoordinatesEngine.js
//   Copyright (c) 2013-2026 Andres del Pozo
//   Copyright (c) 2019-2026 Juan Conejero (PTeam)
// used under the PixInsight Class Library License 2.0:
//   https://pixinsight.com/license/PCL-License-2.0.html
// ----------------------------------------------------------------------------

/**
 * Reads the astrometric solution of a window.
 *
 * @param {ImageWindow} window
 * @param {Boolean} allowRegenerate Rebuild the solution from the FITS header when
 *        the window does not already carry one. Leave this false while merely
 *        scanning the workspace: regeneration is slow and marks windows modified,
 *        which is not something a read-only scan should do to images the user
 *        never intended to include.
 * @returns {AstrometricMetadata|null} null when the image is not plate solved.
 */
function mtExtractMetadata( window, allowRegenerate )
{
   if ( !window || window.isNull )
      return null;
   if ( allowRegenerate )
      try
      {
         if ( !window.hasAstrometricSolution )
            window.regenerateAstrometricSolution();
      }
      catch ( x )
      {
         // Not solvable from its header; ExtractMetadata below will report it.
      }
   let md = new AstrometricMetadata();
   try
   {
      md.ExtractMetadata( window );
   }
   catch ( x )
   {
      return null;
   }
   if ( !md.projection || !md.ref_I_G_linear )
      return null;
   return md;
}

// ----------------------------------------------------------------------------

/**
 * The common output grid shared by every tile and every filter.
 */
class MT_MosaicGrid
{
   /**
    * @param {MosaicToolboxData} data
    * @param {AstrometricMetadata[]} metadataList One entry per participating tile,
    *        across all channels. This is what guarantees that the channels end
    *        up with identical coordinates, field of view and dimensions.
    */
   constructor( data, metadataList )
   {
      if ( metadataList.length === 0 )
         throw new Error( mtT( "err.noSolutions" ) );

      this.metadata = metadataList;

      // Fields consumed by ProjectionFactory(). Names must match the ones
      // MosaicByCoordinates uses.
      this.projection = data.autoProjection ? Projection.Gnomonic
                                            : mtProjectionValue( data.projection );
      this.projectionOriginMode = 0;
      this.projectionOriginRA = 0;
      this.projectionOriginDec = 0;

      this.resolution = data.autoResolution ? 0 : data.resolutionArcsec/3600;
      this.rotation   = data.autoRotation ? 0 : data.rotation;
      this.centerRA   = data.autoCenter ? 0 : data.centerRA;
      this.centerDec  = data.autoCenter ? 0 : data.centerDec;
      this.width      = data.autoDimensions ? 0 : data.width;
      this.height     = data.autoDimensions ? 0 : data.height;

      this.autoResolution = data.autoResolution;
      this.autoRotation   = data.autoRotation;
      this.autoCenter     = data.autoCenter;
      this.autoProjection = data.autoProjection;
      this.autoDimensions = data.autoDimensions;

      /** @type AstrometricMetadata Reference metadata of the finished grid */
      this.referenceMetadata = null;
   }

   /**
    * Fills in every automatic parameter and builds this.referenceMetadata.
    */
   compute()
   {
      if ( this.autoResolution )
      {
         let minRes = this.metadata[0].resolution;
         for ( let i = 1; i < this.metadata.length; ++i )
            minRes = Math.min( minRes, this.metadata[i].resolution );
         this.resolution = minRes;
      }
      if ( !this.resolution || !isFinite( this.resolution ) || this.resolution <= 0 )
         throw new Error( mtT( "err.badResolution" ) );

      if ( this.autoRotation )
         this.rotation = this.metadata[0].GetRotation()[0];
      if ( !isFinite( this.rotation ) )
         throw new Error( mtT( "err.badRotation" ) );

      if ( this.autoCenter || this.autoProjection )
         this.#optimiseCenterAndProjection();

      while ( this.centerRA < 0 )    this.centerRA += 360;
      while ( this.centerRA >= 360 ) this.centerRA -= 360;

      if ( this.autoDimensions )
      {
         let probe = this.createMetadata( 0, 0 );
         let bounds = this.#unionBounds( probe );
         this.width  = Math.ceil( 2 * Math.max( Math.abs( bounds.x0 ), Math.abs( bounds.x1 ) ) )|0;
         this.height = Math.ceil( 2 * Math.max( Math.abs( bounds.y0 ), Math.abs( bounds.y1 ) ) )|0;
      }
      if ( !(this.width >= 1) || !(this.height >= 1) )
         throw new Error( format( mtT( "err.badDimensions" ), this.width, this.height ) );

      const MAX_PIXELS = 2.0e9;
      if ( this.width * this.height > MAX_PIXELS )
         throw new Error( format( mtT( "err.gridTooLarge" ), this.width, this.height ) );

      this.referenceMetadata = this.createMetadata( this.width, this.height );

      console.noteln( "\n<b><u>" + mtT( "Common mosaic grid" ) + "</u></b>" );
      console.writeln( format( mtT( "Centre     : RA %s  Dec %s" ),
                               mtFormatRA( this.centerRA ), mtFormatDec( this.centerDec ) ) );
      console.writeln( format( mtT( "Resolution : %.4f arcsec/px" ), this.resolution*3600 ) );
      console.writeln( format( mtT( "Rotation   : %.4f deg" ), this.rotation ) );
      console.writeln( format( mtT( "Dimensions : %d x %d px" ), this.width, this.height ) );
      console.flush();
   }

   /**
    * Union of every tile's footprint, in grid coordinates relative to `metadata0`.
    * @param {AstrometricMetadata} metadata0
    * @returns {Rect}
    */
   #unionBounds( metadata0 )
   {
      let bounds = null;
      for ( let md of this.metadata )
      {
         let b = ImageReprojection.reprojectedBounds( metadata0, md, new Point( -0.5 ) );
         if ( bounds )
            bounds.unite( b );
         else
            bounds = b;
      }
      return bounds;
   }

   #optimiseCenterAndProjection()
   {
      console.writeln( "\n<b><u>" + mtT( "Optimising the mosaic centre and area" ) + "</u></b>" );
      console.flush();

      let md0 = this.metadata[0];
      let x1 = this.autoCenter ? md0.ra : this.centerRA;
      let y1 = this.autoCenter ? md0.dec : this.centerDec;
      let x2 = x1;
      let y2 = y1;
      let maxField = 0;

      for ( let md of this.metadata )
      {
         let x = md.ra;
         while ( x < x1 - 180 ) x += 360;
         while ( x > x1 + 180 ) x -= 360;
         if ( x < x1 ) x1 = x;
         if ( x > x2 ) x2 = x;
         if ( md.dec < y1 ) y1 = md.dec;
         if ( md.dec > y2 ) y2 = md.dec;

         let f1 = md.DistanceI( new Point( 0, 0 ), new Point( md.width, md.height ) );
         let f2 = md.DistanceI( new Point( md.width, 0 ), new Point( 0, md.height ) );
         if ( isNaN( f1 ) || isNaN( f2 ) )
            maxField = 360;
         else
            maxField = Math.max( maxField, f1, f2 );
      }
      maxField += Math.max( x2 - x1, y2 - y1 );

      if ( this.autoProjection )
      {
         if ( maxField >= 180 )     this.projection = Projection.HammerAitoff;
         else if ( maxField > 90 )  this.projection = Projection.Stereographic;
         else if ( maxField > 10 )  this.projection = Projection.Mercator;
         else                       this.projection = Projection.Gnomonic;
      }

      if ( this.autoCenter )
      {
         this.centerRA  = (x1 + x2)/2;
         this.centerDec = (y1 + y2)/2;

         let dist = 1e6;
         for ( let i = 0; i < 20 && dist > 0.5; ++i )
         {
            let probe = this.createMetadata( 0, 0 );
            let bounds = this.#unionBounds( probe );
            let centerI = new Point( (bounds.x0 + bounds.x1)/2, (bounds.y0 + bounds.y1)/2 );
            let centerRD = probe.Convert_I_RD( centerI );
            if ( !centerRD )
               break;
            dist = Math.sqrt( centerI.x*centerI.x + centerI.y*centerI.y );
            this.centerRA  = (centerRD.x*2 + this.centerRA)/3;
            this.centerDec = (centerRD.y*2 + this.centerDec)/3;
            CoreApplication.processEvents();
         }
      }
   }

   /**
    * Builds the AstrometricMetadata of a grid of the given size.
    * @param {Number} width
    * @param {Number} height
    * @returns {AstrometricMetadata}
    */
   createMetadata( width, height )
   {
      let md = new AstrometricMetadata();
      // Note: MosaicByCoordinatesEngine 1.4.3 writes `this.centerRa` here, which
      // is a typo for `centerRA` and leaves metadata.ra undefined. Corrected.
      md.ra = this.centerRA;
      md.dec = this.centerDec;
      md.resolution = this.resolution;
      md.width = width;
      md.height = height;
      md.rotation = this.rotation;
      md.projection = ProjectionFactory( this, this.centerRA, this.centerDec );

      let rot = -FMath.rad( this.rotation );
      let cd1_1 = -this.resolution * FMath.cos( rot );
      let cd1_2 = -this.resolution * FMath.sin( rot );
      let cd2_1 = -this.resolution * FMath.sin( rot );
      let cd2_2 =  this.resolution * FMath.cos( rot );
      let crpix1 = width/2;
      let crpix2 = height/2;

      if ( this.projectionOriginMode === 1 )
      {
         let centerG = md.projection.Direct( new Point( this.centerRA, this.centerDec ) );
         if ( centerG === null )
            throw new Error( mtT( "err.badOrigin" ) );
         let Kx = cd1_1*crpix1 + cd1_2*crpix2 - centerG.x;
         let Ky = cd2_1*crpix1 + cd2_2*crpix2 - centerG.y;
         let det = cd1_2*cd2_1 - cd1_1*cd2_2;
         crpix1 = (Ky*cd1_2 - Kx*cd2_2)/det;
         crpix2 = (Kx*cd2_1 - Ky*cd1_1)/det;
      }

      md.ref_I_G = new Matrix( cd1_1, cd1_2, -cd1_1*crpix1 - cd1_2*crpix2,
                               cd2_1, cd2_2, -cd2_1*crpix1 - cd2_2*crpix2,
                               0, 0, 1 ).mul( new Matrix( 1,  0, 0,
                                                          0, -1, height,
                                                          0,  0, 1 ).inverse() );
      md.ref_G_I = md.ref_I_G.inverse();
      md.ref_I_G_linear = md.ref_I_G;
      return md;
   }

   /**
    * Pixel position of a tile's centre on the finished grid. Used to work out
    * the row/column layout of the mosaic. Deliberately computed from celestial
    * coordinates rather than from pixel bounds, so that it does not depend on
    * the coordinate convention of ImageReprojection.reprojectedBounds().
    *
    * @param {AstrometricMetadata} sourceMetadata
    * @returns {Point|null} null if the tile centre does not project onto the grid.
    */
   centreOnGrid( sourceMetadata )
   {
      try
      {
         return this.referenceMetadata.Convert_RD_I( new Point( sourceMetadata.ra, sourceMetadata.dec ) );
      }
      catch ( x )
      {
         return null;
      }
   }

   /**
    * Approximate size, in grid pixels, that a source tile occupies. Rotation
    * between the tile and the grid is ignored; this is only used to pick a
    * clustering tolerance, so a few percent does not matter.
    *
    * @param {AstrometricMetadata} sourceMetadata
    * @returns {Object} { width, height } in grid pixels
    */
   approxTileSizeOnGrid( sourceMetadata )
   {
      let k = sourceMetadata.resolution / this.resolution;
      return { width: sourceMetadata.width * k, height: sourceMetadata.height * k };
   }
}

// ----------------------------------------------------------------------------

/**
 * Reprojects one window onto the common grid.
 *
 * @param {MT_MosaicGrid} grid
 * @param {ImageWindow} sourceWindow
 * @param {String} outputId Requested identifier for the new window.
 * @param {Number} interpolation InterpolationAlgorithm.*
 * @param {Number} clamping
 * @returns {ImageWindow} A new, hidden window on the common grid.
 */
function mtReproject( grid, sourceWindow, outputId, interpolation, clamping )
{
   if ( !sourceWindow || sourceWindow.isNull )
      throw new Error( mtT( "err.sourceGone" ) );
   if ( !sourceWindow.hasAstrometricSolution )
      sourceWindow.regenerateAstrometricSolution();

   let warp = new ImageReprojection( interpolation, clamping, "_mt" );
   let out = warp.reprojectedImage( grid.referenceMetadata, sourceWindow, new Point( -0.5 ) );
   if ( !out || out.isNull )
      throw new Error( format( mtT( "err.reprojectionEmpty" ), sourceWindow.mainView.fullId ) );

   out.mainView.id = mtUniqueId( outputId );
   return out;
}

// ----------------------------------------------------------------------------

/**
 * Erodes `n` pixels from the outline of the non-zero region of an image, the
 * same operation TrimMosaicTile performs. Reprojection and integration both
 * leave partially covered pixels along the tile outline; leaving them in place
 * produces fine bright or dark lines at the joins.
 *
 * Scanning is limited to the tile's bounding box, so cost is proportional to
 * the tile, not to the (much larger) mosaic canvas.
 *
 * @param {View} view A main view; modified in place.
 * @param {Number} n Pixels to erode from every edge. <= 0 does nothing.
 */
function mtTrimEdges( view, n )
{
   if ( n <= 0 )
      return;
   if ( !view || view.isNull )
      return;

   // NoSwapFile: the tile being trimmed is a full mosaic canvas and it is thrown
   // away once it has been joined. Keeping an undo image of it would write
   // gigabytes to the swap directory for a state nobody can use.
   view.beginProcess( UndoFlag.NoSwapFile );
   try
   {
      let image = view.image;
      let nCh = image.isColor ? 3 : 1;
      let box = mtBoundingBox( image );
      if ( box.width <= 0 || box.height <= 0 )
         return;

      let use64 = image.bitsPerSample === 64;
      let makeBuf = len => use64 ? new Float64Array( len ) : new Float32Array( len );

      // ---- erode the left and right ends of every row --------------------
      {
         let w = box.width;
         let rect = new Rect( box.x0, box.y0, box.x1, box.y0 + 1 );
         let buf = [];
         for ( let c = 0; c < nCh; ++c )
            buf.push( makeBuf( w ) );

         for ( let y = box.y0; y < box.y1; ++y )
         {
            rect.moveTo( box.x0, y );
            for ( let c = 0; c < nCh; ++c )
               image.getSamples( buf[c], rect, c );

            let first = -1, last = -1;
            for ( let x = 0; x < w; ++x )
            {
               let occupied = false;
               for ( let c = 0; c < nCh; ++c )
                  if ( buf[c][x] !== 0 ) { occupied = true; break; }
               if ( occupied )
               {
                  if ( first < 0 )
                     first = x;
                  last = x;
               }
            }
            if ( first < 0 )
               continue;

            let a1 = Math.min( first + n, w );
            let b0 = Math.max( last - n + 1, 0 );
            for ( let c = 0; c < nCh; ++c )
            {
               for ( let x = first; x < a1; ++x )  buf[c][x] = 0;
               for ( let x = b0; x <= last; ++x )  buf[c][x] = 0;
               image.setSamples( buf[c], rect, c );
            }
         }
      }

      // ---- erode the top and bottom ends of every column -----------------
      {
         let h = box.height;
         let rect = new Rect( box.x0, box.y0, box.x0 + 1, box.y1 );
         let buf = [];
         for ( let c = 0; c < nCh; ++c )
            buf.push( makeBuf( h ) );

         for ( let x = box.x0; x < box.x1; ++x )
         {
            rect.moveTo( x, box.y0 );
            for ( let c = 0; c < nCh; ++c )
               image.getSamples( buf[c], rect, c );

            let first = -1, last = -1;
            for ( let y = 0; y < h; ++y )
            {
               let occupied = false;
               for ( let c = 0; c < nCh; ++c )
                  if ( buf[c][y] !== 0 ) { occupied = true; break; }
               if ( occupied )
               {
                  if ( first < 0 )
                     first = y;
                  last = y;
               }
            }
            if ( first < 0 )
               continue;

            let a1 = Math.min( first + n, h );
            let b0 = Math.max( last - n + 1, 0 );
            for ( let c = 0; c < nCh; ++c )
            {
               for ( let y = first; y < a1; ++y ) buf[c][y] = 0;
               for ( let y = b0; y <= last; ++y ) buf[c][y] = 0;
               image.setSamples( buf[c], rect, c );
            }
         }
      }

      // Record the trim in the header, in the form other mosaic tools recognise
      // as "this tile has had its soft edges eroded".
      let keywords = view.window.keywords;
      let tag = MT_TRIM_TAG();
      keywords.push( new FITSKeyword( "HISTORY", "", tag + ".target: " + view.fullId ) );
      keywords.push( new FITSKeyword( "HISTORY", "", tag + ".top: " + n ) );
      keywords.push( new FITSKeyword( "HISTORY", "", tag + ".bottom: " + n ) );
      keywords.push( new FITSKeyword( "HISTORY", "", tag + ".left: " + n ) );
      keywords.push( new FITSKeyword( "HISTORY", "", tag + ".right: " + n ) );
      keywords.push( new FITSKeyword( "HISTORY", "", MT_TITLE() + " " + MT_VERSION() + ": trimmed by " + n + " px" ) );
      view.window.keywords = keywords;
   }
   finally
   {
      view.endProcess();
   }
}

// ----------------------------------------------------------------------------
// EOF MT_Astrometry.js

// ----------------------------------------------------------------------------
// Autocrop
//
// The finished mosaics are the size of the common grid, so they carry an empty
// margin around the assembled panels - and, whenever the grid is rotated
// relative to the tiles, black wedges in the corners as well.
//
// Cropping to the bounding box of the data would barely help: a rotated mosaic's
// corners reach almost to the edge of the canvas, so the box is nearly the whole
// grid and every wedge survives. The crop therefore looks for the largest
// rectangle in which EVERY channel holds data everywhere - no wedges, no ragged
// edge, nothing left to trim by hand afterwards.
//
// It is computed ONCE from every channel together and then applied to all of
// them, so the outputs stay pixel-identical in geometry. That is the whole
// point: a per-channel crop would undo the one guarantee the common grid exists
// to provide.
// ----------------------------------------------------------------------------

/** @returns {Number} Target cell count for the coverage mask. */
function MT_COVERAGE_CELLS() { return 4.0e6; }

/**
 * A binned mask of the region covered by EVERY window.
 *
 * A cell is marked covered only when all of its pixels hold data in all of the
 * windows, so the mask is always a subset of the true covered region - the crop
 * derived from it can never include a black pixel.
 *
 * @param {ImageWindow[]} windows All the same size.
 * @param {Number} binning Pixels per cell.
 * @returns {Object} { mask: Uint8Array, cols, rows, binning }
 */
function mtCoverageMask( windows, binning )
{
   let image0 = windows[0].mainView.image;
   const W = image0.width;
   const H = image0.height;
   const cols = Math.floor( W/binning );
   const rows = Math.floor( H/binning );

   let mask = new Uint8Array( cols*rows );
   mask.fill( 1 );

   for ( let w of windows )
   {
      let image = w.mainView.image;
      const nCh = image.isColor ? 3 : 1;
      const use64 = image.bitsPerSample === 64;
      let rect = new Rect( 0, 0, cols*binning, 1 );
      let buf = [];
      for ( let c = 0; c < nCh; ++c )
         buf.push( use64 ? new Float64Array( cols*binning ) : new Float32Array( cols*binning ) );

      for ( let y = 0; y < rows*binning; ++y )
      {
         let j = Math.floor( y/binning );
         let jrow = j*cols;

         // Nothing left to disprove on this cell row: skip the read entirely.
         let anyLive = false;
         for ( let i = 0; i < cols; ++i )
            if ( mask[jrow + i] ) { anyLive = true; break; }
         if ( !anyLive )
            continue;

         rect.moveTo( 0, y );
         for ( let c = 0; c < nCh; ++c )
            image.getSamples( buf[c], rect, c );

         for ( let i = 0; i < cols; ++i )
         {
            if ( !mask[jrow + i] )
               continue;
            let x0 = i*binning;
            for ( let x = x0; x < x0 + binning; ++x )
            {
               let occupied = false;
               for ( let c = 0; c < nCh; ++c )
                  if ( buf[c][x] !== 0 ) { occupied = true; break; }
               if ( !occupied )
               {
                  mask[jrow + i] = 0;
                  break;
               }
            }
         }
         if ( (y & 255) === 0 )
            CoreApplication.processEvents();
      }
   }
   return { mask: mask, cols: cols, rows: rows, binning: binning };
}

/**
 * The largest axis-aligned all-ones rectangle in a binary mask.
 *
 * Standard maximal-rectangle-in-a-histogram sweep: one row at a time, keeping a
 * running column height and resolving it with a monotonic stack. Linear in the
 * number of cells.
 *
 * @param {Object} coverage From mtCoverageMask()
 * @returns {Rect|null} In IMAGE coordinates, or null if nothing is covered.
 */
function mtLargestCoveredRect( coverage )
{
   const cols = coverage.cols;
   const rows = coverage.rows;
   const mask = coverage.mask;
   const bin = coverage.binning;

   let heights = new Int32Array( cols + 1 );   // the extra entry sentinel-closes each row
   let stack = new Int32Array( cols + 1 );
   let best = { area: 0, i0: 0, i1: 0, j0: 0, j1: 0 };

   for ( let j = 0; j < rows; ++j )
   {
      let jrow = j*cols;
      for ( let i = 0; i < cols; ++i )
         heights[i] = mask[jrow + i] ? heights[i] + 1 : 0;
      heights[cols] = 0;

      let top = 0;
      for ( let i = 0; i <= cols; ++i )
      {
         while ( top > 0 && heights[stack[top-1]] >= heights[i] )
         {
            let h = heights[stack[--top]];
            let left = (top > 0) ? stack[top-1] + 1 : 0;
            let area = h * (i - left);
            if ( area > best.area && h > 0 )
            {
               best.area = area;
               best.i0 = left;
               best.i1 = i;
               best.j0 = j - h + 1;
               best.j1 = j + 1;
            }
         }
         stack[top++] = i;
      }
   }

   if ( best.area === 0 )
      return null;
   return new Rect( best.i0*bin, best.j0*bin, best.i1*bin, best.j1*bin );
}

/**
 * The crop rectangle to apply to every finished mosaic: the largest rectangle
 * fully covered by all of them.
 *
 * @param {ImageWindow[]} windows The finished mosaics, all the same size.
 * @returns {Object} { rect, note } - rect is null when nothing can be cropped.
 */
function mtComputeCommonCrop( windows )
{
   let live = windows.filter( w => w && !w.isNull );
   if ( live.length === 0 )
      return { rect: null, note: mtT( "no finished mosaics" ) };

   let image0 = live[0].mainView.image;
   const W = image0.width;
   const H = image0.height;

   let binning = Math.max( 1, Math.ceil( Math.sqrt( (W*H)/MT_COVERAGE_CELLS() ) ) );
   let coverage = mtCoverageMask( live, binning );
   let rect = mtLargestCoveredRect( coverage );
   if ( rect === null )
      return { rect: null, note: mtT( "the channels share no fully covered rectangle" ) };

   return { rect: rect,
            note: format( mtT( "largest rectangle covered by all %d channel(s), " +
                                "%d px search grid" ),
                          live.length, binning ) };
}

/**
 * Works out how to drive the Crop process on THIS PixInsight build.
 *
 * Crop's margin-mode enumeration is not named consistently across versions, and
 * guessing a constant that turns out not to exist means either a thrown error or
 * - worse - margins interpreted in the wrong units on a finished mosaic. So the
 * candidates are tried on a throwaway 64x64 image first and the winner is the
 * one that actually produces the requested size. Nothing is attempted on real
 * data until it is known to work.
 *
 * @returns {Object|null} { label, mode, relative } or null if the Crop process
 *          cannot be driven at all.
 */
function mtResolveCropMethod()
{
   if ( typeof Crop === "undefined" )
      return null;

   // Collect every plausible mode constant: by name, and by enumerating the
   // prototype for numeric members that look like margin modes.
   let absolute = [], relative = [];
   let seen = {};
   let consider = ( name ) =>
   {
      if ( seen[name] || Crop.prototype[name] === undefined ||
           typeof Crop.prototype[name] !== "number" )
         return;
      seen[name] = true;
      let k = name.toLowerCase();
      if ( k.indexOf( "pixel" ) >= 0 )
         absolute.push( { name: name, value: Crop.prototype[name] } );
      else if ( k.indexOf( "relative" ) >= 0 )
         relative.push( { name: name, value: Crop.prototype[name] } );
   };
   for ( let name of [ "AbsolutePixels", "AbsolutePixel", "Pixels",
                       "RelativeMargins", "Relative", "RelativeMargin" ] )
      consider( name );
   for ( let name in Crop.prototype )
      consider( name );

   let candidates = [];
   for ( let m of absolute )
      candidates.push( { label: "mode=" + m.name, mode: m.value, relative: false } );
   for ( let m of relative )
      candidates.push( { label: "mode=" + m.name + " (fractional margins)",
                         mode: m.value, relative: true } );
   candidates.push( { label: mtT( "default mode, pixel margins" ),
                      mode: null, relative: false } );
   candidates.push( { label: mtT( "default mode, fractional margins" ),
                      mode: null, relative: true } );

   const W = 64, H = 64;
   let probe = new Rect( 7, 5, 60, 50 );        // expect 53 x 45

   for ( let c of candidates )
   {
      let window = null;
      try
      {
         window = new ImageWindow( W, H, 1, 32, true, false, mtUniqueId( "MT_cropProbe" ) );
         if ( mtRunCrop( window, probe, c ) )
         {
            let image = window.mainView.image;
            if ( image.width === probe.width && image.height === probe.height )
            {
               mtForceClose( window );
               console.writeln( mtT( "Crop method: " ) + c.label );
               return c;
            }
         }
      }
      catch ( x )
      {
         // This candidate is not supported here; try the next.
      }
      finally
      {
         mtForceClose( window );
      }
   }
   return null;
}

/**
 * One attempt at the Crop process. Returns false rather than throwing when the
 * build rejects a parameter, so the probe above can move on.
 *
 * @param {ImageWindow} window
 * @param {Rect} rect
 * @param {Object} method From mtResolveCropMethod()
 * @returns {Boolean}
 */
function mtRunCrop( window, rect, method )
{
   let image = window.mainView.image;
   const W = image.width, H = image.height;
   let left = rect.x0, top = rect.y0;
   let right = W - rect.x1, bottom = H - rect.y1;

   let P = new Crop;
   if ( method.mode !== null )
      P.mode = method.mode;
   if ( method.relative )
   {
      P.leftMargin   = -left/W;
      P.rightMargin  = -right/W;
      P.topMargin    = -top/H;
      P.bottomMargin = -bottom/H;
   }
   else
   {
      P.leftMargin   = -left;
      P.rightMargin  = -right;
      P.topMargin    = -top;
      P.bottomMargin = -bottom;
   }
   try { P.noGUIMessages = true; } catch ( x ) { /* not in this build */ }

   return P.executeOn( window.mainView, false /*swapFile*/ );
}

/**
 * Crops a window by copying the pixels, for builds where the Crop process
 * cannot be driven at all.
 *
 * The astrometric reference pixel has to be corrected by hand here. FITS counts
 * rows from the BOTTOM while PixInsight counts them from the top, so CRPIX2
 * moves by whatever was removed from the bottom, not from the top.
 *
 * @param {ImageWindow} window
 * @param {Rect} rect
 */
function mtManualCrop( window, rect )
{
   let view = window.mainView;
   let image = view.image;
   const H = image.height;
   const nCh = image.isColor ? 3 : 1;
   const use64 = image.bitsPerSample === 64;

   let cropped = new Image( rect.width, rect.height, nCh, image.colorSpace );
   try
   {
      let src = new Rect( rect.x0, rect.y0, rect.x1, rect.y0 + 1 );
      let dst = new Rect( 0, 0, rect.width, 1 );
      let buf = use64 ? new Float64Array( rect.width ) : new Float32Array( rect.width );
      for ( let y = 0; y < rect.height; ++y )
      {
         src.moveTo( rect.x0, rect.y0 + y );
         dst.moveTo( 0, y );
         for ( let c = 0; c < nCh; ++c )
         {
            image.getSamples( buf, src, c );
            cropped.setSamples( buf, dst, c );
         }
         if ( (y & 511) === 0 )
            CoreApplication.processEvents();
      }

      view.beginProcess( UndoFlag.NoSwapFile );
      try
      {
         view.image.assign( cropped );

         // toFixed(), not format("%.6f"): format() is a printf wrapper and its
         // %f follows the process C locale, which on a French or German desktop
         // session emits a decimal comma. These two keywords carry the
         // astrometric reference pixel; a comma here is an invalid FITS card and
         // a destroyed solution. toFixed() is ECMAScript and always writes '.'.
         let keywords = view.window.keywords;
         for ( let k of keywords )
         {
            if ( k.name === "CRPIX1" )
               k.value = (k.numericValue - rect.x0).toFixed( 6 );
            else if ( k.name === "CRPIX2" )
               k.value = (k.numericValue - (H - rect.y1)).toFixed( 6 );
         }
         view.window.keywords = keywords;
      }
      finally
      {
         view.endProcess();
      }
   }
   finally
   {
      try { cropped.free(); } catch ( x ) { /* released on collection */ }
   }

   try
   {
      window.regenerateAstrometricSolution();
   }
   catch ( x )
   {
      console.warningln( format( mtT( "warn.noSolutionAfterCrop" ), view.fullId ) );
   }
}

/**
 * Crops a window to a rectangle, preserving the astrometric solution.
 *
 * @param {ImageWindow} window
 * @param {Rect} rect
 * @param {Object|null} method From mtResolveCropMethod(); null forces the
 *        manual pixel copy.
 * @returns {Boolean} True if the window was cropped.
 */
function mtApplyCrop( window, rect, method )
{
   let image = window.mainView.image;
   if ( rect.x0 <= 0 && rect.y0 <= 0 &&
        rect.x1 >= image.width && rect.y1 >= image.height )
      return false;

   if ( method !== null && method !== undefined )
   {
      if ( !mtRunCrop( window, rect, method ) )
         throw new Error( format( mtT( "err.cropFailed" ), window.mainView.fullId ) );
   }
   else
      mtManualCrop( window, rect );

   let out = window.mainView.image;
   if ( out.width !== rect.width || out.height !== rect.height )
      throw new Error( format( mtT( "err.cropWrongSize" ),
                               out.width, out.height, rect.width, rect.height,
                               window.mainView.fullId ) );
   return true;
}

// ----------------------------------------------------------------------------
// EOF MT_Astrometry.js (autocrop)

// ----------------------------------------------------------------------------
// Screen auto-stretch
//
// A finished linear mosaic is black on screen until a screen transfer function
// is attached. This applies the standard PixInsight auto-stretch - the same
// shadows-clipping and target-background rule the "nuclear button" uses - so the
// result is visible the moment it appears.
//
// It is a DISPLAY stretch only. No pixel is touched: the data stays linear and
// ready for channel combination, further gradient work, or whatever comes next.
//
// The statistics are gathered from the non-zero pixels inside the mosaic's data
// box rather than from the whole canvas. An uncropped mosaic is mostly black
// padding, and a median computed over that padding is essentially zero, which
// yields a stretch far too aggressive to be useful.
// ----------------------------------------------------------------------------

/** @returns {Number} Shadows clipping point, in normalised MAD units from the median. */
function MT_STRETCH_CLIPPING()  { return -2.80; }
/** @returns {Number} Target mean background, in the [0,1] range. */
function MT_STRETCH_BACKGROUND(){ return 0.25; }
/** @returns {Number} Roughly how many pixels to sample for the statistics. */
function MT_STRETCH_SAMPLES()   { return 200000; }

/**
 * The midtones transfer function.
 *
 * MTF is its own inverse in the sense used here: the midtones balance that maps
 * `x` to `target` is MTF(target, x), which is what makes the auto-stretch a
 * closed-form calculation rather than a search.
 *
 * @param {Number} m Midtones balance
 * @param {Number} x
 * @returns {Number}
 */
function mtMTF( m, x )
{
   if ( x <= 0 ) return 0;
   if ( x >= 1 ) return 1;
   if ( m === 0.5 ) return x;
   let d = (2*m - 1)*x - m;
   if ( d === 0 ) return 0.5;
   return ((m - 1)*x)/d;
}

/**
 * Median and normalised MAD of the non-zero pixels of one channel, inside `box`.
 *
 * @param {Image} image
 * @param {Rect} box
 * @param {Number} channel
 * @returns {Object} { median, mad, samples }
 */
function mtDataStatistics( image, box, channel )
{
   let area = box.width * box.height;
   let stride = Math.max( 1, Math.round( Math.sqrt( area/MT_STRETCH_SAMPLES() ) ) );
   let capacity = Math.ceil( box.width/stride ) * Math.ceil( box.height/stride ) + 16;

   let values = new Float64Array( capacity );
   let n = 0;

   let use64 = image.bitsPerSample === 64;
   let rect = new Rect( box.x0, box.y0, box.x1, box.y0 + 1 );
   let buf = use64 ? new Float64Array( box.width ) : new Float32Array( box.width );

   for ( let y = 0; y < box.height && n < capacity; y += stride )
   {
      rect.moveTo( box.x0, box.y0 + y );
      image.getSamples( buf, rect, channel );
      for ( let x = 0; x < box.width && n < capacity; x += stride )
         if ( buf[x] !== 0 )
            values[n++] = buf[x];
   }

   if ( n < 16 )
      return { median: 0, mad: 0, samples: n };

   let median = mtMedian( values, n );
   return { median: median, mad: mtMAD( values, median, n ), samples: n };
}

/**
 * Attaches an auto-stretch screen transfer function to a view.
 *
 * Nothing is written to the image; only the view's STF changes.
 *
 * @param {View} view
 * @returns {Object|null} { c0, m, samples } or null if it could not be computed.
 */
function mtAutoStretch( view )
{
   if ( !view || view.isNull )
      return null;
   if ( typeof ScreenTransferFunction === "undefined" )
      return null;

   let image = view.image;
   let n = image.isColor ? 3 : 1;
   let box = mtBoundingBox( image );
   if ( box.width <= 0 || box.height <= 0 )
      return null;

   let medians = [], mads = [], samples = 0;
   for ( let c = 0; c < n; ++c )
   {
      let s = mtDataStatistics( image, box, c );
      medians.push( s.median );
      mads.push( s.mad );
      samples = s.samples;
   }
   if ( samples < 16 )
      return null;

   // Channels are linked, which is PixInsight's own default: it keeps the colour
   // balance of an RGB mosaic intact instead of neutralising it on screen.
   let inverted = 0;
   for ( let c = 0; c < n; ++c )
      if ( medians[c] > 0.5 )
         ++inverted;

   let A;
   let report;
   if ( inverted < n )
   {
      let c0 = 0, m = 0;
      for ( let c = 0; c < n; ++c )
      {
         if ( mads[c] > 0 )
            c0 += medians[c] + MT_STRETCH_CLIPPING()*mads[c];
         m += medians[c];
      }
      c0 = Math.min( 1, Math.max( 0, c0/n ) );
      m = mtMTF( MT_STRETCH_BACKGROUND(), m/n - c0 );
      A = [ [ c0, 1, m, 0, 1 ], [ c0, 1, m, 0, 1 ], [ c0, 1, m, 0, 1 ], [ 0, 1, 0.5, 0, 1 ] ];
      report = { c0: c0, m: m, samples: samples };
   }
   else
   {
      let c1 = 0, m = 0;
      for ( let c = 0; c < n; ++c )
      {
         m += medians[c];
         c1 += (mads[c] > 0) ? (medians[c] - MT_STRETCH_CLIPPING()*mads[c]) : 1;
      }
      c1 = Math.min( 1, Math.max( 0, c1/n ) );
      m = mtMTF( c1 - m/n, MT_STRETCH_BACKGROUND() );
      A = [ [ 0, c1, m, 0, 1 ], [ 0, c1, m, 0, 1 ], [ 0, c1, m, 0, 1 ], [ 0, 1, 0.5, 0, 1 ] ];
      report = { c0: 0, m: m, samples: samples };
   }

   let stf = new ScreenTransferFunction;
   stf.STF = A;
   stf.executeOn( view );
   return report;
}

// ----------------------------------------------------------------------------
// EOF MT_Astrometry.js (auto-stretch)
