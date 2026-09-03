// SPDX-License-Identifier: CC-BY-NC-4.0
// ----------------------------------------------------------------------------
// MT_Gradient.js - MosaicToolbox
//
// Models the brightness difference left between two tiles after the photometric
// scale has been applied, and writes the corrected target into the mosaic.
//
// The model is a smoothed surface spline fitted to the residual measured over a
// grid of star-free sample squares inside the overlap.
//
// Beyond the overlap the spline is NOT extrapolated. A thin-plate spline
// diverges quickly outside the region it was fitted on, and a mosaic tile
// usually extends far past its overlap. Instead the correction is held at its
// value along the overlap edge and then faded, over `taperLength` pixels, into a
// single constant - the mean of that edge. So the correction is continuous at
// the edge, follows the measured gradient where it was measured, and degrades
// into a plain pedestal offset where there is nothing left to measure.
// ----------------------------------------------------------------------------

/** @returns {Number} Spacing of the lattice on which the correction is evaluated. */
function MT_FIELD_STEP() { return 16; }

// ----------------------------------------------------------------------------
// Sample grid
// ----------------------------------------------------------------------------

/**
 * Lays out the star-free sample squares of the overlap.
 *
 * A square is kept only when every one of its pixels is shared by both images
 * and it is clear of every detected star, grown by `growth`. Partial squares
 * would mix real signal with the black surround and bias the residual.
 *
 * @param {MT_Overlap} overlap
 * @param {Object[]} stars Detected stars, image coordinates.
 * @param {Number} sampleSize Side of a square, in pixels.
 * @param {Number} growth Star rejection radius = growth * star radius + 2 px.
 * @param {Number} maxSamples Decimate uniformly above this count.
 * @returns {Rect[]}
 */
function mtSampleSquares( overlap, stars, sampleSize, growth, maxSamples )
{
   const box = overlap.sharedRegion();
   const S = Math.max( 2, Math.round( sampleSize ) );
   const cols = Math.floor( box.width / S );
   const rows = Math.floor( box.height / S );
   if ( cols < 1 || rows < 1 )
      return [];

   // Bucket the stars by sample square so the rejection test stays local.
   let rejected = new Uint8Array( cols * rows );
   for ( let s of stars )
   {
      let r = growth*s.radius + 2;
      let i0 = Math.floor( (s.x - r - box.x0)/S );
      let i1 = Math.floor( (s.x + r - box.x0)/S );
      let j0 = Math.floor( (s.y - r - box.y0)/S );
      let j1 = Math.floor( (s.y + r - box.y0)/S );
      for ( let j = Math.max( 0, j0 ); j <= Math.min( rows-1, j1 ); ++j )
         for ( let i = Math.max( 0, i0 ); i <= Math.min( cols-1, i1 ); ++i )
            rejected[j*cols + i] = 1;
   }

   // A square survives only if the whole of it is shared. The mask is indexed
   // relative to overlap.box, which `box` may be a sub-rectangle of.
   const maskWidth = overlap.box.width;
   const offsetX = box.x0 - overlap.box.x0;
   const offsetY = box.y0 - overlap.box.y0;
   let complete = new Uint8Array( cols * rows );
   complete.fill( 1 );
   for ( let y = 0; y < rows*S; ++y )
   {
      let j = Math.floor( y/S );
      let row = (y + offsetY) * maskWidth + offsetX;
      let jrow = j * cols;
      for ( let i = 0; i < cols; ++i )
      {
         if ( !complete[jrow + i] )
            continue;
         let x0 = i*S;
         for ( let x = x0; x < x0 + S; ++x )
            if ( overlap.mask[row + x] === 0 )
            {
               complete[jrow + i] = 0;
               break;
            }
      }
   }

   let kept = [];
   for ( let j = 0; j < rows; ++j )
      for ( let i = 0; i < cols; ++i )
         if ( complete[j*cols + i] && !rejected[j*cols + i] )
            kept.push( { i: i, j: j } );

   // Decimate by position in the kept list, not by lattice index. Filtering on
   // `i % stride` would throw away up to 4x more than asked for - and could
   // empty the set entirely if the surviving squares all sat on odd indices.
   if ( maxSamples > 0 && kept.length > maxSamples )
   {
      let step = Math.ceil( kept.length/maxSamples );
      kept = kept.filter( ( c, k ) => k % step === 0 );
   }

   return kept.map( c => new Rect( box.x0 + c.i*S, box.y0 + c.j*S,
                                   box.x0 + c.i*S + S, box.y0 + c.j*S + S ) );
}

