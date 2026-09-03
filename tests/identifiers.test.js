// identifiers.test.js — view identifiers, enum resolution, coordinate strings.
//
// mtSanitiseId / mtUniqueId produce the output window names; mtEnumValue must
// fall back to the first (best) member when a stored name is unknown — a
// numeric fallback of 0 would silently mean nearest-neighbour reprojection;
// mtFormatRA / mtFormatDec are what the table and the console show.
'use strict';

const M = require( './build/module.js' );
const { eq, report } = require( './assert.js' );

// ---- sanitise ----
eq( M.mtSanitiseId( 'M 31!' ), 'M_31', 'spaces and punctuation collapse to a single underscore' );
eq( M.mtSanitiseId( '__Mosaic__' ), 'Mosaic', 'leading and trailing underscores are trimmed' );
eq( M.mtSanitiseId( 'a---b' ), 'a_b', 'runs of separators collapse' );
eq( M.mtSanitiseId( '!!!' ), '', 'nothing usable leaves an empty string' );
eq( M.mtSanitiseId( 'Ha_3nm' ), 'Ha_3nm', 'a valid identifier is unchanged' );

// ---- unique id (driven by the view registry shim) ----
M.mtTestSetViews( [] );
eq( M.mtUniqueId( 'Mosaic' ), 'Mosaic', 'no clash -> the id itself' );

M.mtTestSetViews( [ 'Mosaic' ] );
eq( M.mtUniqueId( 'Mosaic' ), 'Mosaic_2', 'one clash -> _2' );

M.mtTestSetViews( [ 'Mosaic', 'Mosaic_2', 'Mosaic_3' ] );
eq( M.mtUniqueId( 'Mosaic' ), 'Mosaic_4', 'skips every taken suffix' );

M.mtTestSetViews( [] );
eq( M.mtUniqueId( '123' ), '_123', 'a leading digit is prefixed so the id is valid' );
eq( M.mtUniqueId( '!!!' ), 'MT_view', 'an id that sanitises to nothing gets a safe base' );

// ---- enum resolution ----
eq( M.mtInterpolationValue( 'Lanczos4' ), 101, 'a known interpolation name resolves to its value' );
eq( M.mtInterpolationValue( 'NoSuchThing' ), 100,
    'an unknown name falls back to the first item (Auto), never a raw 0' );
eq( M.mtProjectionValue( 'Gnomonic' ), 200, 'a known projection name resolves' );
eq( M.mtProjectionValue( 'NoSuchThing' ), 200, 'an unknown projection falls back to the first (Gnomonic)' );
// mtEnumItems skips members absent from the running PixInsight.
eq( M.mtEnumValue( M.mtEnumItems( { A: 7 }, [ { text: 'a', name: 'A' }, { text: 'b', name: 'B' } ] ), 'B' ),
    7, 'a member missing from the enumeration is dropped, and lookup falls back to the first present one' );
eq( M.mtEnumValue( [], 'anything' ), 0, 'an empty item list yields 0' );

// ---- coordinate formatting ----
eq( M.mtFormatRA( 0 ), '00 00 00.0', 'RA zero' );
eq( M.mtFormatRA( 15 ), '01 00 00.0', 'RA 15 deg = 1 h' );
eq( M.mtFormatRA( 180 ), '12 00 00.0', 'RA 180 deg = 12 h' );
eq( M.mtFormatRA( -15 ), '23 00 00.0', 'negative RA wraps into [0,24) h' );

eq( M.mtFormatDec( 0 ), '+00 00 00', 'Dec zero carries a + sign' );
eq( M.mtFormatDec( 12.5 ), '+12 30 00', 'Dec 12.5 deg = +12 30 00' );
eq( M.mtFormatDec( -45.5 ), '-45 30 00', 'negative Dec' );

report( 'identifiers' );
