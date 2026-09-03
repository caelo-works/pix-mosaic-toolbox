// SPDX-License-Identifier: CC-BY-NC-4.0
// ----------------------------------------------------------------------------
// MT_Overlap.js - MosaicToolbox
//
// Geometry of a single join: where each image holds data, where the two of them
// share sky, which way the join runs, and which side of it the target is on.
//
// Both images are always the same size here - they have already been reprojected
// onto the common grid - and everything outside a tile's footprint is exactly
// zero. "Has data" therefore means "is not zero", the same convention the rest
// of the mosaic pipeline uses.
// ----------------------------------------------------------------------------

/**
 * Bounding rectangle of the non-zero pixels of an image.
 *
 * One pass over the rows. Each row is fetched in full - getSamples has no
 * partial-row form - but the scan for the first and last non-zero sample works
 * in from both ends and stops early, so a row that holds data costs only its
 * empty margins in JavaScript.
 *
 * @param {Image} image
 * @returns {Rect} Empty rect (width or height 0) if the image is entirely zero.
 */
function mtBoundingBox( image )
{
   const W = image.width;
   const H = image.height;
   const nCh = image.isColor ? 3 : 1;
   const use64 = image.bitsPerSample === 64;

   let rect = new Rect( 0, 0, W, 1 );
   let buf = [];
   for ( let c = 0; c < nCh; ++c )
      buf.push( use64 ? new Float64Array( W ) : new Float32Array( W ) );

   let x0 = W, x1 = 0, y0 = -1, y1 = -1;

   for ( let y = 0; y < H; ++y )
   {
      rect.moveTo( 0, y );
      for ( let c = 0; c < nCh; ++c )
         image.getSamples( buf[c], rect, c );

      let first = -1;
      for ( let x = 0; x < W; ++x )
      {
         let occupied = false;
         for ( let c = 0; c < nCh; ++c )
            if ( buf[c][x] !== 0 ) { occupied = true; break; }
         if ( occupied ) { first = x; break; }
      }
      if ( first < 0 )
         continue;

      let last = W - 1;
      for ( ; last > first; --last )
      {
         let occupied = false;
         for ( let c = 0; c < nCh; ++c )
            if ( buf[c][last] !== 0 ) { occupied = true; break; }
         if ( occupied )
            break;
      }

      if ( y0 < 0 )
         y0 = y;
      y1 = y + 1;
      if ( first < x0 ) x0 = first;
      if ( last + 1 > x1 ) x1 = last + 1;
   }

   if ( y0 < 0 )
      return new Rect( 0, 0, 0, 0 );
   return new Rect( x0, y0, x1, y1 );
}

// ----------------------------------------------------------------------------

/**
 * Everything the join needs to know about how two tiles sit against each other.
 */
class MT_Overlap
{
   /**
    * @param {Image} refImage The accumulated mosaic so far.
    * @param {Image} tgtImage The tile being added.
    */
   constructor( refImage, tgtImage )
   {
      /** @type Rect */
      this.refBox = mtBoundingBox( refImage );
      /** @type Rect */
      this.tgtBox = mtBoundingBox( tgtImage );

      /** @type Rect Region where both images could hold data */
      this.box = new Rect( Math.max( this.refBox.x0, this.tgtBox.x0 ),
                           Math.max( this.refBox.y0, this.tgtBox.y0 ),
                           Math.min( this.refBox.x1, this.tgtBox.x1 ),
                           Math.min( this.refBox.y1, this.tgtBox.y1 ) );

      /** @type Uint8Array 1 where BOTH images hold data; indexed [y*box.width + x] */
      this.mask = null;
      /** @type Number Number of pixels actually shared */
      this.sharedPixels = 0;
      /** @type Number[] Per-channel maximum over the shared pixels of each image.
        *                Used as the photometric linear-range limit, so one hot
        *                pixel elsewhere in the mosaic cannot set the threshold. */
      this.refMaximum = [];
      this.tgtMaximum = [];
      /** @type Rect Bounding box of the shared pixels themselves, which for an
        *            L-shaped overlap is tighter than `box`. */
      this.sharedBox = new Rect( 0, 0, 0, 0 );

      /** @type Boolean True when the join line runs horizontally, i.e. one tile
        *               sits above the other. */
      this.isHorizontal = false;
      /** @type Boolean True when the target lies below (horizontal) or to the
        *               right of (vertical) the reference. */
      this.isTargetAfter = true;
      /** @type Number Image coordinate of the join line, on the join axis. */
      this.joinCoordinate = 0;

      // The containment cases are rejected by the caller, and in those cases
      // `box` is a whole tile footprint - building the mask first would mean a
      // canvas-sized allocation and a full pass for a result nobody uses.
      if ( this.box.width > 0 && this.box.height > 0 &&
           !this.targetIsContained() && !this.referenceIsContained() )
         this.#buildMask( refImage, tgtImage );

      this.#resolveOrientation();
   }

   /** @returns {Boolean} True when the two images actually share pixels. */
   hasOverlap()
   {
      return this.sharedPixels > 0;
   }

   /** @returns {Boolean} True when the target adds no sky the reference lacks. */
   targetIsContained()
   {
      return this.tgtBox.x0 >= this.refBox.x0 && this.tgtBox.y0 >= this.refBox.y0 &&
             this.tgtBox.x1 <= this.refBox.x1 && this.tgtBox.y1 <= this.refBox.y1;
   }