/**
 * Median of one channel inside each square.
 *
 * @param {Image} image
 * @param {Rect[]} squares
 * @param {Number} channel
 * @returns {Float64Array}
 */
function mtSampleMedians( image, squares, channel )
{
   let out = new Float64Array( squares.length );
   if ( squares.length === 0 )
      return out;

   const area = squares[0].area;
   let buf = (image.bitsPerSample === 64) ? new Float64Array( area ) : new Float32Array( area );
   for ( let i = 0; i < squares.length; ++i )
   {
      image.getSamples( buf, squares[i], channel );
      out[i] = mtMedian( buf, area );
   }
   return out;
}

// ----------------------------------------------------------------------------
// Surface spline
// ----------------------------------------------------------------------------

/**
 * Evaluates a surface spline at an array of points, normalising the several
 * shapes PixInsight versions return (Array, Vector, or an object with toArray).
 *
 * @param {SurfaceSpline} spline
 * @param {Point[]} points
 * @returns {Float64Array}
 */
function mtEvaluateSpline( spline, points )
{
   let out = new Float64Array( points.length );
   if ( points.length === 0 )
      return out;
   let r = spline.evaluate( points );
   if ( r === undefined || r === null )
      return out;
   if ( typeof r.toArray === "function" )
      r = r.toArray();
   if ( typeof r.at === "function" && r.length === undefined )
   {
      for ( let i = 0; i < points.length; ++i )
         out[i] = r.at( i );
      return out;
   }
   for ( let i = 0; i < points.length; ++i )
      out[i] = r[i];
   return out;
}

/**
 * A fitted gradient model: a surface spline over normalised residuals, plus the
 * scale needed to turn its output back into pixel values.
 *
 * The residuals are divided by their own robust sigma before fitting. That makes
 * the smoothing parameter mean the same thing on every data set - "the fit may
 * deviate from the samples by about this many sigma" - instead of depending on
 * how bright the images happen to be.
 */
class MT_GradientModel
{
   /**
    * @param {SurfaceSpline} spline Fitted on residual/zScale.
    * @param {Number} zScale Robust sigma the residuals were divided by.
    */
   constructor( spline, zScale )
   {
      this.spline = spline;
      this.zScale = zScale;
   }

   /**
    * @param {Point[]} points
    * @returns {Float64Array} Correction in pixel values.
    */
   evaluate( points )
   {
      let v = mtEvaluateSpline( this.spline, points );
      if ( this.zScale !== 1 )
         for ( let i = 0; i < v.length; ++i )
            v[i] *= this.zScale;
      return v;
   }

   clear()
   {
      try { this.spline.clear(); } catch ( x ) { /* released on collection */ }
   }
}

/**
 * Fits the residual surface, rejecting outlying samples on a second pass.
 *
 * The first fit is used only to find samples that disagree with their
 * neighbourhood - a satellite trail, a bright halo, an uncaught star - which are
 * then dropped and the spline refitted. Clipping against the fit rather than
 * against the global median is what makes this safe: a real, large gradient is
 * followed rather than rejected.
 *
 * @param {Rect[]} squares
 * @param {Float64Array} z Residual per square, in pixel values.
 * @param {Number} logSmoothing Log10 of the spline smoothing, in units of the
 *        residual's own robust sigma.
 * @returns {Object} { model, used, rejected, sigma }
 */
