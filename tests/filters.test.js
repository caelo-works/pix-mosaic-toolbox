// filters.test.js — FILTER keyword to channel-key mapping.
//
// This is what decides which slot every open image lands in. The two rules that
// matter: an exact alias match wins over a prefix match (so "S" never steals
// "SII"), and among prefix matches the longest alias wins.
'use strict';

const M = require( './build/module.js' );
const { eq, report } = require( './assert.js' );

// ---- normalisation ----
eq( M.mtNormaliseFilter( 'H-alpha 3nm' ), 'HALPHA3NM', 'punctuation and spaces are stripped, upper-cased' );
eq( M.mtNormaliseFilter( 'uv/ir' ), 'UVIR', 'slashes are removed' );
eq( M.mtNormaliseFilter( '' ), '', 'empty stays empty' );

// ---- exact aliases ----
eq( M.mtMatchStandardFilter( 'L' ), 'L', 'L' );
eq( M.mtMatchStandardFilter( 'Red' ), 'R', 'Red -> R' );
eq( M.mtMatchStandardFilter( 'V' ), 'G', 'V (visual) -> G' );
eq( M.mtMatchStandardFilter( 'Blue' ), 'B', 'Blue -> B' );
eq( M.mtMatchStandardFilter( 'UV/IR' ), 'L', 'UV/IR -> L' );
eq( M.mtMatchStandardFilter( 'Ha' ), 'H', 'Ha -> H' );
eq( M.mtMatchStandardFilter( 'OIII' ), 'O', 'OIII -> O' );

// The one the exact-first rule exists for: "S" and "SII" both map to S, but "S"
// must not swallow a longer sulphur label into itself by prefix.
eq( M.mtMatchStandardFilter( 'S' ), 'S', 'S -> S' );
eq( M.mtMatchStandardFilter( 'SII' ), 'S', 'SII -> S (exact, not via the 1-char S)' );
eq( M.mtMatchStandardFilter( 'S-II' ), 'S', 'S-II -> S' );

// ---- prefix matches, longest alias wins ----
eq( M.mtMatchStandardFilter( 'Ha 6nm broadband' ), 'H', 'HA6NM... prefix -> H' );
eq( M.mtMatchStandardFilter( 'SII3nm-extra' ), 'S', 'SII3NM prefix -> S' );

// A single-character alias is never used as a prefix (an > 1 guard), so a random
// word starting with one standard letter does not get mis-assigned.
eq( M.mtMatchStandardFilter( 'Green' ), 'G', 'Green -> G (exact)' );
eq( M.mtMatchStandardFilter( 'Gobbledygook' ), '', 'a word starting with G is not forced to G' );

// ---- no match ----
eq( M.mtMatchStandardFilter( 'XYZ' ), '', 'an unknown filter returns empty' );
eq( M.mtMatchStandardFilter( '' ), '', 'empty returns empty' );
eq( M.mtMatchStandardFilter( '   ' ), '', 'whitespace-only returns empty' );

report( 'filters' );
