// SPDX-License-Identifier: CC-BY-NC-4.0
// ----------------------------------------------------------------------------
// MT_Photometry.js - MosaicToolbox
//
// Measures the brightness scale factor between two overlapping tiles.
//
// The method is the standard photometric one: find stars in the shared region,
// measure each star's flux in both images, and fit the ratio.
//
// One thing makes this considerably more robust here than in the general case.
// Both images have already been reprojected onto the *same* grid, so a star sits
// at the same pixel coordinates in both. There is no star matching problem, and
// every star can be measured with an identical aperture at an identical position
// in both images - so aperture losses, centroiding error and PSF differences
// cancel in the ratio instead of adding noise to it.
// ----------------------------------------------------------------------------

/** @returns {Number} Fraction of the reference level below which data is linear. */
function MT_LINEAR_FRACTION() { return 0.7; }
/** @returns {Number} Floor for that reference level. See mtLinearLimit(). */
function MT_LINEAR_FLOOR() { return 0.5; }

/** @returns {Number} Aperture radius = MT_APERTURE_SCALE * star radius + add. */
function MT_APERTURE_SCALE() { return 2.0; }
function MT_APERTURE_ADD()   { return 1.5; }
function MT_APERTURE_MIN()   { return 2.5; }
function MT_APERTURE_MAX()   { return 25.0; }
/** @returns {Number} Blank ring between the aperture and the background annulus. */
function MT_APERTURE_GAP()   { return 3.0; }
/** @returns {Number} Width of the background annulus, in pixels. */
function MT_BACKGROUND_WIDTH() { return 6.0; }
/** @returns {Number} Minimum star pairs before the star-based scale is trusted. */
function MT_MIN_STAR_PAIRS() { return 6; }

// ----------------------------------------------------------------------------

/**
 * Copies a rectangle of an image into a new, standalone Image.
 * Done row by row so that a large overlap does not need a full-rectangle
 * buffer on top of the copy itself.
 *
 * @param {Image} image
 * @param {Rect} box
 * @returns {Image}
 */
function mtCropImage( image, box )
{
   const W = box.width;
   const H = box.height;
   const nCh = image.isColor ? 3 : 1;
   const use64 = image.bitsPerSample === 64;

   let out = new Image( W, H, nCh, image.colorSpace );

   let src = new Rect( box.x0, box.y0, box.x1, box.y0 + 1 );
   let dst = new Rect( 0, 0, W, 1 );
   let buf = use64 ? new Float64Array( W ) : new Float32Array( W );

   for ( let y = 0; y < H; ++y )
   {
      src.moveTo( box.x0, box.y0 + y );
      dst.moveTo( 0, y );
      for ( let c = 0; c < nCh; ++c )
      {
         image.getSamples( buf, src, c );
         out.setSamples( buf, dst, c );
      }
   }
   return out;
}

// ----------------------------------------------------------------------------

/**
 * Detects stars inside a rectangle of an image.
 *
 * @param {Image} image
 * @param {Rect} box Region to search, in image coordinates.
 * @param {Number} logSensitivity Log detection sensitivity; -1 is the PixInsight
 *        StarDetector default. Lower detects fainter stars.
 * @returns {Object[]} { x, y, size, radius } in IMAGE coordinates.
 */
function mtDetectStars( image, box, logSensitivity )
{
   if ( box.width < 8 || box.height < 8 )
      return [];

   let sub = mtCropImage( image, box );
   let found = [];
   try
   {
      let detector = new StarDetector();
      detector.structureLayers = 5;
      detector.noiseLayers = 0;
      detector.hotPixelFilterRadius = 1;
      detector.applyHotPixelFilterToDetectionImage = false;
      detector.sensitivity = Math.pow( 10, logSensitivity );
      detector.peakResponse = 0.8;
      detector.maxDistortion = 0.5;
      detector.upperLimit = 1.0;

      let stars = detector.stars( sub );
      for ( let s of stars )
      {
         let size = (s.size > 0) ? s.size : 1;
         found.push( { x: s.pos.x + box.x0,
                       y: s.pos.y + box.y0,
                       size: size,
                       flux: (s.flux > 0) ? s.flux : 0,
                       radius: Math.max( 1, Math.sqrt( size/Math.PI ) ) } );
      }
   }
   finally
   {
      try { sub.free(); } catch ( x ) { /* older builds free on collection */ }
   }
   return found;
}