function mtFitResidualSpline( squares, z, logSmoothing )
{
   const n = squares.length;
   if ( n < 4 )
      throw new Error( format( mtT( "err.fewSamples" ), n ) );

   // A two-dimensional spline needs two-dimensional support. Samples strung out
   // along a single row or column give a singular system: initialize() may still
   // report success, and evaluate() then returns nonsense off that line.
   // This catches the axis-aligned case, which is the one a thin overlap
   // actually produces; a merely near-collinear set is caught downstream by the
   // non-finite guard in mtApplyJoin.
   {
      let xs = new Set(), ys = new Set();
      for ( let s of squares )
      {
         xs.add( s.center.x );
         ys.add( s.center.y );
      }
      if ( xs.size < 2 || ys.size < 2 )
         throw new Error( format( mtT( "err.tooThin" ), xs.size, ys.size ) );
   }

   // Normalise so that the smoothing parameter is dimensionless.
   let centre = mtMedian( z, n );
   let sigma = mtMAD( z, centre, n );
   if ( !(sigma > 0) || !isFinite( sigma ) )
      sigma = 1;
   let zn = new Float64Array( n );
   for ( let i = 0; i < n; ++i )
      zn[i] = z[i]/sigma;

   let build = ( indices ) =>
   {
      let k = indices.length;
      let xv = new Vector( k );
      let yv = new Vector( k );
      let zv = new Vector( k );
      let wv = new Vector( k );
      for ( let a = 0; a < k; ++a )
      {
         let s = squares[indices[a]];
         xv.at( a, s.center.x );
         yv.at( a, s.center.y );
         zv.at( a, zn[indices[a]] );
         wv.at( a, 1 );
      }
      let ss = new SurfaceSpline();
      ss.smoothing = Math.pow( 10, logSmoothing );
      CoreApplication.processEvents();
      ss.initialize( xv, yv, zv, wv );
      if ( !ss.isValid )
         throw new Error( mtT( "err.splineFailed" ) );
      return ss;
   };

   let all = [];
   for ( let i = 0; i < n; ++i )
      all.push( i );

   let first = build( all );
   if ( n < 24 )
      return { model: new MT_GradientModel( first, sigma ), used: n, rejected: 0, sigma: sigma };

   let points = all.map( i => new Point( squares[i].center.x, squares[i].center.y ) );
   let fitted = mtEvaluateSpline( first, points );
   let residual = new Float64Array( n );
   for ( let i = 0; i < n; ++i )
      residual[i] = zn[i] - fitted[i];

   let rCentre = mtMedian( residual, n );
   let mad = mtMAD( residual, rCentre, n );
   if ( !(mad > 0) )
      return { model: new MT_GradientModel( first, sigma ), used: n, rejected: 0, sigma: sigma };

   let limit = 3*mad;
   let keep = all.filter( i => Math.abs( residual[i] - rCentre ) <= limit );
   if ( keep.length < Math.max( 12, n/2 ) )
      return { model: new MT_GradientModel( first, sigma ), used: n, rejected: 0, sigma: sigma };

   try { first.clear(); } catch ( x ) { /* released on collection */ }
   return { model: new MT_GradientModel( build( keep ), sigma ),
            used: keep.length, rejected: n - keep.length, sigma: sigma };
}

// ----------------------------------------------------------------------------
// Correction field
// ----------------------------------------------------------------------------

/**
 * The correction to add to the scaled target, sampled on a coarse lattice and
 * bilinearly interpolated between lattice points.
 *
 * Evaluating a surface spline at every pixel of a mosaic-sized tile is far too
 * slow, and pointless: the spline is smooth by construction, so a lattice a few
 * pixels across carries all the information it has.
 */
