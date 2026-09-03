// SPDX-License-Identifier: CC-BY-NC-4.0
// ----------------------------------------------------------------------------
// MT_Join.js - MosaicToolbox
//
// One photometric join: measure the scale, model the residual gradient, apply
// both to the target, and write it into the accumulating mosaic.
//
//   1. Find where the two tiles share sky.                     (MT_Overlap)
//   2. Detect the stars in that shared region.                 (MT_Photometry)
//   3. Per channel, fit the flux ratio -> scale factor m.      (MT_Photometry)
//   4. Sample the residual (ref - m*tgt) on a star-free grid
//      and fit a smoothed surface spline to it.                (MT_Gradient)
//   5. Add the modelled correction to the scaled target and
//      write it in, tapering the correction where the tile
//      reaches past the overlap.                               (MT_Gradient)
//
// Everything here is MosaicToolbox's own implementation of the published
// photometric-mosaic technique, built on core PixInsight objects
// (StarDetector, SurfaceSpline, Image). It is not derived from, and does not
// require, any third-party mosaic script.
// ----------------------------------------------------------------------------

/** @returns {Number} Stars kept for photometry, brightest first. */
function MT_MAX_PHOTOMETRY_STARS() { return 1500; }
/** @returns {Number} Squares across the overlap thickness, at minimum. */
function MT_MIN_SQUARES_ACROSS() { return 6; }

/**
 * Joins one tile onto the accumulating mosaic, in place.
 *
 * @param {View} mosaicView The accumulator. Modified.
 * @param {View} targetView The tile being added. Read only.
 * @param {MosaicToolboxData} data Settings.
 * @param {String} label Text for the console, e.g. "channel H, tile 3".
 * @returns {Object} Summary of what was measured, for the caller's log.
 */
