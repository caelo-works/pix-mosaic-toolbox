// geometry.test.js — the midtones transfer function and the auto-crop search.
//
// mtMTF is the closed-form midtones transfer function the screen auto-stretch is
// built on. mtLargestCoveredRect finds the biggest axis-aligned rectangle in
// which every channel holds data — the rectangle the whole mosaic is cropped to
// — with a monotone-stack largest-rectangle-in-a-histogram sweep.
'use strict';

const M = require( './build/module.js' );
const { eq, near, report } = require( './assert.js' );

// ---- MTF ----
eq( M.mtMTF( 0.5, 0.3 ), 0.3, 'm = 0.5 is the identity' );
eq( M.mtMTF( 0.3, 0 ), 0, 'x <= 0 -> 0' );
eq( M.mtMTF( 0.3, -1 ), 0, 'x below 0 -> 0' );
eq( M.mtMTF( 0.3, 1 ), 1, 'x >= 1 -> 1' );
eq( M.mtMTF( 0.3, 2 ), 1, 'x above 1 -> 1' );
near( M.mtMTF( 0.25, 0.5 ), 0.75, 'a midtone below 0.5 lifts the half-tone', 1e-12 );
near( M.mtMTF( 0.75, 0.5 ), 0.25, 'a midtone above 0.5 lowers it, symmetrically', 1e-12 );

// ---- largest covered rectangle ----
function cov( rows, binning ) {
   const r = rows.length, c = rows[0].length;
   const mask = new Uint8Array( r * c );
   for ( let j = 0; j < r; ++j )
      for ( let i = 0; i < c; ++i )
         mask[j * c + i] = rows[j][i];
   return { mask: mask, cols: c, rows: r, binning: binning === undefined ? 1 : binning };
}
function rectStr( rc ) { return rc === null ? 'null' : [ rc.x0, rc.y0, rc.x1, rc.y1 ].join( ',' ); }

// A fully covered field: the whole thing.
eq( rectStr( M.mtLargestCoveredRect( cov( [ [ 1, 1, 1 ], [ 1, 1, 1 ], [ 1, 1, 1 ] ] ) ) ),
    '0,0,3,3', 'a fully covered field crops to itself' );

// Nothing covered: no rectangle.
eq( rectStr( M.mtLargestCoveredRect( cov( [ [ 0, 0 ], [ 0, 0 ] ] ) ) ),
    'null', 'no coverage -> null' );

// The widest full band wins over the ragged bottom row.
eq( rectStr( M.mtLargestCoveredRect( cov( [ [ 1, 1, 1, 1 ], [ 1, 1, 1, 1 ], [ 0, 0, 0, 0 ] ] ) ) ),
    '0,0,4,2', 'the largest rectangle is the two full rows, not the empty bottom' );

// A tall thin column beats a short wide row.
eq( rectStr( M.mtLargestCoveredRect( cov( [ [ 1, 0 ], [ 1, 0 ], [ 1, 1 ] ] ) ) ),
    '0,0,1,3', 'a 3x1 column (area 3) beats the 2x1 bottom row (area 2)' );

// Binning scales the returned rectangle back to full-resolution pixels.
eq( rectStr( M.mtLargestCoveredRect( cov( [ [ 1, 1, 1, 1 ], [ 1, 1, 1, 1 ], [ 0, 0, 0, 0 ] ], 2 ) ) ),
    '0,0,8,4', 'the coverage binning scales the crop rectangle' );

report( 'geometry' );
