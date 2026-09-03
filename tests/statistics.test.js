// statistics.test.js — the robust statistics under the photometric fit.
//
// mtMedian / mtMAD / mtMean are the floor of every scale and gradient estimate.
// They take an optional length so a partially filled buffer is measured over
// its used leading entries only — the shape the photometry and sample passes
// actually produce.
'use strict';

const M = require( './build/module.js' );
const { eq, near, report } = require( './assert.js' );

// ---- median ----
eq( M.mtMedian( [3, 1, 2] ), 2, 'odd-length median' );
eq( M.mtMedian( [1, 2, 3, 4] ), 2.5, 'even-length median is the mean of the two middles' );
eq( M.mtMedian( [] ), 0, 'empty median is 0' );
eq( M.mtMedian( [42] ), 42, 'single element' );
// Numeric sort, not lexical: a lexical sort would order 10 before 2.
eq( M.mtMedian( [2, 10, 3] ), 3, 'sorts numerically, not as strings' );
// Partial fill: only the first n entries count.
eq( M.mtMedian( [5, 1, 2, 999, 888], 3 ), 2, 'partial fill measures the leading n only' );
// A typed array, the real input type.
eq( M.mtMedian( Float64Array.from( [4, 2, 8, 6] ) ), 5, 'works on a Float64Array' );

// ---- MAD (scaled to sigma) ----
// [1..5], median 3, abs devs [2,1,0,1,2] -> median dev 1, * 1.4826.
near( M.mtMAD( [1, 2, 3, 4, 5], 3 ), 1.4826, 'MAD is the median absolute deviation times 1.4826', 1e-12 );
eq( M.mtMAD( [], 0 ), 0, 'empty MAD is 0' );
// Even count, partial fill.
near( M.mtMAD( [10, 12, 14, 16], 13 ), 1.4826 * 2, 'even-count MAD', 1e-12 );

// ---- mean ----
eq( M.mtMean( [1, 2, 3, 4] ), 2.5, 'mean' );
eq( M.mtMean( [], 0 ), 0, 'empty mean is 0' );
eq( M.mtMean( [10, 20, 30, 999], 3 ), 20, 'partial-fill mean' );

report( 'statistics' );
