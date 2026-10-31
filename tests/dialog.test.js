// dialog.test.js — Return must never start a run.
//
// From PixInsight 1.9.6 on, a dialog in contained windowing mode (the default)
// presses its default button on Return from any control, an Edit included. A
// default Run button therefore started minutes of processing when someone
// pressed Return to finish typing the output prefix. The dialog is not bundled
// by the harness (it extends the core Dialog class), so this checks its source.
'use strict';

const fs = require( 'fs' );
const path = require( 'path' );
const { eq, ok, report } = require( './assert.js' );

const MT = path.join( __dirname, '..', 'pjsr', 'mosaictoolbox' );
const sources = fs.readdirSync( MT ).filter( f => f.endsWith( '.js' ) )
                  .map( f => fs.readFileSync( path.join( MT, f ), 'utf8' ) ).join( '\n' );
const dialog = fs.readFileSync( path.join( MT, 'MT_Dialog.js' ), 'utf8' );

eq( ( sources.match( /\.defaultButton\s*=\s*true/g ) || [] ).length, 0,
    'no button is made the default: Return would press it from an Edit' );
eq( ( sources.match( /\bextends\s+Dialog\b/g ) || [] ).length, 1,
    'one dialog class, so the check below covers every dialog' );
ok( /constructor\s*\(\s*data\s*\)\s*\{\s*super\(\);[\s\S]{0,900}?this\.autoDefaultButton\s*=\s*false;/.test( dialog ),
    'the main dialog turns off the automatic default button right after super()' );

report( 'dialog' );
