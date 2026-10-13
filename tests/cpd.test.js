// cpd.test.js — the script's external-program surface stays what the docs say.
//
// CPD Program Rules v1.0, rule 5.3: a product may launch an external program only
// as described in its documentation, never without the user's knowledge. The
// README and the header link's tooltip state that the only program the script
// starts is the OS URL handler, on a click of the header link, to open the
// product's own page. This suite holds the source to that statement:
//   - ExternalProcess is used in exactly one place, mtOpenInBrowser();
//   - no shell interpreter is started (cmd, sh, bash, powershell...);
//   - mtOpenInBrowser() is called only with the hard-coded MT_PRODUCT_URL();
//   - that URL is https and is the product's own page (rule 6.4: identification,
//     not the catalogue of other products).
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
const sources = files.map( f => ( { name: path.basename( f ), text: fs.readFileSync( f, 'utf8' ) } ) );

function count( re ) { return sources.reduce( ( n, s ) => n + ( s.text.match( re ) || [] ).length, 0 ); }

eq( count( /new\s+ExternalProcess\b/g ), 1, 'ExternalProcess is constructed in exactly one place' );

const dialog = sources.find( s => s.name === 'MT_Dialog.js' ).text;
const fnStart = dialog.indexOf( 'function mtOpenInBrowser' );
ok( fnStart >= 0, 'mtOpenInBrowser() exists' );
const fnBody = dialog.slice( fnStart, dialog.indexOf( '\n}', fnStart ) );
ok( /new\s+ExternalProcess\b/.test( fnBody ), 'that one ExternalProcess lives in mtOpenInBrowser()' );

eq( count( /\.start\(\s*"(cmd|cmd\.exe|sh|bash|zsh|powershell|pwsh)"/g ), 0,
    'no shell interpreter is ever started' );
ok( /\.start\(\s*"explorer\.exe"/.test( fnBody ), 'Windows opens the URL with explorer.exe, not a shell' );

const calls = sources.reduce( ( a, s ) => a.concat( s.text.match( /mtOpenInBrowser\(\s*[^)]*\)/g ) || [] ), [] )
                     .filter( c => !/mtOpenInBrowser\(\s*url\s*\)/.test( c ) );   // the definition itself
ok( calls.length >= 1, 'mtOpenInBrowser() is called somewhere (the header link)' );
eq( calls.filter( c => !/MT_PRODUCT_URL\(\s*\)/.test( c ) ).length, 0,
    'mtOpenInBrowser() is only ever called with MT_PRODUCT_URL()' );

const url = M.MT_PRODUCT_URL();
ok( /^https:\/\//.test( url ), 'the product URL is https' );
ok( /\/scripts\/pix-mosaic-toolbox$/.test( url ), 'the product URL is the script\'s own page, not the catalogue' );

report( 'cpd' );
