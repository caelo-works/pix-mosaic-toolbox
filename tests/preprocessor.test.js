// preprocessor.test.js — no #define macro name is used as a bare identifier.
//
// The entry point #defines object-like macros (TITLE, VERSION, SETTINGS_MODULE)
// because the core astrometry headers require them. The PixInsight preprocessor
// then textually substitutes every *bare* occurrence of those identifiers —
// including an object key written `{ TITLE: … }`, which silently becomes
// `{ "Mosaic Toolbox": … }` and leaves the matching `%TITLE%` placeholder
// unfilled. It does NOT substitute inside string literals, so the catalogue's
// "%TITLE%" and a quoted key "TITLE" are safe.
//
// The node harness strips #define lines without applying them, so it cannot see
// this collision in the other suites. This one reads the raw source, removes
// comments, string literals and the preprocessor directive lines, and asserts
// that none of the macro names survive as a bare identifier.
'use strict';

const fs = require( 'fs' );
const path = require( 'path' );
const { eq, ok, report } = require( './assert.js' );

const PJSR = path.join( __dirname, '..', 'pjsr' );
const ENTRY = path.join( PJSR, 'MosaicToolbox.js' );
const MODDIR = path.join( PJSR, 'mosaictoolbox' );

const entrySrc = fs.readFileSync( ENTRY, 'utf8' );

// Object-like #define macros (a name followed by a value, not `NAME(`).
const macros = [];
for ( const line of entrySrc.split( '\n' ) )
{
   const m = /^#define\s+([A-Za-z_]\w*)\b(?!\s*\()\s+\S/.exec( line );
   if ( m )
      macros.push( m[1] );
}
ok( macros.length >= 2, 'the entry defines object-like macros (' + macros.join( ', ' ) + ')' );
ok( macros.indexOf( 'TITLE' ) >= 0 && macros.indexOf( 'VERSION' ) >= 0,
    'TITLE and VERSION are among them (the ones mtTv passes as keys)' );

// Remove block comments, line comments, then string literals, then the
// preprocessor directive lines. What remains is executable JavaScript with no
// text that the preprocessor would have left a macro name inside.
function executableOnly( src )
{
   let s = src.replace( /\/\*[\s\S]*?\*\//g, ' ' )     // block comments
             .replace( /\/\/[^\n]*/g, ' ' )            // line comments
             .replace( /"(?:\\.|[^"\\])*"/g, '""' )    // double-quoted strings
             .replace( /'(?:\\.|[^'\\])*'/g, "''" )    // single-quoted strings
             .replace( /`(?:\\.|[^`\\])*`/g, '``' );   // template strings
   // Drop preprocessor directive lines (the #define itself legitimately names
   // the macro). Private class members like #key() are not directives and stay.
   return s.split( '\n' ).filter( line =>
      !/^\s*#(include|define|undef|ifndef|ifdef|elif|endif|else|if|feature-id|feature-info|feature-icon|engine|script-id|pragma|error|warning|import|target)\b/.test( line )
   ).join( '\n' );
}

const files = [ ENTRY ].concat(
   fs.readdirSync( MODDIR ).filter( f => f.endsWith( '.js' ) ).map( f => path.join( MODDIR, f ) ) );

let offences = 0;
for ( const file of files )
{
   const code = executableOnly( fs.readFileSync( file, 'utf8' ) );
   for ( const macro of macros )
   {
      const re = new RegExp( '\\b' + macro + '\\b' );
      if ( re.test( code ) )
      {
         offences++;
         console.error( 'bare macro identifier "' + macro + '" in ' + path.basename( file )
                      + ' — the preprocessor will substitute it. Quote the key, or rename it.' );
      }
   }
}
eq( offences, 0, 'no #define macro name is used as a bare identifier in executable code' );

report( 'preprocessor' );
