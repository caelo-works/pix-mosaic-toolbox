// strings.test.js — the English/French catalogue holds together.
//
// The script's whole interface, its tooltips (its real documentation) and every
// error and warning are translated. Four things must stay true for that to be
// safe, and each is asserted here: every entry carries a French string; the
// printf placeholders match between the source and the French, in the same
// order, so format() can be applied to whichever mtT() returns; the named
// %NAME% placeholders match as a set; and mtT()/mtTv() fall back and substitute
// the way the rest of the code assumes.
'use strict';

const M = require( './build/module.js' );
const { eq, ok, report } = require( './assert.js' );

// The English source of an entry is its explicit `en`, or the key itself.
function source( key, entry ) { return ( entry.en !== undefined ) ? entry.en : key; }

// Positional printf conversions, in order. Order matters: format() is positional.
// Escaped %% is a literal percent, not a conversion, so it is removed first; and
// the space flag is not admitted, because a closing % of a %NAME% placeholder
// followed by a word ("%N% extra") would otherwise read as "% e".
function positional( s ) { return ( String( s ).replace( /%%/g, '' ).match( /%[-+0]*\d*(?:\.\d+)?[dfsge]/g ) || [] ); }
// Named %NAME% placeholders, as a set: mtTv substitutes them by name, so order
// is free but the set must match.
function named( s ) { return ( String( s ).match( /%[A-Z][A-Z0-9_]*%/g ) || [] ).sort(); }

const cat = M.mtCatalogue();
const keys = Object.keys( cat );
ok( keys.length > 100, 'the catalogue is populated (' + keys.length + ' entries)' );

let missingFr = 0, badPositional = 0, badNamed = 0;
for ( const key of keys )
{
   const entry = cat[key];
   if ( typeof entry.fr !== 'string' || entry.fr.length === 0 )
   {
      missingFr++;
      console.error( 'no French for: ' + JSON.stringify( key ) );
      continue;
   }
   const src = source( key, entry );
   if ( positional( src ).join( '|' ) !== positional( entry.fr ).join( '|' ) )
   {
      badPositional++;
      console.error( 'placeholder order differs for ' + JSON.stringify( key )
                   + '\n  en: ' + positional( src ).join( ' ' )
                   + '\n  fr: ' + positional( entry.fr ).join( ' ' ) );
   }
   if ( named( src ).join( '|' ) !== named( entry.fr ).join( '|' ) )
   {
      badNamed++;
      console.error( 'named placeholders differ for ' + JSON.stringify( key ) );
   }
}
eq( missingFr, 0, 'every catalogue entry carries a French string' );
eq( badPositional, 0, 'positional placeholders match between languages, in order' );
eq( badNamed, 0, 'named %NAME% placeholders match between languages' );

// ---- mtT: lookup, fallback ----
M.mtSetLanguage( 'en' );
eq( M.mtT( 'Channels' ), 'Channels', 'English returns the key when there is no en override' );
eq( M.mtT( 'this key does not exist at all' ), 'this key does not exist at all',
    'an unknown key returns itself, never a placeholder' );

M.mtSetLanguage( 'fr' );
eq( M.mtT( 'Channels' ), cat['Channels'].fr, 'French returns the fr string' );
eq( M.mtLanguage(), 'fr', 'the active language is reported' );
eq( M.mtT( 'this key does not exist at all' ), 'this key does not exist at all',
    'an unknown key returns itself in French too' );

// An unknown language code is treated as English (mtSetLanguage only accepts fr).
M.mtSetLanguage( 'de' );
eq( M.mtLanguage(), 'en', 'an unrecognised language code falls back to English' );

// ---- mtTv: %NAME% substitution, without pattern re-expansion ----
M.mtSetLanguage( 'en' );
// A value containing $& must be inserted literally, not treated as a replacement
// pattern — output prefixes are user-typed and can contain anything.
const catalogueHasNamed = keys.some( k => named( source( k, cat[k] ) ).length > 0 );
ok( catalogueHasNamed, 'the catalogue actually uses %NAME% placeholders somewhere' );

// Drive mtTv directly through a synthetic entry-free key: mtT returns the key,
// so the key itself is the template.
eq( M.mtTv( 'prefix is %NAME% here', { NAME: 'a$&b' } ), 'prefix is a$&b here',
    'mtTv inserts a $&-bearing value literally' );
eq( M.mtTv( 'x=%A%, y=%B%, x=%A%', { A: '1', B: '2' } ), 'x=1, y=2, x=1',
    'mtTv replaces every occurrence of each name' );

report( 'strings' );
