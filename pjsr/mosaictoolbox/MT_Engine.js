// SPDX-License-Identifier: CC-BY-NC-4.0
// ----------------------------------------------------------------------------
// MT_Engine.js - MosaicToolbox
//
// Orchestration:
//
//   1. Build ONE astrometric grid from every tile of every selected channel.
//   2. Work out the row / column layout of the mosaic once, from tile positions
//      on that grid. All channels then follow the identical join sequence.
//   3. For each channel: reproject its tiles onto the grid, erode the soft
//      edges, join the tiles into strips, then join the strips.
//   4. Name the result <prefix><channel> and restore its astrometric solution.
//
// Channels are processed one at a time. A reprojected tile is as large as the
// whole mosaic canvas, so holding every tile of every filter in memory at once
// is not viable for a real project.
// ----------------------------------------------------------------------------

class MosaicToolboxEngine
{
   /**
    * @param {MosaicToolboxData} data
    */
   constructor( data )
   {
      this.data = data;
      /** @type MT_MosaicGrid */
      this.grid = null;
      /** @type Object { strips, stripsAreRows, tileRects } - see mtComputeLayout() */
      this.layout = null;
      /** @type ImageWindow[] Everything we opened, for cleanup */
      this.temporaryWindows = [];
      /** @type Object[] { channel, id, ok, message } */
      this.results = [];
   }

   // -------------------------------------------------------------------------

   run()
   {
      let startTime = new Date().getTime();
      let data = this.data;

      let problem = data.validate();
      if ( problem )
         throw new Error( problem );

      for ( let w of data.warnings() )
         console.warningln( mtT( "Warning: " ) + w );

      this.#buildGrid();
      this.#buildLayout();
      this.#prepareImageScale();

      let channels = data.activeChannels();
      for ( let ch of channels )
      {
         let images = data.imagesForChannel( ch.key );
         if ( images.length === 0 )
            continue;

         console.noteln( "\n" + "=".repeat( 70 ) );
         console.noteln( format( mtT( "* Channel %s  (%d tile%s)" ), ch.key, images.length,
                                 images.length === 1 ? "" : "s" ) );
         console.noteln( "=".repeat( 70 ) );
         CoreApplication.processEvents();

         try
         {
            let finished = this.#processChannel( ch, images );
            this.results.push( { channel: ch.key, id: finished.mainView.fullId,
                                 window: finished, ok: true, message: "" } );
         }
         catch ( x )
         {
            let msg = x.message ? x.message : x.toString();
            if ( x.mtAborted )
            {
               console.warningln( "\n" + msg );
               this.results.push( { channel: ch.key, id: "", window: null,
                                    ok: false, message: mtT( "aborted" ) } );
               break;
            }
            console.criticalln( format( mtT( "*** Channel %s failed: " ), ch.key ) + msg );
            this.results.push( { channel: ch.key, id: "", window: null,
                                 ok: false, message: msg } );
         }
         CoreApplication.processEvents();
      }

      this.#autoCrop();
      this.#autoStretch();
      this.#report( startTime );
   }

   // -------------------------------------------------------------------------

   #buildGrid()
   {
      let images = this.data.activeImages();
      let metadata = [];
      for ( let im of images )
      {
         let view = im.view();
         if ( view === null )
            throw new Error( format( mtT( "err.windowGone" ), im.viewId ) );
         if ( !im.metadata )
            im.metadata = mtExtractMetadata( view.window, true /*allowRegenerate*/ );
         if ( !im.metadata )
            throw new Error( format( mtT( "err.noSolutionShort" ), im.viewId ) );
         metadata.push( im.metadata );
      }
      this.grid = new MT_MosaicGrid( this.data, metadata );
      this.grid.compute();
   }

   // -------------------------------------------------------------------------

   /**
    * Groups tile indices into strips using their position on the common grid.
    */
   #buildLayout()
   {
      this.layout = mtComputeLayout( this.data, this.grid );

      console.noteln( "\n<b><u>" + mtT( "Mosaic layout" ) + "</u></b>" );
      console.writeln( mtDescribeLayout( this.layout ) );
      console.flush();
   }

