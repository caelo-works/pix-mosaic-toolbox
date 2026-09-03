// SPDX-License-Identifier: CC-BY-NC-4.0
// ----------------------------------------------------------------------------
// MosaicToolbox.js
// PixInsight JavaScript Runtime API - PJSR Version 2.0
// ----------------------------------------------------------------------------
//
// One-stop mosaic assembly for PixInsight.
//
//  * Reprojects every selected mosaic tile onto ONE common astrometric grid.
//  * Handles several filters in the same operation. Because every filter is
//    reprojected onto the SAME grid, all outputs share identical coordinates,
//    field of view and pixel dimensions.
//  * Erodes the soft, incomplete edges that reprojection leaves behind.
//  * Joins the tiles photometrically: star flux ratios give the brightness
//    scale, a smoothed surface spline models the residual gradient.
//  * Produces one window per filter: MosaicL, MosaicR, MosaicG, MosaicB,
//    MosaicS, MosaicH, MosaicO, plus any user-named channels.
//
// ============================== REQUIREMENTS ================================
//
//   1. PixInsight >= 1.9.4 (Lockhart).
//   2. All input images plate solved and linear.
//   3. All input images ALREADY CORRECTED FOR GRADIENTS - YAGEx, DBE, ABE, GraXpert, or
//      NormalizeScaleGradient during preprocessing. The join measures the
//      difference between two tiles across their overlap and cancels it; it
//      cannot remove a gradient the tiles have in common, and a strong
//      uncorrected gradient in one tile is propagated into the finished mosaic
//      rather than being fixed by it. Correct the tiles first.
//
// Nothing else. This script is self-contained: it needs no other mosaic script
// installed, and it can live anywhere PixInsight can find it.
//
// ================================ CREDITS ===================================
//
// The astrometric grid computation in mosaictoolbox/MT_Astrometry.js is derived
// from the MosaicByCoordinates script, Copyright (c) 2013-2026 Andres del Pozo
// and (c) 2019-2026 Juan Conejero (PTeam), used under the PixInsight Class
// Library License 2.0 (https://pixinsight.com/license/PCL-License-2.0.html).
//
// The photometric join is MosaicToolbox's own implementation of the published
// technique, built on core PixInsight objects (StarDetector, SurfaceSpline,
// Image). It is not derived from any third-party mosaic script. If you own
// PhotometricMosaic by John Murphy (https://astroprocessing.com/) it remains an
// excellent and considerably more refined tool, with interactive diagnostics
// this script deliberately does not attempt to reproduce.
//
// MosaicToolbox is provided as-is, without warranty of any kind.
// ----------------------------------------------------------------------------

"use strict";
#engine v8

#feature-id MosaicToolbox : CaeloWorks > Mosaic Toolbox

#feature-icon @script_icons_dir/MosaicToolbox.svg

#feature-info Assembles multi-filter mosaics in a single step. Reprojects every \
tile onto one common astrometric grid, erodes the soft edges, and joins the tiles \
photometrically - star flux ratios for the brightness scale, a smoothed surface \
spline for the residual gradient. Every filter is written onto the same grid, so \
MosaicL / MosaicR / MosaicG / MosaicB / MosaicS / MosaicH / MosaicO all share \
identical coordinates, field of view and dimensions.<br/>\
Inputs must be linear, plate solved and already corrected for gradients.<br/>\
Self-contained: no other mosaic script is required.

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

// ----------------------------------------------------------------------------
// The core astrometry headers expect a host script to have defined these.
// AstrometricMetadata's constructor reads SETTINGS_MODULE for the settings
// namespace it persists under, and the projection dialog reads TITLE/VERSION for
// its captions - so they must be defined BEFORE those headers are included.
// This mirrors what MosaicByCoordinates does.
// ----------------------------------------------------------------------------
#define SETTINGS_MODULE "MosaicToolbox"
#define TITLE           "Mosaic Toolbox"
#define VERSION         "__BUILD__"

// ----------------------------------------------------------------------------
// PixInsight core headers
// ----------------------------------------------------------------------------
#include <pjsr/StarDetector.jsh>
#include <pjsr/astrometry/AstrometricMetadata.js>
#include <pjsr/astrometry/ImageReprojection.js>
#include <pjsr/astrometry/ProjectionConfigurationDialog.js>

// ----------------------------------------------------------------------------
// MosaicToolbox modules
// ----------------------------------------------------------------------------
#include "mosaictoolbox/MT_Lang.js"
#include "mosaictoolbox/MT_Globals.js"
#include "mosaictoolbox/MT_Data.js"
#include "mosaictoolbox/MT_Astrometry.js"
#include "mosaictoolbox/MT_Overlap.js"
#include "mosaictoolbox/MT_Photometry.js"
#include "mosaictoolbox/MT_Gradient.js"
#include "mosaictoolbox/MT_Join.js"
#include "mosaictoolbox/MT_Engine.js"
#include "mosaictoolbox/MT_Dialog.js"

// ----------------------------------------------------------------------------

function mtMain()
{
   console.show();
   // Abort is honoured between tiles and between joins - never mid-write, where a
   // half-updated accumulator would be worse than finishing.
   console.abortEnabled = true;
   console.noteln( "\n\n=== <b>" + MT_TITLE() + " " + MT_VERSION() + "</b> ===" );

   let data = new MosaicToolboxData();
   data.restoreSettings();
   mtSetLanguage( data.language );

   // The dialog retranslates itself in place on a language change, so there is
   // no reopen loop: build it once, scan the workspace, and run.
   let dialog = new MosaicToolboxDialog( data );
   dialog.autoDetect( false /*quiet: report if nothing is plate solved*/ );

   if ( !dialog.execute() )
      return;

   data.saveSettings();

   let engine = new MosaicToolboxEngine( data );
   try
   {
      engine.run();
   }
   catch ( x )
   {
      console.criticalln( "*** " + MT_TITLE() + ": " + (x.message ? x.message : x.toString()) );
      new MessageBox( "<p>" + (x.message ? x.message : x.toString()) + "</p>",
                      MT_TITLE(), StdIcon.Error, StdButton.Ok ).execute();
   }
   finally
   {
      engine.dispose();
   }

   // One run per invocation. The source images are untouched, but the workspace
   // has changed underneath the table, so re-showing the same selection would be
   // misleading; start the script again to build more.
}

mtMain();

// ----------------------------------------------------------------------------
// EOF MosaicToolbox.js
