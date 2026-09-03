// layout.test.js — the join layout and the order tiles are joined in.
//
// These operate on plain {x0,y0,x1,y1} rectangles on the common grid, with no
// PixInsight object involved. mtOrderByConnectivity is the important one: it
// orders the fragments of a channel so each one overlaps what has already been
// assembled, and it is where a stranded or trimmed-too-tight channel is
// diagnosed.
'use strict';

const M = require( './build/module.js' );
const { eq, near, ok, throws, report } = require( './assert.js' );

M.mtSetLanguage( 'en' );

// ---- intersection area ----
eq( M.mtIntersectionArea( { x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 5, y0: 5, x1: 15, y1: 15 } ), 25, 'overlap area' );
eq( M.mtIntersectionArea( { x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 20, y0: 0, x1: 30, y1: 10 } ), 0, 'disjoint -> 0' );
eq( M.mtIntersectionArea( { x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10, y0: 0, x1: 20, y1: 10 } ), 0, 'edge-touching -> 0' );

// ---- union of tile rectangles ----
const rects = { 0: { x0: 0, y0: 0, x1: 10, y1: 10 }, 1: { x0: 5, y0: 5, x1: 20, y1: 8 } };
eq( JSON.stringify( M.mtUnionTileRect( rects, [ 0, 1 ] ) ),
    JSON.stringify( { x0: 0, y0: 0, x1: 20, y1: 10 } ), 'union of two tiles' );
eq( JSON.stringify( M.mtUnionTileRect( rects, [ 0, 99 ] ) ),
    JSON.stringify( { x0: 0, y0: 0, x1: 10, y1: 10 } ), 'a missing tile index is skipped' );
eq( JSON.stringify( M.mtUnionTileRect( rects, [] ) ),
    JSON.stringify( { x0: 0, y0: 0, x1: 0, y1: 0 } ), 'no tiles -> a zero rect' );

// ---- 1-D clustering ----
const groups = M.mtCluster( [ { v: 5.1 }, { v: 1 }, { v: 1.2 }, { v: 5 } ], 0.5 );
eq( groups.length, 2, 'two clusters at tolerance 0.5' );
eq( groups[0].length, 2, 'the low cluster holds two' );
eq( groups[1].length, 2, 'the high cluster holds two' );
eq( M.mtCluster( [], 1 ).length, 0, 'no items -> no groups' );

// ---- order by connectivity ----
const A = { tiles: [ 0 ], rect: { x0: 0,  y0: 0, x1: 10, y1: 10 } };
const B = { tiles: [ 1 ], rect: { x0: 8,  y0: 0, x1: 22, y1: 10 } };
const C = { tiles: [ 2 ], rect: { x0: 20, y0: 0, x1: 30, y1: 10 } };
// Fed out of order: A does not touch C, but B bridges them.
const ordered = M.mtOrderByConnectivity( [ A, C, B ], 'row', 0 );
eq( ordered.map( f => f.tiles[0] ).join( ',' ), '0,1,2', 'fragments are reordered so each overlaps the assembled part' );
eq( M.mtOrderByConnectivity( [ A ], 'row', 0 ).length, 1, 'a single fragment is returned as-is' );

// A gap with no bridge and no slack is a stranded channel.
throws( () => M.mtOrderByConnectivity(
           [ { tiles: [ 0 ], rect: { x0: 0, y0: 0, x1: 10, y1: 10 } },
             { tiles: [ 2 ], rect: { x0: 20, y0: 0, x1: 30, y1: 10 } } ], 'row', 0 ),
        /3 cannot reach/, 'a disjoint fragment throws err.stranded naming the tile' );

// A gap of 1 px that the (given) slack would bridge is reported as trim-too-tight.
throws( () => M.mtOrderByConnectivity(
           [ { tiles: [ 0 ], rect: { x0: 0,  y0: 0, x1: 10, y1: 10 } },
             { tiles: [ 1 ], rect: { x0: 11, y0: 0, x1: 20, y1: 10 } } ], 'row', 2 ),
        /only just touch/, 'a barely-touching fragment throws err.trimTooTight' );

// ---- plate scale ----
// 1 arcsec/px at 1000 mm focal length is ~4.848 micron pixels.
near( M.mtPixelSizeForResolution( 1 / 3600, 1000 ), 4.8481, 'pixel size from resolution and focal length', 1e-3 );

// ---- describe layout ----
eq( M.mtDescribeLayout( { strips: [ { tiles: [ 0 ] } ], stripsAreRows: true } ),
    M.mtT( 'A single tile; no joins are required.' ), 'a single tile needs no joins' );
const desc = M.mtDescribeLayout( { strips: [ { tiles: [ 0, 1 ] }, { tiles: [ 2 ] } ], stripsAreRows: true } );
ok( desc.indexOf( 'Row 1: tiles 1, 2' ) >= 0, 'the description numbers rows and tiles from 1' );
ok( desc.indexOf( 'Row 2: tiles 3' ) >= 0, 'the second row is described too' );

report( 'layout' );