/**
 * Merges two star lists, treating detections closer than `radius` as the same
 * star. Used to combine what was found in the reference with what was found in
 * the target, so a star that is faint in one image is not lost.
 *
 * @param {Object[]} a
 * @param {Object[]} b
 * @param {Number} radius Pixels
 * @returns {Object[]}
 */
function mtMergeStars( a, b, radius )
{
   let out = a.slice();
   let r2 = radius * radius;

   // Bucket the first list so the merge does not become quadratic on a rich field.
   const cell = Math.max( 8, Math.ceil( radius * 4 ) );
   let buckets = new Map();
   let keyOf = ( x, y ) => (Math.floor( x/cell ) + "," + Math.floor( y/cell ));
   for ( let i = 0; i < out.length; ++i )
   {
      let k = keyOf( out[i].x, out[i].y );
      let list = buckets.get( k );
      if ( list === undefined )
         buckets.set( k, [ i ] );
      else
         list.push( i );
   }

   for ( let s of b )
   {
      let duplicate = false;
      let cx = Math.floor( s.x/cell );
      let cy = Math.floor( s.y/cell );
      for ( let dx = -1; dx <= 1 && !duplicate; ++dx )
         for ( let dy = -1; dy <= 1 && !duplicate; ++dy )
         {
            let list = buckets.get( (cx+dx) + "," + (cy+dy) );
            if ( list === undefined )
               continue;
            for ( let i of list )
            {
               let ddx = out[i].x - s.x;
               let ddy = out[i].y - s.y;
               if ( ddx*ddx + ddy*ddy < r2 )
               {
                  // Keep the larger measurement of the two.
                  if ( s.size > out[i].size )
                  {
                     out[i].size = s.size;
                     out[i].radius = s.radius;
                  }
                  if ( s.flux > out[i].flux )
                     out[i].flux = s.flux;
                  duplicate = true;
                  break;
               }
            }
         }
      if ( !duplicate )
      {
         let i = out.length;
         out.push( s );
         let k = keyOf( s.x, s.y );
         let list = buckets.get( k );
         if ( list === undefined )
            buckets.set( k, [ i ] );
         else
            list.push( i );
      }
   }
   return out;
}

// ----------------------------------------------------------------------------

/**
 * Aperture photometry of one star in one image.
 *
 * Reads a single square patch and works entirely inside it: a circular aperture
 * for the flux and a concentric annulus, separated by a gap, for the local
 * background.
 *
 * @param {Image} image
 * @param {Object} star { x, y, radius }
 * @param {Number} channel
 * @param {Number} linearLimit Reject the star if any aperture pixel reaches this.
 * @param {Object} scratch Reusable buffers from mtNewPhotometryScratch(). One
 *        allocation per join instead of one per star per image per channel.
 * @returns {Object|null} { flux, peak, background, pixels } or null if unusable.
 */