class MT_CorrectionField
{
   /**
    * @param {MT_GradientModel} model Fitted over the overlap.
    * @param {MT_Overlap} overlap
    * @param {Rect} field Region to cover - the target tile's bounding box.
    * @param {Number} taperLength Pixels over which the correction fades to a
    *        constant beyond the overlap.
    */
   constructor( model, overlap, field, taperLength )
   {
      this.field = field;
      this.step = MT_FIELD_STEP();
      this.cols = Math.floor( (field.width  - 1)/this.step ) + 2;
      this.rows = Math.floor( (field.height - 1)/this.step ) + 2;

      // The support region of the spline is the shared band, not the bounding-box
      // intersection: for an L-shaped accumulator the two differ, and treating
      // the wider box as "inside the overlap" would evaluate the spline where it
      // has no samples - exactly the extrapolation this class exists to avoid.
      const box = overlap.sharedRegion();
      const horizontal = overlap.isHorizontal;
      const taper = Math.max( 1, taperLength );

      // Lattice coordinates.
      let lx = new Float64Array( this.cols );
      let ly = new Float64Array( this.rows );
      for ( let i = 0; i < this.cols; ++i )
         lx[i] = field.x0 + i*this.step;
      for ( let j = 0; j < this.rows; ++j )
         ly[j] = field.y0 + j*this.step;

      // Along the join the correction is a function of the "along" coordinate;
      // across it, of the "across" coordinate. Clamp the along coordinate into
      // the overlap so the spline is never asked about sky it never saw.
      let alongLo = horizontal ? box.x0 : box.y0;
      let alongHi = horizontal ? box.x1 - 1 : box.y1 - 1;
      let acrossLo = horizontal ? box.y0 : box.x0;
      let acrossHi = horizontal ? box.y1 - 1 : box.x1 - 1;

      let clampAlong = v => Math.min( alongHi, Math.max( alongLo, v ) );
      let pointAt = ( along, across ) => horizontal ? new Point( along, across )
                                                    : new Point( across, along );

      const alongCount = horizontal ? this.cols : this.rows;
      let alongValues = new Float64Array( alongCount );
      for ( let a = 0; a < alongCount; ++a )
         alongValues[a] = clampAlong( horizontal ? lx[a] : ly[a] );

      // The two overlap edges, and the constant each one fades into.
      let edgeLo = model.evaluate( Array.from( alongValues, v => pointAt( v, acrossLo ) ) );
      let edgeHi = model.evaluate( Array.from( alongValues, v => pointAt( v, acrossHi ) ) );
      let meanLo = mtMean( edgeLo, edgeLo.length );
      let meanHi = mtMean( edgeHi, edgeHi.length );

      // Fill the lattice.
      this.values = new Float64Array( this.cols * this.rows );
      for ( let j = 0; j < this.rows; ++j )
      {
         if ( horizontal )
         {
            let across = ly[j];
            let dest = j*this.cols;
            if ( across < acrossLo || across > acrossHi )
            {
               let below = across < acrossLo;
               let edge = below ? edgeLo : edgeHi;
               let mean = below ? meanLo : meanHi;
               let t = Math.min( 1, (below ? (acrossLo - across) : (across - acrossHi))/taper );
               for ( let i = 0; i < this.cols; ++i )
                  this.values[dest + i] = edge[i] + (mean - edge[i])*t;
            }
            else
            {
               let v = model.evaluate( Array.from( alongValues, a => pointAt( a, across ) ) );
               for ( let i = 0; i < this.cols; ++i )
                  this.values[dest + i] = v[i];
            }
         }
         else
         {
            // Vertical join: `across` varies along a lattice ROW, `along` down it.
            let along = alongValues[j];
            let dest = j*this.cols;
            let inside = [];
            let insideIndex = [];
            for ( let i = 0; i < this.cols; ++i )
            {
               let across = lx[i];
               if ( across < acrossLo || across > acrossHi )
               {
                  let before = across < acrossLo;
                  let edge = before ? edgeLo[j] : edgeHi[j];
                  let mean = before ? meanLo : meanHi;
                  let t = Math.min( 1, (before ? (acrossLo - across) : (across - acrossHi))/taper );
                  this.values[dest + i] = edge + (mean - edge)*t;
               }
               else
               {
                  inside.push( pointAt( along, across ) );
                  insideIndex.push( i );
               }
            }
            if ( inside.length )
            {
               let v = model.evaluate( inside );
               for ( let k = 0; k < insideIndex.length; ++k )
                  this.values[dest + insideIndex[k]] = v[k];
            }
         }
         if ( (j & 15) === 0 )
            CoreApplication.processEvents();
      }

      // Horizontal interpolation weights never change from row to row.
      this.ix0 = new Int32Array( field.width );
      this.ix1 = new Int32Array( field.width );
      this.wx  = new Float64Array( field.width );
      for ( let x = 0; x < field.width; ++x )
      {
         let f = x/this.step;
         let i0 = Math.floor( f );
         if ( i0 > this.cols - 2 )
            i0 = this.cols - 2;
         if ( i0 < 0 )
            i0 = 0;
         this.ix0[x] = i0;
         this.ix1[x] = Math.min( i0 + 1, this.cols - 1 );
         this.wx[x] = f - i0;
      }
      this.rowBuffer = new Float64Array( field.width );
   }

