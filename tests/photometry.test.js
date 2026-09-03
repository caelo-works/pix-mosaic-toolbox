// photometry.test.js — the pure pieces of the scale measurement.
//
// mtMergeStars unions the star lists from the two overlapping tiles so a star
// faint in one is not lost, keeping the larger measurement of any pair that is
// really the same star. mtLinearLimit sets the flux above which a pixel is
// treated as non-linear, with a floor so a faint overlap cannot drive it to
// zero.
'use strict';

const M = require( './build/module.js' );
const { eq, ok, report } = require( './assert.js' );

function star( x, y, size, flux, radius ) { return { x: x, y: y, size: size, flux: flux, radius: radius }; }

// ---- merge: a near-coincident pair is one star, the larger measurement kept ----
let merged = M.mtMergeStars(
   [ star( 100, 100, 2.0, 10, 1.0 ) ],
   [ star( 101, 100, 3.0,  5, 1.5 ) ],   // within radius: same star
   3 );
eq( merged.length, 1, 'a coincident pair collapses to one star' );
eq( merged[0].size, 3.0, 'the larger size is kept' );
eq( merged[0].radius, 1.5, 'the radius follows the larger size' );
eq( merged[0].flux, 10, 'the larger flux is kept (from the first list here)' );

// The larger flux can come from the second list.
merged = M.mtMergeStars( [ star( 0, 0, 2, 10, 1 ) ], [ star( 0, 0, 1, 40, 1 ) ], 3 );
eq( merged[0].flux, 40, 'the larger flux wins regardless of which list it came from' );
eq( merged[0].size, 2, 'but a smaller companion does not shrink the kept size' );

// ---- merge: a distant star is a new detection ----
merged = M.mtMergeStars( [ star( 0, 0, 2, 10, 1 ) ], [ star( 500, 500, 2, 10, 1 ) ], 3 );
eq( merged.length, 2, 'a star outside the radius is added, not merged' );

// Merging an empty second list is a no-op copy.
merged = M.mtMergeStars( [ star( 1, 2, 3, 4, 5 ) ], [], 3 );
eq( merged.length, 1, 'nothing to merge in leaves one star' );

// A rich field stays correct across bucket boundaries: two stars one radius
// apart but on opposite sides of a bucket edge must still be seen as one.
const cell = Math.max( 8, Math.ceil( 3 * 4 ) );   // must match mtMergeStars' cell size
merged = M.mtMergeStars( [ star( cell - 0.5, 0, 2, 10, 1 ) ], [ star( cell + 0.5, 0, 2, 20, 1 ) ], 3 );
eq( merged.length, 1, 'a pair straddling a bucket boundary is still merged' );

// ---- linear limit, with its floor ----
const frac = M.MT_LINEAR_FRACTION();
const floor = M.MT_LINEAR_FLOOR();
ok( frac > 0 && frac < 1, 'the linear fraction is a sane fraction' );
eq( M.mtLinearLimit( 1.0 ), frac * 1.0, 'above the floor, the limit tracks the shared maximum' );
eq( M.mtLinearLimit( 0.2 ), frac * floor, 'below the floor, the floor is used instead' );
eq( M.mtLinearLimit( 0 ), frac * 1.0, 'a non-positive maximum falls back to a reference of 1' );

report( 'photometry' );
