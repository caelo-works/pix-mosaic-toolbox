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

// Blank out comments and string contents, then drop the preprocessor directive
// lines. What remains is executable JavaScript with no text that the
// preprocessor would have left a macro name inside. A char-by-char scan rather
// than a set of regexes, because a `//` inside a string (the maintainer URL) or
// an apostrophe inside a French catalogue string desyncs a regex stripper — the
// exact failure this guard exists to be trusted about.
function executableOnly( src )
{
   let out = '';
   const NORMAL = 0, LINE = 1, BLOCK = 2, DQ = 3, SQ = 4, TMPL = 5;
   let st = NORMAL;
   for ( let i = 0; i < src.length; )
   {
      const c = src[i], d = src[i + 1];
      switch ( st )
      {
      case NORMAL:
         if ( c === '/' && d === '/' ) { st = LINE;  i += 2; }
         else if ( c === '/' && d === '*' ) { st = BLOCK; i += 2; }
         else if ( c === '"' )  { st = DQ;   out += '""'; i += 1; }
         else if ( c === "'" )  { st = SQ;   out += "''"; i += 1; }
         else if ( c === '`' )  { st = TMPL; out += '``'; i += 1; }
         else { out += c; i += 1; }
         break;
      case LINE:
         if ( c === '\n' ) { st = NORMAL; out += '\n'; }
         i += 1;
         break;
      case BLOCK:
         if ( c === '*' && d === '/' ) { st = NORMAL; i += 2; }
         else { if ( c === '\n' ) out += '\n'; i += 1; }
         break;
      case DQ:
         if ( c === '\\' ) i += 2;
         else if ( c === '"' ) { st = NORMAL; i += 1; }
         else i += 1;
         break;
      case SQ:
         if ( c === '\\' ) i += 2;
         else if ( c === "'" ) { st = NORMAL; i += 1; }
         else i += 1;
         break;
      case TMPL:
         if ( c === '\\' ) i += 2;
         else if ( c === '`' ) { st = NORMAL; i += 1; }
         else i += 1;
         break;
      }
   }
   // Drop preprocessor directive lines (the #define itself legitimately names
   // the macro). Private class members like #key() are not directives and stay.
   return out.split( '\n' ).filter( line =>
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