   /**
    * Correction for one image row, over the full width of the field.
    * @param {Number} y Image coordinate.
    * @returns {Float64Array} Length field.width; index 0 is x = field.x0.
    */
   rowValues( y )
   {
      let f = (y - this.field.y0)/this.step;
      let j0 = Math.floor( f );
      if ( j0 > this.rows - 2 ) j0 = this.rows - 2;
      if ( j0 < 0 ) j0 = 0;
      let j1 = Math.min( j0 + 1, this.rows - 1 );
      let wy = f - j0;
      let a = j0*this.cols;
      let b = j1*this.cols;
      let v = this.values;
      let out = this.rowBuffer;
      for ( let x = 0; x < out.length; ++x )
      {
         let i0 = this.ix0[x], i1 = this.ix1[x], wx = this.wx[x];
         let top = v[a + i0] + (v[a + i1] - v[a + i0])*wx;
         let bottom = v[b + i0] + (v[b + i1] - v[b + i0])*wx;
         out[x] = top + (bottom - top)*wy;
      }
      return out;
   }
}

// ----------------------------------------------------------------------------
// Application
// ----------------------------------------------------------------------------

/**
 * Writes the corrected target into the mosaic image.
 *
 * The mosaic image IS the reference: the accumulator is modified in place, so
 * only the target's bounding box is touched.
 *
 * @param {Image} mosaicImage Reference / accumulator; modified.
 * @param {Image} tgtImage
 * @param {MT_Overlap} overlap
 * @param {Number[]} scales Scale factor per channel.
 * @param {MT_CorrectionField[]} fields Correction field per channel.
 * @param {Object} options { joinMode: 0|1|2, joinSizePercent: Number }
 * @returns {Object} { minimum, maximum, pixelsWritten, clamped, nonFinite }
 *          `minimum`/`maximum` are the range BEFORE clamping, so the caller can
 *          report how far outside [0,1] the correction pushed the data.
 */