function mtMeasureStar( image, star, channel, linearLimit, scratch )
{
   let rAp = Math.min( MT_APERTURE_MAX(),
                       Math.max( MT_APERTURE_MIN(),
                                 MT_APERTURE_SCALE()*star.radius + MT_APERTURE_ADD() ) );
   let rIn  = rAp + MT_APERTURE_GAP();
   let rOut = rIn + MT_BACKGROUND_WIDTH();
   let R = Math.ceil( rOut ) + 1;

   let cx = Math.round( star.x );
   let cy = Math.round( star.y );
   let x0 = cx - R, y0 = cy - R, x1 = cx + R + 1, y1 = cy + R + 1;
   if ( x0 < 0 || y0 < 0 || x1 > image.width || y1 > image.height )
      return null;

   let rect = new Rect( x0, y0, x1, y1 );
   let n = rect.width * rect.height;
   // An exact-length view, not the whole scratch buffer: every getSamples call
   // in the PJSR reference sources passes a buffer of exactly rect.area, and
   // subarray() is a view rather than a copy, so this keeps the allocation win.
   let buf = scratch.samples.subarray( 0, n );
   image.getSamples( buf, rect, channel );

   const rAp2 = rAp*rAp, rIn2 = rIn*rIn, rOut2 = rOut*rOut;
   let sum = 0, count = 0, peak = 0;
   let ring = scratch.ring;
   let ringCount = 0;

   for ( let j = 0, i = 0; j < rect.height; ++j )
   {
      let dy = (y0 + j) - star.y + 0.5;
      for ( let k = 0; k < rect.width; ++k, ++i )
      {
         let dx = (x0 + k) - star.x + 0.5;
         let d2 = dx*dx + dy*dy;
         if ( d2 > rOut2 )
            continue;                     // patch corner: never measured, never tested
         let v = buf[i];
         if ( d2 <= rAp2 )
         {
            // A zero inside the aperture or the annulus means this star is
            // hanging off the edge of the tile and cannot be measured
            // consistently in both images.
            if ( v === 0 )
               return null;
            sum += v;
            ++count;
            if ( v > peak )
               peak = v;
         }
         else if ( d2 >= rIn2 )
         {
            if ( v === 0 )
               return null;
            ring[ringCount++] = v;
         }
      }
   }

   if ( count < 4 || ringCount < 8 )
      return null;
   if ( peak >= linearLimit )
      return null;

   let background = mtMedian( ring, ringCount );
   let flux = sum - background*count;
   if ( !(flux > 0) || !isFinite( flux ) )
      return null;

   return { flux: flux, peak: peak, background: background, pixels: count };
}

/**
 * Scratch buffers for mtMeasureStar, sized for the largest aperture it can use.
 * @param {Boolean} use64
 * @returns {Object} { samples, ring }
 */
function mtNewPhotometryScratch( use64 )
{
   let rOut = MT_APERTURE_MAX() + MT_APERTURE_GAP() + MT_BACKGROUND_WIDTH();
   let R = Math.ceil( rOut ) + 1;
   let side = 2*R + 1;
   let n = side*side;
   return { samples: use64 ? new Float64Array( n ) : new Float32Array( n ),
            ring: new Float64Array( n ) };
}

// ----------------------------------------------------------------------------

/**
 * Measures the scale factor m such that reference ~= m * target, from stars.
 *
 * @param {Image} refImage
 * @param {Image} tgtImage
 * @param {Object[]} stars Detected stars, image coordinates.
 * @param {Number} channel
 * @param {Number} refLimit Linear range limit of the reference image.
 * @param {Number} tgtLimit Linear range limit of the target image.
 * @returns {Object} { m, n, rejected, scatter, ok }
 *          `scatter` is the robust spread of the per-star ratios, in percent.
 */