   /** @returns {Boolean} True when the reference is entirely inside the target. */
   referenceIsContained()
   {
      return this.refBox.x0 >= this.tgtBox.x0 && this.refBox.y0 >= this.tgtBox.y0 &&
             this.refBox.x1 <= this.tgtBox.x1 && this.refBox.y1 <= this.tgtBox.y1;
   }

   /**
    * @param {Number} x Image coordinate
    * @param {Number} y Image coordinate
    * @returns {Boolean} True when both images hold data at (x, y).
    */
   isShared( x, y )
   {
      if ( this.mask === null )
         return false;
      if ( x < this.box.x0 || x >= this.box.x1 || y < this.box.y0 || y >= this.box.y1 )
         return false;
      return this.mask[(y - this.box.y0) * this.box.width + (x - this.box.x0)] !== 0;
   }

   /**
    * The rectangle the gradient model is allowed to treat as measured: the
    * bounding box of the shared pixels themselves, which for an L-shaped
    * accumulator is tighter than the bounding-box intersection.
    * @returns {Rect}
    */
   sharedRegion()
   {
      return (this.sharedPixels > 0) ? this.sharedBox : this.box;
   }

   /** @returns {Number} Thickness of the shared band across the join, in pixels. */
   thickness()
   {
      let band = this.sharedRegion();
      return this.isHorizontal ? band.height : band.width;
   }

   /** @returns {String} One line for the console. */
   describe()
   {
      return format( mtT( "Overlap %d x %d px at (%d,%d), %d shared pixels, %s join, target %s" ),
                     this.box.width, this.box.height, this.box.x0, this.box.y0,
                     this.sharedPixels,
                     mtT( this.isHorizontal ? "horizontal" : "vertical" ),
                     mtT( this.isTargetAfter ? (this.isHorizontal ? "below" : "right")
                                             : (this.isHorizontal ? "above" : "left") ) );
   }

   // -------------------------------------------------------------------------

   #buildMask( refImage, tgtImage )
   {
      const W = this.box.width;
      const H = this.box.height;
      const nCh = refImage.isColor ? 3 : 1;
      const use64 = refImage.bitsPerSample === 64;

      this.mask = new Uint8Array( W * H );
      for ( let c = 0; c < nCh; ++c )
      {
         this.refMaximum.push( 0 );
         this.tgtMaximum.push( 0 );
      }
      let minX = W, maxX = -1, minY = H, maxY = -1;

      let rect = new Rect( this.box.x0, this.box.y0, this.box.x1, this.box.y0 + 1 );
      let r = [], t = [];
      for ( let c = 0; c < nCh; ++c )
      {
         r.push( use64 ? new Float64Array( W ) : new Float32Array( W ) );
         t.push( use64 ? new Float64Array( W ) : new Float32Array( W ) );
      }

      let shared = 0;
      for ( let y = 0; y < H; ++y )
      {
         rect.moveTo( this.box.x0, this.box.y0 + y );
         for ( let c = 0; c < nCh; ++c )
         {
            refImage.getSamples( r[c], rect, c );
            tgtImage.getSamples( t[c], rect, c );
         }
         let row = y * W;
         for ( let x = 0; x < W; ++x )
         {
            let refHas = false, tgtHas = false;
            for ( let c = 0; c < nCh; ++c )
            {
               if ( r[c][x] !== 0 ) refHas = true;
               if ( t[c][x] !== 0 ) tgtHas = true;
            }
            if ( refHas && tgtHas )
            {
               this.mask[row + x] = 1;
               ++shared;
               for ( let c = 0; c < nCh; ++c )
               {
                  if ( r[c][x] > this.refMaximum[c] ) this.refMaximum[c] = r[c][x];
                  if ( t[c][x] > this.tgtMaximum[c] ) this.tgtMaximum[c] = t[c][x];
               }
               if ( x < minX ) minX = x;
               if ( x > maxX ) maxX = x;
               if ( y < minY ) minY = y;
               if ( y > maxY ) maxY = y;
            }
         }
      }
      this.sharedPixels = shared;
      this.sharedBox = (shared > 0)
         ? new Rect( this.box.x0 + minX, this.box.y0 + minY,
                     this.box.x0 + maxX + 1, this.box.y0 + maxY + 1 )
         : new Rect( 0, 0, 0, 0 );
   }

   // -------------------------------------------------------------------------

   /**
    * A join runs along the long axis of the overlap: two tiles stacked
    * vertically share a wide, shallow band, so the join line is horizontal.
    *
    * Which side the target is on is decided from the bounding-box centres. That
    * is unambiguous here because the pipeline only ever joins a tile onto a
    * region it extends - so the target's centre always sits further along the
    * join axis than the reference's.
    */
   #resolveOrientation()
   {
      // Orient on the shared band itself, not on the bounding-box intersection:
      // for an L-shaped accumulator the two can disagree.
      let band = this.sharedRegion();
      this.isHorizontal = band.width >= band.height;

      let refCentre = this.isHorizontal ? (this.refBox.y0 + this.refBox.y1)/2
                                        : (this.refBox.x0 + this.refBox.x1)/2;
      let tgtCentre = this.isHorizontal ? (this.tgtBox.y0 + this.tgtBox.y1)/2
                                        : (this.tgtBox.x0 + this.tgtBox.x1)/2;
      this.isTargetAfter = tgtCentre >= refCentre;

      this.joinCoordinate = this.isHorizontal ? (band.y0 + band.y1)/2
                                              : (band.x0 + band.x1)/2;
   }
}

// ----------------------------------------------------------------------------
// EOF MT_Overlap.js
