// data.test.js — the data model's business rules.
//
// activeChannels / imagesForChannel decide what the engine is asked to build;
// validate() is the gate that turns a bad table into a clear message instead of
// a mid-run failure, and warnings() is the softer set of things worth saying
// before a run that will still work. All of it is driven here on plain MT_Image
// rows whose views are registered in the shim so isAvailable() is true.
'use strict';

const M = require( './build/module.js' );
const { eq, ok, report } = require( './assert.js' );

M.mtSetLanguage( 'en' );

// Register every view id a test relies on, so MT_Image.isAvailable() is true.
function haveViews( images ) { M.mtTestSetViews( images.map( im => im.viewId ) ); }

function img( viewId, filterKey, tileIndex, solved )
{
   const im = new M.MT_Image( viewId );
   im.filterKey = filterKey;
   im.tileIndex = tileIndex;
   im.solved = ( solved !== false );
   im.enabled = true;
   return im;
}

function shoData()
{
   const d = new M.MosaicToolboxData();
   d.filterEnabled = { L: false, R: false, G: false, B: false, S: true, H: true, O: true };
   return d;
}

// ---- activeChannels / output ids ----
{
   const d = new M.MosaicToolboxData();            // every standard filter on by default
   const chans = d.activeChannels();
   eq( chans.length, 7, 'all seven standard channels are active by default' );
   eq( chans[0].outputId, 'MosaicL', 'the output id is prefix + key' );

   d.filterEnabled = { L: false, R: false, G: false, B: false, S: true, H: true, O: true };
   d.customNames = [ 'Ha3', '', '' ];
   const chans2 = d.activeChannels();
   eq( chans2.length, 4, 'three narrowband channels plus one named custom channel' );
   const custom = chans2[chans2.length - 1];
   eq( custom.key, 'Ha3', 'the custom channel keeps its name as key' );
   eq( custom.outputId, 'MosaicHa3', 'the custom output id is sanitised onto the prefix' );
}

// ---- validate: the happy path ----
{
   const d = shoData();
   d.images = [
      img( 'S0', 'S', 0 ), img( 'S1', 'S', 1 ),
      img( 'H0', 'H', 0 ), img( 'H1', 'H', 1 ),
      img( 'O0', 'O', 0 ), img( 'O1', 'O', 1 )
   ];
   haveViews( d.images );
   eq( d.validate(), null, 'a complete, solved, uniquely-numbered table validates' );
   eq( d.warnings().length, 0, 'and it raises no warnings' );
   eq( d.imagesForChannel( 'S' ).length, 2, 'imagesForChannel returns that channel only' );
}

// ---- validate: duplicate tile numbers within a channel ----
{
   const d = shoData();
   d.images = [ img( 'S0', 'S', 0 ), img( 'Sdup', 'S', 0 ),
                img( 'H0', 'H', 0 ), img( 'O0', 'O', 0 ) ];
   haveViews( d.images );
   const msg = d.validate();
   ok( msg !== null && msg.indexOf( "Channel 'S'" ) >= 0, 'two images on one tile is rejected, naming the channel' );
}

// ---- validate: an unsolved image ----
{
   const d = shoData();
   d.images = [ img( 'S0', 'S', 0, false ), img( 'H0', 'H', 0 ), img( 'O0', 'O', 0 ) ];
   haveViews( d.images );
   const msg = d.validate();
   ok( msg !== null && msg.indexOf( 'S0' ) >= 0, 'an unsolved image is rejected, naming the view' );
}

// ---- validate: nothing selected ----
{
   const d = new M.MosaicToolboxData();
   d.filterEnabled = { L: false, R: false, G: false, B: false, S: false, H: false, O: false };
   d.customNames = [ '', '', '' ];
   const msg = d.validate();
   ok( msg !== null && msg.indexOf( 'No channel' ) >= 0, 'no channel selected is a clear error' );
}

// ---- warnings: empty channel, unequal counts, unassigned, no trim ----
{
   const d = shoData();
   d.trimPixels = 0;
   d.images = [
      img( 'S0', 'S', 0 ), img( 'S1', 'S', 1 ),   // S: 2
      img( 'H0', 'H', 0 ),                         // H: 1  (counts differ)
                                                   // O: 0  (empty channel)
      img( 'U0', '?', 0 )                          // unassigned
   ];
   haveViews( d.images );
   const w = d.warnings();
   ok( w.some( s => s.indexOf( "Channel 'O'" ) >= 0 ), 'the empty channel is warned about' );
   ok( w.some( s => s.indexOf( 'same number of tiles' ) >= 0 ), 'unequal tile counts are warned about' );
   ok( w.some( s => /no channel assigned/.test( s ) ), 'the unassigned image is warned about' );
   ok( w.some( s => /trimming is disabled/i.test( s ) ), 'a zero edge trim is warned about' );
   eq( d.validate(), null, 'none of those are hard errors — the run can still proceed' );
}

report( 'data' );