function mtScaleFromStars( refImage, tgtImage, stars, channel, refLimit, tgtLimit )
{
   let refFlux = new Float64Array( stars.length );
   let tgtFlux = new Float64Array( stars.length );
   let ratio   = new Float64Array( stars.length );
   let n = 0;
   let scratch = mtNewPhotometryScratch( refImage.bitsPerSample === 64 );

   for ( let s of stars )
   {
      let a = mtMeasureStar( refImage, s, channel, refLimit, scratch );
      if ( a === null )
         continue;
      let b = mtMeasureStar( tgtImage, s, channel, tgtLimit, scratch );
      if ( b === null )
         continue;
      refFlux[n] = a.flux;
      tgtFlux[n] = b.flux;
      ratio[n]   = a.flux / b.flux;
      ++n;
   }

   if ( n < MT_MIN_STAR_PAIRS() )
      return { m: 1, n: n, rejected: 0, scatter: 0, ok: false };

   // Start from the median ratio, which no outlier can move, then refine with a
   // weighted least-squares fit through the origin. Weighting falls out of the
   // fit itself: sum(ref*tgt)/sum(tgt^2) leans on the brightest stars, which are
   // the ones with the best signal to noise.
   let keep = new Uint8Array( n );
   keep.fill( 1 );
   let kept = n;
   let m = mtMedian( ratio, n );
   if ( !(m > 0) )
      return { m: 1, n: n, rejected: 0, scatter: 0, ok: false };

   let scatter = 0;
   for ( let iteration = 0; iteration < 4; ++iteration )
   {
      // Robust spread of the ratios that are still in play.
      let live = new Float64Array( kept );
      let j = 0;
      for ( let i = 0; i < n; ++i )
         if ( keep[i] )
            live[j++] = ratio[i];
      let centre = mtMedian( live, j );
      let mad = mtMAD( live, centre, j );
      scatter = (centre > 0) ? 100*mad/centre : 0;

      if ( mad > 0 )
      {
         let limit = 3*mad;
         kept = 0;
         for ( let i = 0; i < n; ++i )
         {
            keep[i] = (Math.abs( ratio[i] - centre ) <= limit) ? 1 : 0;
            kept += keep[i];
         }
         if ( kept < MT_MIN_STAR_PAIRS() )
         {
            // Rejection has eaten the sample; fall back to the plain median.
            keep.fill( 1 );
            kept = n;
            m = centre;
            break;
         }
      }

      let sxy = 0, sxx = 0;
      for ( let i = 0; i < n; ++i )
         if ( keep[i] )
         {
            sxy += refFlux[i]*tgtFlux[i];
            sxx += tgtFlux[i]*tgtFlux[i];
         }
      if ( sxx > 0 )
         m = sxy/sxx;
   }

   // Report the scatter of the stars that survived, not of an earlier pass.
   {
      let live = new Float64Array( kept );
      let j = 0;
      for ( let i = 0; i < n; ++i )
         if ( keep[i] )
            live[j++] = ratio[i];
      let centre = mtMedian( live, j );
      scatter = (centre > 0) ? 100*mtMAD( live, centre, j )/centre : 0;
   }

   if ( !(m > 0) || !isFinite( m ) )
      return { m: 1, n: n, rejected: 0, scatter: 0, ok: false };

   return { m: m, n: kept, rejected: n - kept, scatter: scatter, ok: true };
}

// ----------------------------------------------------------------------------

/**
 * Fallback when the overlap holds too few usable stars: a sigma-clipped linear
 * regression of reference against target over the shared pixels.
 *
 * Less trustworthy than star photometry - extended nebulosity biases it, which
 * is exactly why the star method is preferred - but far better than assuming a
 * scale of 1.
 *
 * @param {Image} refImage
 * @param {Image} tgtImage
 * @param {MT_Overlap} overlap
 * @param {Number} channel
 * @returns {Object} { m, n, ok }
 */