function mtJoinTiles( mosaicView, targetView, data, label )
{
   let startTime = new Date().getTime();

   if ( !mosaicView || mosaicView.isNull )
      throw new Error( mtT( "err.joinNoReference" ) );
   if ( !targetView || targetView.isNull )
      throw new Error( mtT( "err.joinNoTarget" ) );

   let refImage = mosaicView.image;
   let tgtImage = targetView.image;

   if ( refImage.isColor !== tgtImage.isColor )
      throw new Error( format( mtT( "err.joinColourDepth" ),
                               mosaicView.fullId, targetView.fullId ) );
   if ( refImage.width !== tgtImage.width || refImage.height !== tgtImage.height )
      throw new Error( format( mtT( "err.joinDimensions" ),
                               mosaicView.fullId, targetView.fullId ) );

   const nCh = refImage.isColor ? 3 : 1;

   console.noteln( format( mtT( "\nReference: <b>%s</b>, Target: <b>%s</b>" ),
                           mosaicView.fullId, targetView.fullId ) );

   // ---- 1. geometry -------------------------------------------------------
   console.writeln( "<b><u>" + mtT( "Overlap" ) + "</u></b>" );
   CoreApplication.processEvents();
   let overlapTime = new Date().getTime();
   let overlap = new MT_Overlap( refImage, tgtImage );

   // Containment first: those cases are diagnosed from the bounding boxes alone,
   // and MT_Overlap deliberately does not build a mask for them - so hasOverlap()
   // would report "no overlap" and hide the real, more useful explanation.
   if ( overlap.targetIsContained() )
      throw new Error( format( mtT( "err.targetContained" ),
                               targetView.fullId, mosaicView.fullId ) );
   if ( overlap.referenceIsContained() )
      throw new Error( format( mtT( "err.referenceContained" ),
                               mosaicView.fullId, targetView.fullId ) );
   if ( !overlap.hasOverlap() )
   {
      // Flagged rather than diagnosed by its text: the caller re-words this case
      // when it already knew the two pieces should have met, and matching on a
      // translated message would only work in English.
      let e = new Error( format( mtT( "err.noOverlap" ),
                                 mosaicView.fullId, targetView.fullId ) );
      e.mtNoOverlap = true;
      throw e;
   }

   console.writeln( overlap.describe(), "  (", mtElapsed( overlapTime ), ")" );
   CoreApplication.processEvents();

   const thickness = overlap.thickness();

   // ---- 2. stars ----------------------------------------------------------
   console.writeln( "\n<b><u>" + mtT( "Stars" ) + "</u></b>" );
   let starTime = new Date().getTime();
   let stars = mtDetectStars( refImage, overlap.box, data.logStarDetection );
   stars = mtMergeStars( stars, mtDetectStars( tgtImage, overlap.box, data.logStarDetection ), 3 );

   // Every detected star matters for keeping the gradient samples clean - a
   // bright star just outside the shared band still throws its halo across it.
   // Only photometry needs the stricter test, since only photometry has to
   // measure the same aperture in both images.
   let rejectionStars = stars;
   let photometryStars = stars.filter(
      s => overlap.isShared( Math.round( s.x ), Math.round( s.y ) ) );
   let sharedStarCount = photometryStars.length;
   // StarDetector's flux is only used to rank candidates for the cut below.
   photometryStars.sort( (a, b) => b.flux - a.flux );
   if ( photometryStars.length > MT_MAX_PHOTOMETRY_STARS() )
      photometryStars = photometryStars.slice( 0, MT_MAX_PHOTOMETRY_STARS() );

   console.writeln( format( mtT( "%d detected, %d inside the shared band, %d used for photometry  (%s)" ),
                            rejectionStars.length, sharedStarCount,
                            photometryStars.length, mtElapsed( starTime ) ) );
   CoreApplication.processEvents();

   // ---- 3. photometric scale ---------------------------------------------
   console.writeln( "\n<b><u>" + mtT( "Scale" ) + "</u></b>" );
   // Measured over the shared pixels while the overlap mask was built, so this
   // costs nothing extra and cannot be set by a hot pixel elsewhere in the mosaic.
   let scales = [];
   let scaleReports = [];

   for ( let c = 0; c < nCh; ++c )
   {
      let result = mtScaleFromStars( refImage, tgtImage, photometryStars, c,
                                     mtLinearLimit( overlap.refMaximum[c] ),
                                     mtLinearLimit( overlap.tgtMaximum[c] ) );
      let how = "stars";
      if ( !result.ok )
      {
         let fallback = mtScaleFromPixels( refImage, tgtImage, overlap, c );
         if ( fallback.ok )
         {
            console.warningln( format( mtT( "Channel %d: only %d usable star pair(s); scale " +
                                            "estimated from the overlap pixels instead." ),
                                       c, result.n ) );
            result = { m: fallback.m, n: fallback.n, rejected: 0, scatter: 0, ok: true };
            how = "pixels";
         }
         else
         {
            console.warningln( format( mtT( "Channel %d: the scale could not be measured; " +
                                            "using 1.0. The join may show a brightness step." ), c ) );
            result = { m: 1, n: 0, rejected: 0, scatter: 0, ok: false };
            how = "assumed";
         }
      }
      scales.push( result.m );
      scaleReports.push( result );

      if ( how === "stars" )
         console.writeln( format( mtT( "Channel %d: x %.5f  (%d stars, %d rejected, %.2f%% scatter)" ),
                                  c, result.m, result.n, result.rejected, result.scatter ) );
      else if ( how === "pixels" )
         console.writeln( format( mtT( "Channel %d: x %.5f  (from %d overlap pixels)" ),
                                  c, result.m, result.n ) );
      else
         console.writeln( format( mtT( "Channel %d: x %.5f  (assumed)" ), c, result.m ) );
      CoreApplication.processEvents();
   }

   // ---- 4. gradient model -------------------------------------------------
   console.writeln( "\n<b><u>" + mtT( "Gradient" ) + "</u></b>" );
   let gradientTime = new Date().getTime();

   let sampleSize = data.sampleSize;
   let maxSampleSize = Math.floor( thickness/MT_MIN_SQUARES_ACROSS() );
   if ( sampleSize > maxSampleSize )
   {
      sampleSize = Math.max( 4, maxSampleSize );
      console.warningln( format( mtT( "Sample size %d is too large for a %d px overlap; " +
                                      "using %d here." ),
                                 data.sampleSize, thickness, sampleSize ) );
   }

   let squares = mtSampleSquares( overlap, rejectionStars, sampleSize,
                                  data.sampleStarGrowth, data.maxSamples );
   if ( squares.length < 4 )
      throw new Error( format( mtT( "err.fewSquares" ),
                               squares.length, mosaicView.fullId, targetView.fullId ) );

   let models = [];
   let splineReports = [];
   try
   {
      for ( let c = 0; c < nCh; ++c )
      {
         let refMedian = mtSampleMedians( refImage, squares, c );
         let tgtMedian = mtSampleMedians( tgtImage, squares, c );
         let residual = new Float64Array( squares.length );
         for ( let i = 0; i < squares.length; ++i )
            residual[i] = refMedian[i] - scales[c]*tgtMedian[i];

         let fit = mtFitResidualSpline( squares, residual, data.gradientSmoothness );
         models.push( fit.model );
         splineReports.push( fit );

         let centre = mtMedian( residual, residual.length );
         console.writeln( format( mtT( "Channel %d: %d samples (%d rejected), " +
                                       "median offset %.3e, spread %.3e" ),
                                  c, fit.used, fit.rejected, centre, fit.sigma ) );
         CoreApplication.processEvents();
      }
      console.writeln( format( mtT( "%d px squares, %s" ), sampleSize, mtElapsed( gradientTime ) ) );

      // ---- 5. apply -------------------------------------------------------
      console.writeln( "\n<b><u>" + mtT( "Applying" ) + "</u></b>" );
      let applyTime = new Date().getTime();

      let taperLength = data.useAutoTaper
                        ? Math.min( 2000, Math.max( 100, 2*thickness ) )
                        : data.taperLength;

      let fields = [];
      for ( let c = 0; c < nCh; ++c )
         fields.push( new MT_CorrectionField( models[c], overlap, overlap.tgtBox, taperLength ) );
      CoreApplication.processEvents();

      let stats;
      mosaicView.beginProcess( UndoFlag.NoSwapFile );
      try
      {
         if ( !mosaicView.window.isFloatSample )
            mosaicView.window.setSampleFormat( 32, true );

         stats = mtApplyJoin( mosaicView.image, tgtImage, overlap, scales, fields,
                              { joinMode: data.joinMode, joinSizePercent: data.joinSize } );

         if ( stats.pixelsWritten === 0 )
            throw new Error( mtT( "err.noPixels" ) );
         if ( stats.nonFinite > 0 )
         {
            let fraction = 100*stats.nonFinite/(stats.nonFinite + stats.pixelsWritten);
            let message = format( mtT( "%d pixel(s) (%.2f%%) of the corrected target were not " +
                                       "finite and were left untouched - the gradient model " +
                                       "diverged there." ),
                                  stats.nonFinite, fraction );
            if ( fraction > 1 )
               throw new Error( message + mtT( "err.tooManyNonFinite" ) );
            console.warningln( mtT( "Warning: " ) + message );
         }
         if ( stats.clamped > 0 )
            console.warningln( format( mtT( "Warning: %d pixel(s) (%.2f%%) fell outside [0,1] " +
                                            "(range %.5f to %.5f) and were clipped." ),
                                       stats.clamped, 100*stats.clamped/stats.pixelsWritten,
                                       stats.minimum, stats.maximum ) );

         let keywords = mosaicView.window.keywords;
         keywords.push( new FITSKeyword( "HISTORY", "",
            MT_TITLE() + " " + MT_VERSION() + ": joined " + targetView.fullId + " (" + label + ")" ) );
         for ( let c = 0; c < nCh; ++c )
            keywords.push( new FITSKeyword( "HISTORY", "",
               format( "%s.scale[%d]: %.6f (%d stars)", MT_TITLE().replace( / /g, "" ),
                       c, scales[c], scaleReports[c].n ) ) );
         keywords.push( new FITSKeyword( "HISTORY", "",
            format( "%s.gradient: %d samples, %d px squares, smoothness %.1f, taper %d px",
                    MT_TITLE().replace( / /g, "" ), splineReports[0].used, sampleSize,
                    data.gradientSmoothness, taperLength ) ) );
         keywords.push( new FITSKeyword( "HISTORY", "",
            format( "%s.join: %s, %s", MT_TITLE().replace( / /g, "" ),
                    [ "overlay", "random", "average" ][data.joinMode] || "overlay",
                    overlap.isHorizontal ? "horizontal" : "vertical" ) ) );
         mosaicView.window.keywords = keywords;
      }
      finally
      {
         mosaicView.endProcess();
      }

      console.writeln( format( mtT( "%d px written, taper %d px  (%s)" ),
                               stats.pixelsWritten, taperLength, mtElapsed( applyTime ) ) );
      console.noteln( mtT( "Join completed in " ), mtElapsed( startTime ) );
      CoreApplication.processEvents();

      return { scales: scales, stars: scaleReports[0].n, samples: splineReports[0].used,
               sampleSize: sampleSize, taperLength: taperLength,
               horizontal: overlap.isHorizontal };
   }
   finally
   {
      for ( let m of models )
         m.clear();
   }
}

// ----------------------------------------------------------------------------
// EOF MT_Join.js