   // -------------------------------------------------------------------------

   /**
    * Works out the plate scale the reprojected tiles will actually have.
    *
    * After reprojection a tile is sampled at the grid's resolution, which is
    * generally not the resolution its own header describes. The reprojected
    * tiles get keywords that match the grid, keeping the finished mosaic's
    * metadata honest.
    */
   #prepareImageScale()
   {
      let focalLength = 0;
      for ( let im of this.data.activeImages() )
      {
         let view = im.view();
         if ( view === null )
            continue;
         focalLength = mtFitsNumber( view.window, "FOCALLEN", 0 );
         if ( focalLength )
            break;
      }
      if ( !focalLength )
         focalLength = 1000;

      this.focalLength = focalLength;
      this.pixelSize = mtPixelSizeForResolution( this.grid.resolution, focalLength );

      console.writeln( format( mtT( "\nEffective image scale: %.3f arcsec/px (%.2f um at %d mm)" ),
                               this.grid.resolution*3600, this.pixelSize, focalLength ) );
   }

   // -------------------------------------------------------------------------

   /**
    * Builds one channel: reproject its tiles onto the common grid, erode their
    * edges, join them into strips, then join the strips.
    *
    * @param {Object} ch { key, label, outputId }
    * @param {MT_Image[]} images
    * @returns {ImageWindow} The finished mosaic window.
    */
   #processChannel( ch, images )
   {
      let data = this.data;

      // Everything this channel opens. On failure it is all released here rather
      // than at the end of the run: a reprojected tile is a full mosaic canvas,
      // and holding a failed channel's tiles while the next channel runs is
      // exactly the memory blow-up this class is arranged to avoid.
      let owned = [];

      try
      {
         // ---- reproject and trim ------------------------------------------
         /** @type Object Map tileIndex -> ImageWindow */
         let tileWindows = {};

         for ( let i = 0; i < images.length; ++i )
         {
            let im = images[i];
            console.writeln( format( mtT( "\n* Reprojecting %s  (channel %s, tile %d of %d)" ),
                                     im.viewId, ch.key, i+1, images.length ) );
            CoreApplication.processEvents();

            mtCheckAbort();
            let source = im.view();
            if ( source === null )
               throw new Error( format( mtT( "err.windowGone" ), im.viewId ) );

            let id = "MT_" + mtSanitiseId( ch.key ) + "_t" + (im.tileIndex + 1);
            let w = mtReproject( this.grid, source.window, id,
                                 mtInterpolationValue( data.pixelInterpolation ),
                                 data.clampingThreshold );
            this.temporaryWindows.push( w );
            owned.push( w );

            mtSetPixelScaleKeywords( w, this.pixelSize, this.focalLength );

            if ( data.trimPixels > 0 )
            {
               console.writeln( format( mtT( "  Trimming %d px from the tile edges" ),
                                        data.trimPixels ) );
               CoreApplication.processEvents();
               mtTrimEdges( w.mainView, data.trimPixels );
            }
            tileWindows[im.tileIndex] = w;
         }

         // ---- split each strip into runs of tiles this channel actually has -
         //
         // A channel may be missing a tile that other channels have. Tiles on
         // either side of the gap do not overlap, so they cannot be joined
         // directly; each contiguous run becomes its own fragment and the
         // fragments are joined afterwards in an order that keeps them
         // connected.
         let fragments = [];
         for ( let s = 0; s < this.layout.strips.length; ++s )
         {
            let run = [];
            let flush = () =>
            {
               if ( run.length )
                  fragments.push( { strip: s, tiles: run } );
               run = [];
            };
            for ( let t of this.layout.strips[s].tiles )
            {
               if ( tileWindows[t] !== undefined )
                  run.push( t );
               else
                  flush();
            }
            flush();
         }
         if ( fragments.length === 0 )
            throw new Error( format( mtT( "err.nothingToJoin" ), ch.key ) );

         let gaps = fragments.length - this.layout.strips.filter(
            st => st.tiles.some( t => tileWindows[t] !== undefined ) ).length;
         if ( gaps > 0 )
            console.warningln( format( mtT( "Warning: channel %s is missing tiles inside a %s; " +
                                            "joining %d separate fragments." ), ch.key,
                                       mtT( this.layout.stripsAreRows ? "row" : "column" ),
                                       fragments.length ) );

         // ---- join the tiles of each fragment ------------------------------
         let fragmentWindows = [];
         for ( let f = 0; f < fragments.length; ++f )
         {
            let frag = fragments[f];
            let windows = frag.tiles.map( t => tileWindows[t] );
            let label = mtT( this.layout.stripsAreRows ? "row" : "column" ) + " " + (frag.strip + 1);
            console.noteln( format( mtT( "\n--- Channel %s, %s: joining tile%s %s ---" ), ch.key, label,
                                    windows.length === 1 ? "" : "s",
                                    frag.tiles.map( t => t+1 ).join( ", " ) ) );
            let fragId = "MT_" + mtSanitiseId( ch.key ) + "_" +
                         (this.layout.stripsAreRows ? "row" : "col") + (frag.strip + 1) +
                         (gaps > 0 ? "_" + (f+1) : "");
            let w = this.#joinSequence( windows, fragId );
            owned.push( w );
            fragmentWindows.push( { window: w, tiles: frag.tiles,
                                    rect: mtUnionTileRect( this.layout.tileRects, frag.tiles ) } );
         }

         // ---- join the fragments -------------------------------------------
         let ordered = mtOrderByConnectivity( fragmentWindows,
                                              mtT( this.layout.stripsAreRows ? "row" : "column" ),
                                              2 * Math.max( 0, data.trimPixels ) );
         if ( ordered.length > 1 )
            console.noteln( format( mtT( "\n--- Channel %s: joining %d %s ---" ), ch.key,
                                    ordered.length,
                                    mtT( this.layout.stripsAreRows ? "rows" : "columns" ) ) );

         let finalWindow;
         try
         {
            finalWindow = this.#joinSequence( ordered.map( o => o.window ), ch.outputId );
         }
         catch ( x )
         {
            // The connectivity pass already vetted these pairs against the tile
            // geometry, so "they do not overlap" here means that estimate was
            // wrong - the tile numbering is not the thing to go and look at.
            if ( x.mtNoOverlap )
               throw new Error( format( mtT( "err.fragmentsNoOverlap" ),
                                mtT( this.layout.stripsAreRows ? "rows" : "columns" ) ) );
            throw x;
         }
         owned.push( finalWindow );

         // ---- finish --------------------------------------------------------
         let view = finalWindow.mainView;
         // Replace, not append: the reprojected tile carried the source FILTER
         // keyword, and a FITS reader takes the first occurrence of a name.
         let keywords = finalWindow.keywords.filter( k => k.name !== "FILTER" );
         // A custom channel name is whatever the user typed, and a FITS
         // quoted-string card allows only ASCII 32-126 with no embedded quote -
         // so "Ha" or "Rouge e" survive, an apostrophe or an accent does not.
         // The window id is already sanitised separately by mtSanitiseId().
         let filterValue = ch.key.replace( /[^\x20-\x7E]/g, "" ).replace( /'/g, "" ).trim();
         if ( !filterValue.length )
            filterValue = "CUSTOM";
         keywords.push( new FITSKeyword( "FILTER", "'" + filterValue + "'",
                                         "Channel assembled by " + MT_TITLE() ) );
         keywords.push( new FITSKeyword( "HISTORY", "",
                        MT_TITLE() + " " + MT_VERSION() + ": channel " + ch.key + ", " +
                        images.length + " tiles on a " + this.grid.width + "x" +
                        this.grid.height + " grid" ) );
         finalWindow.keywords = keywords;

         if ( data.regenerateSolution )
         {
            try
            {
               finalWindow.regenerateAstrometricSolution();
            }
            catch ( x )
            {
               console.warningln( format( mtT( "warn.regenerateFailed" ), view.fullId,
                                          x.message ? x.message : ("" + x) ) );
            }
         }

         // The finished mosaic is no longer a temporary, and must also be out of
         // reach of the failure cleanup below - closing a completed channel
         // because zoomToFit() hiccuped would be a poor trade.
         this.temporaryWindows = this.temporaryWindows.filter( w => w !== finalWindow );
         owned = owned.filter( w => w !== finalWindow );

         finalWindow.show();
         finalWindow.zoomToFit();
         console.noteln( format( mtT( "\n* Channel %s -> <b>%s</b>" ), ch.key, view.fullId ) );
         return finalWindow;
      }
      catch ( x )
      {
         this.#releaseWindows( owned );
         throw x;
      }
   }

   // -------------------------------------------------------------------------

   /**
    * Closes the given windows and forgets them, unless the user asked to keep
    * the intermediates.
    * @param {ImageWindow[]} windows
    */
   #releaseWindows( windows )
   {
      for ( let w of windows )
      {
         this.temporaryWindows = this.temporaryWindows.filter( t => t !== w );
         if ( !w || w.isNull )
            continue;
         if ( this.data.keepIntermediates )
            w.show();
         else
            mtForceClose( w );
      }
   }

   // -------------------------------------------------------------------------

   /**
    * Joins a list of windows, left to right, accumulating into the first one.
    *
    * The accumulator is renamed up front and every join writes into it in
    * place, so the growing mosaic keeps one identity and one process history
    * for the whole sequence.
    *
    * @param {ImageWindow[]} windows At least one. Consumed.
    * @param {String} accumulatorId
    * @returns {ImageWindow} The accumulator.
    */
   #joinSequence( windows, accumulatorId )
   {
      let accumulator = windows[0];
      accumulator.mainView.id = mtUniqueId( accumulatorId );

      for ( let i = 1; i < windows.length; ++i )
      {
         mtCheckAbort();
         let target = windows[i];
         mtJoinTiles( accumulator.mainView, target.mainView, this.data,
                      accumulatorId + " + " + target.mainView.fullId );

         // Drop the consumed tile straight away: a reprojected tile is a full
         // mosaic canvas, and holding them all would exhaust memory on a real
         // project.
         this.#releaseWindows( [ target ] );
         CoreApplication.processEvents();
      }
      return accumulator;
   }


   // -------------------------------------------------------------------------

   /**
    * Crops every finished mosaic to the largest rectangle they all cover -
    * using ONE rectangle computed from all of them together, so the outputs stay
    * identical in geometry. Cropping each channel to its own data would quietly
    * undo the guarantee the common grid exists to provide.
    */
   #autoCrop()
   {
      if ( !this.data.autoCrop )
         return;

      let windows = this.results.filter( r => r.ok && r.window && !r.window.isNull )
                                .map( r => r.window );
      if ( windows.length === 0 )
         return;

      console.noteln( "\n<b><u>" + mtT( "Autocrop" ) + "</u></b>" );
      CoreApplication.processEvents();
      let startTime = new Date().getTime();

      try
      {
         let full = windows[0].mainView.image;
         const W = full.width, H = full.height;

         let result = mtComputeCommonCrop( windows );
         if ( result.rect === null )
         {
            console.warningln( mtT( "Warning: nothing to crop (" ) + result.note + ")." );
            return;
         }

         let rect = result.rect;
         if ( rect.width < 16 || rect.height < 16 )
         {
            console.warningln( format( mtT( "Warning: the computed crop is only %d x %d px; " +
                                            "leaving the mosaics uncropped." ),
                                       rect.width, rect.height ) );
            return;
         }
         if ( rect.x0 <= 0 && rect.y0 <= 0 && rect.x1 >= W && rect.y1 >= H )
         {
            console.writeln( mtT( "The mosaics already fill the grid; nothing to crop." ) );
            return;
         }

         console.writeln( format( mtT( "Basis : %s" ), result.note ) );
         console.writeln( format( mtT( "Crop  : %d x %d px at (%d,%d)  -  was %d x %d, keeping %.1f%%" ),
                                  rect.width, rect.height, rect.x0, rect.y0, W, H,
                                  100*(rect.width*rect.height)/(W*H) ) );

         // Establish HOW to crop before touching a finished mosaic. The probe
         // runs on a throwaway image, so a build whose Crop process cannot be
         // driven is discovered without risking the real data.
         let method = mtResolveCropMethod();
         if ( method === null )
            console.warningln( mtT( "The Crop process could not be driven on this build; " +
                                    "cropping by copying pixels instead." ) );
         CoreApplication.processEvents();

         let cropped = 0;
         for ( let w of windows )
         {
            if ( mtApplyCrop( w, rect, method ) )
            {
               let keywords = w.keywords;
               keywords.push( new FITSKeyword( "HISTORY", "",
                  format( "%s: autocrop to %d x %d at (%d,%d), fully covered by all channels",
                          MT_TITLE().replace( / /g, "" ),
                          rect.width, rect.height, rect.x0, rect.y0 ) ) );
               w.keywords = keywords;
               ++cropped;
            }
            w.zoomToFit();
            CoreApplication.processEvents();
         }
         console.writeln( format( mtT( "%d mosaic(s) cropped  (%s)" ),
                                  cropped, mtElapsed( startTime ) ) );
      }
      catch ( x )
      {
         // A failed crop must never cost the user the mosaics themselves.
         console.criticalln( mtT( "*** Autocrop failed: " ) + (x.message ? x.message : x) +
                             mtT( "  The mosaics are intact, just uncropped." ) );
      }
   }

   // -------------------------------------------------------------------------

   /**
    * Attaches an auto-stretch screen transfer function to every finished mosaic,
    * so the result is visible as soon as it appears.
    *
    * Runs after the crop, deliberately: the statistics of an uncropped mosaic are
    * dominated by its black padding. mtAutoStretch() measures only the data area
    * either way, but cropping first makes it exact.
    *
    * Display only. Not a single pixel is modified - the mosaics stay linear.
    */
   #autoStretch()
   {
      if ( !this.data.autoStretch )
         return;

      let windows = this.results.filter( r => r.ok && r.window && !r.window.isNull )
                                .map( r => r.window );
      if ( windows.length === 0 )
         return;

      console.noteln( "\n<b><u>" + mtT( "Screen stretch" ) + "</u></b>" );
      let applied = 0;
      for ( let w of windows )
      {
         try
         {
            let r = mtAutoStretch( w.mainView );
            if ( r === null )
               console.warningln( mtT( "Warning: could not compute a stretch for " ) +
                                  w.mainView.fullId + "." );
            else
            {
               console.writeln( format( "%-16s c0 = %.6f  m = %.6f", w.mainView.fullId, r.c0, r.m ) );
               ++applied;
            }
         }
         catch ( x )
         {
            console.warningln( format( mtT( "warn.stretchFailed" ), w.mainView.fullId,
                                       x.message ? x.message : ("" + x) ) );
         }
         CoreApplication.processEvents();
      }
      if ( applied )
         console.writeln( mtT( "Display only - the mosaics are still linear." ) );
   }

   // -------------------------------------------------------------------------

   #report( startTime )
   {
      console.noteln( "\n" + "=".repeat( 70 ) );
      console.noteln( format( mtT( "* %s summary" ), MT_TITLE() ) );
      console.noteln( "=".repeat( 70 ) );
      console.writeln( format( mtT( "Grid: %d x %d px, %.4f arcsec/px, centre RA %s Dec %s" ),
                               this.grid.width, this.grid.height, this.grid.resolution*3600,
                               mtFormatRA( this.grid.centerRA ), mtFormatDec( this.grid.centerDec ) ) );
      let ok = 0;
      for ( let r of this.results )
      {
         if ( r.ok )
         {
            ++ok;
            let size = "";
            if ( r.window && !r.window.isNull )
               size = format( "   (%d x %d px)", r.window.mainView.image.width,
                                                 r.window.mainView.image.height );
            console.noteln( "  " + r.channel + "  ->  " + r.id + size );
         }
         else
            console.criticalln( "  " + r.channel + "  ->  " + mtT( "FAILED: " ) + r.message );
      }
      if ( this.results.length === 0 )
         console.warningln( mtT( "  Nothing was assembled." ) );
      console.writeln( mtT( "\nTotal time " ), mtElapsed( startTime ) );

      if ( ok > 1 )
         console.noteln( format( mtT( "All %d mosaics share the same grid: identical " +
                                      "coordinates, field of view and dimensions." ), ok ) );
      console.flush();
   }

   // -------------------------------------------------------------------------

   dispose()
   {
      if ( this.data.keepIntermediates )
      {
         for ( let w of this.temporaryWindows )
            if ( w && !w.isNull )
               w.show();
      }
      else
      {
         for ( let w of this.temporaryWindows )
            mtForceClose( w );
      }
      this.temporaryWindows = [];
   }
}

// ----------------------------------------------------------------------------
// Layout
// ----------------------------------------------------------------------------

/**
 * Works out how the tiles are arranged on the common grid and in what order
 * they should be joined: tiles into strips first, then strip onto strip. This
 * is computed once from the tile geometry, which is shared by every channel, so
 * all channels follow exactly the same join sequence.
 *
 * @param {MosaicToolboxData} data
 * @param {MT_MosaicGrid} grid A grid whose compute() has already run.
 * @returns {Object} { strips: [{tiles:Number[], pos:Number}], stripsAreRows:Boolean }
 */
function mtComputeLayout( data, grid )
{
   // Tile footprints are shrunk by the edge trim, because that is the geometry
   // the joins will actually see: two tiles whose untrimmed footprints touch by
   // a few pixels share nothing at all once the edges have been eroded.
   let inset = Math.max( 0, data.trimPixels );
   // One representative image per tile index. Every channel's tile N covers the
   // same sky, so any of them describes the tile's position.
   let byTile = {};
   for ( let im of data.activeImages() )
      if ( byTile[im.tileIndex] === undefined )
         byTile[im.tileIndex] = im;

   let tiles = [];
   let tileRects = {};
   for ( let key in byTile )
   {
      let im = byTile[key];
      let c = grid.centreOnGrid( im.metadata );
      if ( c === null )
         throw new Error( format( mtT( "err.cannotProject" ), im.viewId ) );
      let s = grid.approxTileSizeOnGrid( im.metadata );
      tiles.push( { index: im.tileIndex, x: c.x, y: c.y, w: s.width, h: s.height } );
      // Never let the inset collapse or invert a small tile's rectangle.
      let ins = Math.min( inset, s.width/4, s.height/4 );
      tileRects[im.tileIndex] = { x0: c.x - s.width/2  + ins, y0: c.y - s.height/2 + ins,
                                  x1: c.x + s.width/2  - ins, y1: c.y + s.height/2 - ins };
   }
   tiles.sort( (a, b) => a.index - b.index );

   if ( tiles.length === 0 )
      throw new Error( mtT( "No tiles to lay out." ) );

   if ( tiles.length === 1 )
      return { strips: [ { tiles: [ tiles[0].index ], pos: 0 } ],
               stripsAreRows: true, tileRects: tileRects };

   let medW = mtMedian( tiles.map( t => t.w ) );
   let medH = mtMedian( tiles.map( t => t.h ) );
   let tol = data.stripTolerance;

   let rowGroups = mtCluster( tiles.map( t => ({ ref: t, v: t.y }) ), medH * tol );
   let colGroups = mtCluster( tiles.map( t => ({ ref: t, v: t.x }) ), medW * tol );

   // Fewer, longer strips give the gradient model more overlap to work with,
   // and match the established "rows first, then columns" mosaic workflow.
   let stripsAreRows = data.autoStripAxis ? (rowGroups.length <= colGroups.length)
                                          : data.stripAxisIsRows;
   let groups = stripsAreRows ? rowGroups : colGroups;

   // Order tiles along their strip, and the strips across the mosaic.
   let strips = groups.map( g =>
   {
      let members = g.slice();
      members.sort( (a, b) => stripsAreRows ? (a.ref.x - b.ref.x) : (a.ref.y - b.ref.y) );
      return { tiles: members.map( m => m.ref.index ),
               pos: mtMedian( members.map( m => stripsAreRows ? m.ref.y : m.ref.x ) ) };
   } );
   strips.sort( (a, b) => a.pos - b.pos );

   return { strips: strips, stripsAreRows: stripsAreRows, tileRects: tileRects };
}

/**
 * @param {Object} layout Result of mtComputeLayout()
 * @returns {String} Multi-line console description.
 */
function mtDescribeLayout( layout )
{
   if ( layout.strips.length === 1 && layout.strips[0].tiles.length === 1 )
      return mtT( "A single tile; no joins are required." );

   let lines = [ mtT( layout.stripsAreRows
                      ? "Joining tiles into rows, then joining the rows."
                      : "Joining tiles into columns, then joining the columns." ) ];
   for ( let i = 0; i < layout.strips.length; ++i )
      lines.push( format( mtT( "  %s %d: tiles %s" ),
                          mtT( layout.stripsAreRows ? "Row" : "Column" ), i+1,
                          layout.strips[i].tiles.map( t => t+1 ).join( ", " ) ) );
   return lines.join( "\n" );
}

// ----------------------------------------------------------------------------
// Fragment geometry
// ----------------------------------------------------------------------------

/**
 * Bounding rectangle, on the mosaic grid, of a set of tiles.
 *
 * @param {Object} tileRects Map tileIndex -> { x0, y0, x1, y1 }
 * @param {Number[]} tiles
 * @returns {Object} { x0, y0, x1, y1 }
 */
function mtUnionTileRect( tileRects, tiles )
{
   let r = null;
   for ( let t of tiles )
   {
      let a = tileRects[t];
      if ( !a )
         continue;
      if ( r === null )
         r = { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 };
      else
      {
         r.x0 = Math.min( r.x0, a.x0 );
         r.y0 = Math.min( r.y0, a.y0 );
         r.x1 = Math.max( r.x1, a.x1 );
         r.y1 = Math.max( r.y1, a.y1 );
      }
   }
   return r === null ? { x0: 0, y0: 0, x1: 0, y1: 0 } : r;
}

/**
 * Area shared by two rectangles.
 * @param {Object} a { x0, y0, x1, y1 }
 * @param {Object} b { x0, y0, x1, y1 }
 * @returns {Number} 0 when they do not intersect.
 */
function mtIntersectionArea( a, b )
{
   let w = Math.min( a.x1, b.x1 ) - Math.max( a.x0, b.x0 );
   let h = Math.min( a.y1, b.y1 ) - Math.max( a.y0, b.y0 );
   return (w > 0 && h > 0) ? w*h : 0;
}

/**
 * Orders the fragments of one channel so that each one overlaps the region
 * already assembled - without shared pixels there is nothing to measure a join
 * against.
 *
 * For a complete mosaic there is exactly one fragment per strip and this
 * reproduces the plain strip order, because only the neighbouring strip
 * overlaps the accumulated area. It only does something different when a
 * channel is missing tiles that the others have.
 *
 * @param {Object[]} fragments { window, tiles, rect }
 * @param {String} stripNoun "row" or "column", for the error message
 * @param {Number} slack Pixels by which the rectangles were shrunk to model the
 *        edge trim. Used only to tell "these pieces share no sky at all" apart
 *        from "the trim ate the last of their overlap" in the error message.
 * @returns {Object[]} The same objects, in join order.
 */
function mtOrderByConnectivity( fragments, stripNoun, slack )
{
   if ( fragments.length <= 1 )
      return fragments.slice();

   let remaining = fragments.slice();
   let first = remaining.shift();
   let ordered = [ first ];
   let accumulated = { x0: first.rect.x0, y0: first.rect.y0, x1: first.rect.x1, y1: first.rect.y1 };

   while ( remaining.length > 0 )
   {
      let best = -1;
      let bestArea = 0;
      for ( let i = 0; i < remaining.length; ++i )
      {
         let area = mtIntersectionArea( accumulated, remaining[i].rect );
         if ( area > bestArea )
         {
            bestArea = area;
            best = i;
         }
      }
      if ( best < 0 )
      {
         let stranded = remaining.map( f => f.tiles.map( t => t+1 ).join( "+" ) ).join( ", " );
         let margin = Math.max( 0, slack || 0 );
         let relaxed = { x0: accumulated.x0 - margin, y0: accumulated.y0 - margin,
                         x1: accumulated.x1 + margin, y1: accumulated.y1 + margin };
         let wouldReachWithoutTrim = remaining.some(
            f => mtIntersectionArea( relaxed, { x0: f.rect.x0 - margin, y0: f.rect.y0 - margin,
                                                x1: f.rect.x1 + margin, y1: f.rect.y1 + margin } ) > 0 );
         if ( wouldReachWithoutTrim )
            throw new Error( format( mtT( "err.trimTooTight" ), stranded ) );
         throw new Error( format( mtT( "err.stranded" ), stranded, stripNoun ) );
      }
      let next = remaining[best];
      ordered.push( next );
      accumulated.x0 = Math.min( accumulated.x0, next.rect.x0 );
      accumulated.y0 = Math.min( accumulated.y0, next.rect.y0 );
      accumulated.x1 = Math.max( accumulated.x1, next.rect.x1 );
      accumulated.y1 = Math.max( accumulated.y1, next.rect.y1 );
      remaining.splice( best, 1 );
   }
   return ordered;
}

// ----------------------------------------------------------------------------
// Small numeric helpers
// ----------------------------------------------------------------------------

/**
 * One dimensional clustering: consecutive items are kept in the same group
 * while they stay within `tolerance` of the group's running mean.
 *
 * @param {Object[]} items { ref, v }
 * @param {Number} tolerance
 * @returns {Object[][]} Groups, in ascending order of v.
 */
function mtCluster( items, tolerance )
{
   if ( items.length === 0 )
      return [];
   let sorted = items.slice().sort( (a, b) => a.v - b.v );
   let groups = [];
   let current = [ sorted[0] ];
   let sum = sorted[0].v;

   for ( let i = 1; i < sorted.length; ++i )
   {
      let mean = sum / current.length;
      if ( Math.abs( sorted[i].v - mean ) <= tolerance )
      {
         current.push( sorted[i] );
         sum += sorted[i].v;
      }
      else
      {
         groups.push( current );
         current = [ sorted[i] ];
         sum = sorted[i].v;
      }
   }
   groups.push( current );
   return groups;
}

/**
 * The pixel size, in microns, that reproduces a given plate scale at a given
 * focal length.
 *
 * @param {Number} resolutionDeg Degrees per pixel
 * @param {Number} focalLengthMm
 * @returns {Number} Pixel size in microns
 */
function mtPixelSizeForResolution( resolutionDeg, focalLengthMm )
{
   return FMath.rad( resolutionDeg ) * (focalLengthMm * 1.0e-3) / 1.0e-6;
}

/**
 * Writes XPIXSZ / YPIXSZ / FOCALLEN so that anything reading the reprojected
 * image sees its real plate scale rather than that of its source.
 *
 * @param {ImageWindow} window
 * @param {Number} pixelSizeMicrons
 * @param {Number} focalLengthMm
 */
function mtSetPixelScaleKeywords( window, pixelSizeMicrons, focalLengthMm )
{
   let keywords = [];
   for ( let k of window.keywords )
      if ( k.name !== "XPIXSZ" && k.name !== "YPIXSZ" && k.name !== "FOCALLEN" )
         keywords.push( k );
   keywords.push( new FITSKeyword( "XPIXSZ", pixelSizeMicrons.toFixed( 4 ),
                                   "Effective pixel size after reprojection (um)" ) );
   keywords.push( new FITSKeyword( "YPIXSZ", pixelSizeMicrons.toFixed( 4 ),
                                   "Effective pixel size after reprojection (um)" ) );
   keywords.push( new FITSKeyword( "FOCALLEN", focalLengthMm.toFixed( 0 ), "Focal length (mm)" ) );
   window.keywords = keywords;
}

// ----------------------------------------------------------------------------
// EOF MT_Engine.js
