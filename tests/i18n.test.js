// i18n.test.js — every user-facing string goes through the catalogue.
//
// Two silent ways a string escapes translation, both guarded here:
//   1. mtT()/mtTv() is called with a key that is not in the catalogue. mtT then
//      returns the key itself, so the text shows in English (or as a bare key)
//      with no error. This checks every literal key actually used in the source
//      — direct, concatenated across lines, and both branches of a ternary —
//      against the catalogue.
//   2. A tooltip is assigned a hard-coded string instead of mtT()/mtTv(). This
//      checks every `.toolTip =` routes through the catalogue (or copies another
//      control's already-translated tooltip).
//
// strings.test.js covers the other half: that every catalogue entry carries a
// French translation with matching placeholders.
'use strict';

const fs = require( 'fs' );
const path = require( 'path' );
const M = require( './build/module.js' );
const { eq, ok, report } = require( './assert.js' );

const PJSR = path.join( __dirname, '..', 'pjsr' );
const files = [ path.join( PJSR, 'MosaicToolbox.js' ) ].concat(
   fs.readdirSync( path.join( PJSR, 'mosaictoolbox' ) )
     .filter( f => f.endsWith( '.js' ) )
     .map( f => path.join( PJSR, 'mosaictoolbox', f ) ) );

const catalogue = M.mtCatalogue();
const keys = new Set( Object.keys( catalogue ) );

// Read one double-quoted string literal starting at src[i] === '"'. Returns the
// decoded value and the index just past the closing quote.
function readString( src, i )
{
   let s = '', j = i + 1;
   while ( j < src.length )
   {
      const c = src[j];
      if ( c === '\\' ) { s += ( src[j + 1] === 'n' ) ? '\n' : src[j + 1]; j += 2; continue; }
      if ( c === '"' ) break;
      s += c; j++;
   }
   return { value: s, next: j + 1 };
}

// The balanced-paren argument text of a call whose '(' is at src[open], with
// string contents skipped so a ')' or ',' inside a literal does not fool it.
function argSpan( src, open )
{
   let depth = 0, i = open;
   for ( ; i < src.length; i++ )
   {
      const c = src[i];
      if ( c === '"' ) { i = readString( src, i ).next - 1; continue; }
      if ( c === '(' || c === '[' || c === '{' ) depth++;
      else if ( c === ')' || c === ']' || c === '}' ) { depth--; if ( depth === 0 ) break; }
   }
   return src.slice( open + 1, i );
}

// The first top-level (depth-0, outside strings) comma-separated segment.
function firstArg( arg )
{
   let depth = 0;
   for ( let i = 0; i < arg.length; i++ )
   {
      const c = arg[i];
      if ( c === '"' ) { i = readString( arg, i ).next - 1; continue; }
      if ( c === '(' || c === '[' || c === '{' ) depth++;
      else if ( c === ')' || c === ']' || c === '}' ) depth--;
      else if ( c === ',' && depth === 0 ) return arg.slice( 0, i );
   }
   return arg;
}

// The literal keys in a key expression. Adjacent strings joined by '+' are one
// key (a concatenation); strings separated by anything else (a ternary's ? :)
// are separate keys. A non-literal key expression (a bare variable) yields none.
function keysFrom( expr )
{
   const out = [];
   let cur = null, lastPlus = false;
   for ( let i = 0; i < expr.length; )
   {
      const c = expr[i];
      if ( /\s/.test( c ) ) { i++; continue; }
      if ( c === '"' )
      {
         const r = readString( expr, i );
         if ( cur === null || lastPlus ) cur = ( cur || '' ) + r.value;
         else { out.push( cur ); cur = r.value; }
         lastPlus = false; i = r.next; continue;
      }
      if ( c === '+' ) { lastPlus = true; i++; continue; }
      if ( cur !== null ) { out.push( cur ); cur = null; }
      lastPlus = false; i++;
   }
   if ( cur !== null ) out.push( cur );
   return out;
}

let checked = 0, missing = 0;
const callRe = /\bmtTv?\(/g;
for ( const file of files )
{
   const src = fs.readFileSync( file, 'utf8' );
   let m;
   while ( ( m = callRe.exec( src ) ) )
   {
      const open = m.index + m[0].length - 1;   // index of '('
      const arg = argSpan( src, open );
      for ( const key of keysFrom( firstArg( arg ) ) )
      {
         checked++;
         if ( !keys.has( key ) )
         {
            missing++;
            console.error( 'mtT key not in catalogue: ' + JSON.stringify( key )
                         + '  (' + path.basename( file ) + ')' );
         }
      }
   }
}
ok( checked > 100, 'a representative number of translated keys were checked (' + checked + ')' );
eq( missing, 0, 'every mtT()/mtTv() key used in the source exists in the catalogue' );

// ---- tooltips must never be a hard-coded string ----
// A `.toolTip =` may hold an mtT()/mtTv() result, another control's already
// translated `.toolTip`, or a variable that received one (e.g. the toolTip
// parameter of #makeAutoCheckBox). The only failure is a string LITERAL on the
// right-hand side that is not wrapped in mtT()/mtTv().
let tipTotal = 0, tipBad = 0;
for ( const file of files )
{
   const src = fs.readFileSync( file, 'utf8' );
   src.split( '\n' ).forEach( ( line, i ) =>
   {
      if ( !/\.toolTip\s*=[^=]/.test( line ) )      // an assignment, not ==
         return;
      tipTotal++;
      const rhs = line.replace( /^[^=]*=/, '' );
      if ( /"/.test( rhs ) && !/mtTv?\s*\(/.test( rhs ) )   // a bare string literal
      {
         tipBad++;
         console.error( 'hard-coded tooltip in ' + path.basename( file ) + ':' + ( i + 1 ) + '  ' + line.trim() );
      }
   } );
}
ok( tipTotal > 20, 'the dialog actually sets tooltips (' + tipTotal + ')' );
eq( tipBad, 0, 'every tooltip is translated through the catalogue' );

report( 'i18n' );