function mtApplyJoin( mosaicImage, tgtImage, overlap, scales, fields, options )
{
   const box = overlap.tgtBox;
   const nCh = mosaicImage.isColor ? 3 : 1;
   const use64 = mosaicImage.bitsPerSample === 64;
   const W = box.width;

   const horizontal = overlap.isHorizontal;
   const join = overlap.joinCoordinate;
   const targetAfter = overlap.isTargetAfter;
   const blendHalf = (options.joinMode === 0)
                     ? 0
                     : Math.max( 1, 0.5 * overlap.thickness() * options.joinSizePercent/100 );

   let rect = new Rect( box.x0, box.y0, box.x1, box.y0 + 1 );
   let ref = [], tgt = [], corr = [];
   for ( let c = 0; c < nCh; ++c )
   {
      ref.push( use64 ? new Float64Array( W ) : new Float32Array( W ) );
      tgt.push( use64 ? new Float64Array( W ) : new Float32Array( W ) );
   }

   let minimum = Number.MAX_VALUE;
   let maximum = -Number.MAX_VALUE;
   let written = 0;
   let clamped = 0;
   let nonFinite = 0;

   // Zero means "no data" everywhere in this pipeline, so a clipped pixel must
   // not become exactly zero - that would punch a hole in the mosaic's coverage
   // and remove the pixel from every later join, from the overlap mask and from
   // the star apertures. Clip to a value that is black to the eye but still
   // counts as data. The trade is that a clamped pixel is no longer recognised
   // as an edge by later joins; the caller reports how many there were.
   const FLOOR = 1e-10;

   let pixelClamped = false;
   let store = ( value ) =>
   {
      if ( value < minimum ) minimum = value;
      if ( value > maximum ) maximum = value;
      if ( value < FLOOR ) { pixelClamped = true; return FLOOR; }
      if ( value > 1 )     { pixelClamped = true; return 1; }
      return value;
   };

   for ( let y = box.y0; y < box.y1; ++y )
   {
      rect.moveTo( box.x0, y );
      for ( let c = 0; c < nCh; ++c )
      {
         mosaicImage.getSamples( ref[c], rect, c );
         tgtImage.getSamples( tgt[c], rect, c );
         corr[c] = fields[c].rowValues( y );
      }

      let rowDirty = false;
      for ( let i = 0; i < W; ++i )
      {
         let x = box.x0 + i;

         let tgtHas = false, refHas = false;
         for ( let c = 0; c < nCh; ++c )
         {
            if ( tgt[c][i] !== 0 ) tgtHas = true;
            if ( ref[c][i] !== 0 ) refHas = true;
         }
         if ( !tgtHas )
            continue;

         // Where the reference has nothing, the corrected target simply fills in.
         if ( !refHas )
         {
            let bad = false;
            for ( let c = 0; c < nCh; ++c )
               if ( !isFinite( scales[c]*tgt[c][i] + corr[c][i] ) ) { bad = true; break; }
            if ( bad )
            {
               ++nonFinite;
               continue;
            }
            pixelClamped = false;
            for ( let c = 0; c < nCh; ++c )
               ref[c][i] = store( scales[c]*tgt[c][i] + corr[c][i] );
            if ( pixelClamped )
               ++clamped;
            rowDirty = true;
            ++written;
            continue;
         }

         // Inside the overlap the join rule decides.
         let u = horizontal ? y : x;
         let onTargetSide = targetAfter ? (u > join) : (u < join);
         let distance = Math.abs( u - join );

         let weight;                      // weight of the target in the output
         if ( blendHalf > 0 && distance <= blendHalf )
         {
            if ( options.joinMode === 2 )
            {
               // Ramp rather than a flat 0.5: a constant weight would step
               // 0 -> 0.5 -> 1 at the band edges and leave two faint lines
               // instead of one seam.
               let t = distance/blendHalf;                    // 0 at the join line
               weight = onTargetSide ? 0.5*(1 + t) : 0.5*(1 - t);
            }
            else
               weight = (Math.random() < 0.5) ? 1 : 0;        // random
         }
         else
            weight = onTargetSide ? 1 : 0;                    // overlay

         if ( weight === 0 )
            continue;

         let bad = false;
         for ( let c = 0; c < nCh; ++c )
            if ( !isFinite( scales[c]*tgt[c][i] + corr[c][i] ) ) { bad = true; break; }
         if ( bad )
         {
            ++nonFinite;
            continue;
         }

         pixelClamped = false;
         for ( let c = 0; c < nCh; ++c )
         {
            let v = scales[c]*tgt[c][i] + corr[c][i];
            ref[c][i] = store( (weight === 1) ? v : (ref[c][i]*(1 - weight) + v*weight) );
         }
         if ( pixelClamped )
            ++clamped;
         rowDirty = true;
         ++written;
      }

      if ( rowDirty )
         for ( let c = 0; c < nCh; ++c )
            mosaicImage.setSamples( ref[c], rect, c );

      if ( (y & 255) === 0 )
         CoreApplication.processEvents();
   }

   return { minimum: (written ? minimum : 0),
            maximum: (written ? maximum : 0),
            pixelsWritten: written,
            clamped: clamped,
            nonFinite: nonFinite };
}

// ----------------------------------------------------------------------------
// EOF MT_Gradient.js