function mtScaleFromPixels( refImage, tgtImage, overlap, channel )
{
   const box = overlap.box;
   const TARGET_SAMPLES = 200000;
   // Derive the stride from the area actually walked, so the lattice the loops
   // visit and the buffer they fill agree. Masked-out pixels only reduce `n`;
   // the walk always covers the whole box, top to bottom.
   let stride = Math.max( 1, Math.round( Math.sqrt( (box.width*box.height)/TARGET_SAMPLES ) ) );
   let capacity = Math.ceil( box.width/stride ) * Math.ceil( box.height/stride ) + 16;
   let X = new Float64Array( capacity );
   let Y = new Float64Array( capacity );
   let n = 0;

   let use64 = refImage.bitsPerSample === 64;
   let rect = new Rect( box.x0, box.y0, box.x1, box.y0 + 1 );
   let r = use64 ? new Float64Array( box.width ) : new Float32Array( box.width );
   let t = use64 ? new Float64Array( box.width ) : new Float32Array( box.width );

   for ( let y = 0; y < box.height && n < capacity; y += stride )
   {
      rect.moveTo( box.x0, box.y0 + y );
      refImage.getSamples( r, rect, channel );
      tgtImage.getSamples( t, rect, channel );
      let row = y * box.width;
      for ( let x = 0; x < box.width && n < capacity; x += stride )
         if ( overlap.mask[row + x] )
         {
            X[n] = t[x];
            Y[n] = r[x];
            ++n;
         }
   }

   if ( n < 100 )
      return { m: 1, n: n, ok: false };

   // Ordinary least squares with an intercept - the two tiles generally sit on
   // different backgrounds - then clip and refit.
   let keep = new Uint8Array( n );
   keep.fill( 1 );
   let kept = n;
   let m = 1, b = 0;
   let fitted = false;

   for ( let iteration = 0; iteration < 4; ++iteration )
   {
      // Clip against the previous fit first, so the slope returned always
      // belongs to the sample count returned.
      if ( fitted )
      {
         let residual = new Float64Array( n );
         let j = 0;
         for ( let i = 0; i < n; ++i )
            if ( keep[i] )
               residual[j++] = Y[i] - (m*X[i] + b);
         let centre = mtMedian( residual, j );
         let mad = mtMAD( residual, centre, j );
         if ( !(mad > 0) )
            break;
         let limit = 3*mad;
         let survivors = 0;
         for ( let i = 0; i < n; ++i )
         {
            keep[i] = (Math.abs( (Y[i] - (m*X[i] + b)) - centre ) <= limit) ? 1 : 0;
            survivors += keep[i];
         }
         if ( survivors < 100 )
            break;
         // `kept` is committed by the fit below, not here: if that fit turns out
         // degenerate we must keep reporting the sample count `m` came from.
      }

      let sx = 0, sy = 0, sxx = 0, sxy = 0, k = 0;
      for ( let i = 0; i < n; ++i )
         if ( keep[i] )
         {
            sx += X[i]; sy += Y[i];
            sxx += X[i]*X[i]; sxy += X[i]*Y[i];
            ++k;
         }
      if ( k < 50 )
         break;
      let denominator = k*sxx - sx*sx;
      if ( !(Math.abs( denominator ) > 0) )
         break;
      m = (k*sxy - sx*sy)/denominator;
      b = (sy - m*sx)/k;
      kept = k;
      fitted = true;
   }

   if ( !fitted || !(m > 0) || !isFinite( m ) )
      return { m: 1, n: n, ok: false };
   return { m: m, n: kept, ok: true };
}

// ----------------------------------------------------------------------------

/**
 * The linear range limit of a channel: the level above which its stars can no
 * longer be trusted for photometry.
 *
 * Derived from the maximum over the SHARED pixels, which MT_Overlap already
 * measured while building its mask. Using the whole canvas would mean a full
 * scan per join, and would let one hot pixel anywhere in the assembled mosaic
 * set the saturation threshold for a join happening somewhere else entirely.
 *
 * The floor matters. Saturation is a property of the sensor, not of the crop:
 * in an overlap whose brightest star only reaches 0.10, scaling the threshold to
 * that maximum would reject every one of the stars worth measuring and drop the
 * join to the pixel-based fallback. Taking the larger of the measured maximum
 * and a fixed reference level keeps the cut meaningful when the band is bright
 * and inert when it is faint.
 *
 * @param {Number} sharedMaximum
 * @returns {Number}
 */
function mtLinearLimit( sharedMaximum )
{
   let reference = (sharedMaximum > 0) ? sharedMaximum : 1;
   return MT_LINEAR_FRACTION() * Math.max( reference, MT_LINEAR_FLOOR() );
}

// ----------------------------------------------------------------------------
// EOF MT_Photometry.js
