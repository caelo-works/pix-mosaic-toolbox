// SPDX-License-Identifier: CC-BY-NC-4.0
// ----------------------------------------------------------------------------
// MT_Dialog.js - MosaicToolbox
//
// The user interface: pick the channels, check the auto-detected tile table,
// adjust the grid / trim / join settings, run.
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Small UI helpers, shared with the header and the button row. The same shape
// every CaeloWorks script wears, so a user who knows one recognises the next.
// ----------------------------------------------------------------------------

/** The emblem file, looked for beside the script and in the installed icon dir. */
function MT_ICON_NAME() { return "MosaicToolbox.svg"; }

/**
 * Assign a core icon resource to a button, degrading to a text fallback rather
 * than throwing inside the constructor (which would kill the script before the
 * dialog ever appeared).
 */
function mtSetIcon( dialog, button, resource, fallbackText )
{
   try
   {
      let bmp = dialog.scaledResource( resource );
      if ( bmp !== null && bmp !== undefined && !bmp.isNull )
      {
         button.icon = bmp;
         return true;
      }
   }
   catch ( x ) { /* fall through to the text fallback */ }
   if ( fallbackText !== null && fallbackText !== undefined )
      button.text = fallbackText;
   return false;
}

/**
 * Open a URL with the platform's default handler. The maintainer line in the
 * header is a link, and PJSR has no browser of its own. A header that cannot
 * open a browser is not a reason to stop working.
 */
function mtOpenInBrowser( url )
{
   try
   {
      let plat = String( CoreApplication.platform );
      let P = new ExternalProcess;
      if ( /win|mswindows/i.test( plat ) )
         P.start( "cmd", [ "/c", "start", "", url ] );
      else if ( /mac|osx/i.test( plat ) )
         P.start( "/usr/bin/open", [ url ] );
      else
         P.start( "xdg-open", [ url ] );
      if ( P.waitForStarted )
         P.waitForStarted();
   }
   catch ( x )
   {
      console.warningln( "Could not open " + url );
   }
}

// ----------------------------------------------------------------------------

class MosaicToolboxDialog extends Dialog
{
   /**
    * @param {MosaicToolboxData} data
    */
   constructor( data )
   {
      super();
      let self = this;
      this.data = data;

      let emWidth = this.font.width( 'M' );
      // Measured from the translated labels: a fixed English yardstick leaves the
      // French control column stepping in and out of line, since minWidth is a
      // floor rather than a width.
      let labelWidth = 0;
      for ( let t of [ "Other channels:", "Set channel:", "Set tile:", "Edge trim:",
                       "Interpolation:", "Clamping:", "Join mode:", "Blend band:",
                       "Join order:", "Star detection:", "Sample size:", "Star rejection:",
                       "Smoothness:", "Output prefix:", "Auto resolution", "Auto rotation",
                       "Auto centre", "Auto projection", "Auto dimensions" ] )
         labelWidth = Math.max( labelWidth, this.font.width( mtT( t ) + "MM" ) );
      this.windowTitle = MT_TITLE() + " " + MT_VERSION();

      // The dialog's natural height follows the platform's UI font, which is
      // taller on macOS and on most Linux desktops than on Windows. Never let
      // it open taller than a small laptop screen, or the button row at the
      // bottom becomes unreachable and the dialog cannot be shrunk.
      this.maxDialogHeight = this.logicalPixelsToPhysical( 860 );

      // =====================================================================
      // Language
      //
      // Changing it retranslates the whole dialog in place (see applyLanguage
      // below), so nothing is closed and nothing the user has set up is lost.
      // =====================================================================
      let language_Label = new Label( this );
      language_Label.text = mtT( "Language:" );
      language_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;

      this.languageCodes = [];
      this.language_ComboBox = new ComboBox( this );
      for ( let l of MT_LANGUAGES() )
      {
         // Language names stay in their own language - that is how a reader who
         // cannot read the current one finds theirs.
         this.language_ComboBox.addItem( l.label );
         this.languageCodes.push( l.code );
      }
      this.language_ComboBox.currentItem = Math.max( 0, this.languageCodes.indexOf( data.language ) );
      this.language_ComboBox.toolTip = mtT( "tip.language" );
      this.language_ComboBox.onItemSelected = function ( i )
      {
         let code = self.languageCodes[i];
         if ( code === data.language )
            return;
         // Retranslate in place rather than closing and reopening the window,
         // the way the sibling CaeloWorks scripts do. applyLanguage() persists
         // the choice itself.
         self.applyLanguage( code );
      };

      // =====================================================================
      // Header: emblem, title, the maintainer/version line, and the language
      // selector on one row; the tagline and the descriptive paragraphs below.
      // The same shape the other CaeloWorks PixInsight scripts wear.
      // =====================================================================

      // The menu icon, painted at the header's left. Looked for where a dev
      // staging puts it (assets/ beside the module folder), then where the
      // package installs it (rsc/icons/script/). Sized in physical pixels so it
      // follows a high-density display's UI scaling, and null on any failure so
      // the header simply loses its emblem rather than the dialog failing to open.
      this.emblem_Control = (function ( dlg )
      {
         let here = File.extractDrive( #__FILE__ ) + File.extractDirectory( #__FILE__ );
         let name = MT_ICON_NAME();
         let candidates = [ here + "/../assets/" + name,
                            here + "/assets/" + name,
                            here + "/" + name,
                            // This module lives in mosaictoolbox/, so the PixInsight
                            // root is five levels up from the vendor directory.
                            here + "/../../../../../rsc/icons/script/MosaicToolbox/" + name ];
         let px = (typeof dlg.logicalPixelsToPhysical == "function")
                ? dlg.logicalPixelsToPhysical( 44 ) : 44;
         let bmp = null;
         for ( let i = 0; i < candidates.length && bmp === null; ++i )
            try
            {
               if ( File.exists( candidates[i] ) )
               {
                  let b = new Bitmap( candidates[i] );
                  bmp = (typeof b.scaledTo == "function") ? b.scaledTo( px, px ) : b;
               }
            }
            catch ( x ) { bmp = null; }
         if ( bmp === null )
            return null;
         let ctrl = new Control( dlg );
         ctrl.setScaledFixedSize( 44, 44 );
         ctrl.__bmp = bmp;
         ctrl.onPaint = function ()
         {
            let g = new Graphics( this );
            try { g.drawBitmap( 0, 0, this.__bmp ); } catch ( x ) {}
            g.end();
         };
         return ctrl;
      })( this );

      let titleName_Label = new Label( this );
      titleName_Label.text = MT_TITLE();
      {
         let tf = titleName_Label.font;
         tf.bold = true;
         tf.pointSize = Math.round( this.font.pointSize * 1.7 );
         titleName_Label.font = tf;
      }

      // Version and maintainer. The author's name is deliberately not shown here
      // (see NOTICE.md); the Caelo Works link is the distribution identity, the
      // same as the sibling scripts.
      let by_Label = new Label( this );
      by_Label.useRichText = true;
      by_Label.textAlignment = TextAlignment.Left | TextAlignment.VertCenter;
      by_Label.text = "v" + MT_VERSION() + " &middot; <a href='#'>Caelo Works</a>";
      by_Label.onMousePress = function () { mtOpenInBrowser( "https://pixinsight-scripts.caelo.works/" ); };
      try { by_Label.cursor = new Cursor( StdCursor_PointingHand ); } catch ( x ) {}

      let titleColumn_Sizer = new VerticalSizer;
      titleColumn_Sizer.add( titleName_Label );
      titleColumn_Sizer.add( by_Label );

      this.header_Sizer = new HorizontalSizer;
      this.header_Sizer.scaledSpacing = 10;
      if ( this.emblem_Control !== null )
         this.header_Sizer.add( this.emblem_Control );
      this.header_Sizer.add( titleColumn_Sizer );
      this.header_Sizer.addStretch();
      this.header_Sizer.add( language_Label );
      this.header_Sizer.addSpacing( 4 );
      this.header_Sizer.add( this.language_ComboBox );

      this.tagline_Label = new Label( this );
      this.tagline_Label.useRichText = true;
      this.tagline_Label.wordWrapping = true;
      this.tagline_Label.text = "<i>" + mtT( "ui.tagline" ) + "</i>";

      // The requirement notes are useful once and then in the way, so they live
      // in a "Help" section that opens collapsed, like the advanced grid below.
      this.desc_Label = new Label( this );
      this.desc_Label.useRichText = true;
      this.desc_Label.wordWrapping = true;
      this.desc_Label.minWidth = 60 * emWidth;
      this.desc_Label.text = mtT( "ui.header" );

      let help_Control = new Control( this );
      help_Control.sizer = new VerticalSizer;
      help_Control.sizer.scaledSpacing = 4;
      help_Control.sizer.add( this.desc_Label );

      let help_Section = new SectionBar( this, mtT( "Help" ) );
      help_Section.setSection( help_Control );

      // =====================================================================
      // Channels
      // =====================================================================
      this.filterCheckBoxes = {};
      let filterSizer = new HorizontalSizer;
      filterSizer.scaledSpacing = 8;
      for ( let f of MT_STANDARD_FILTERS() )
      {
         let cb = new CheckBox( this );
         cb.text = f.key;
         cb.toolTip = mtTv( "tip.filter", { LABEL: mtT( f.label ),
                                          ID: data.outputPrefix + f.key } );
         cb.checked = data.filterEnabled[f.key];
         cb.mtKey = f.key;
         cb.onCheck = function ( checked )
         {
            data.filterEnabled[this.mtKey] = checked;
            self.refreshTree();
         };
         this.filterCheckBoxes[f.key] = cb;
         filterSizer.add( cb );
      }
      filterSizer.addStretch();

      let customLabel = new Label( this );
      customLabel.text = mtT( "Other channels:" );
      customLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      customLabel.minWidth = labelWidth;
      customLabel.toolTip = mtTv( "tip.custom", { N: MT_CUSTOM_SLOTS(),
                                                 PREFIX: data.outputPrefix } );

      this.customEdits = [];
      let customSizer = new HorizontalSizer;
      customSizer.scaledSpacing = 4;
      customSizer.add( customLabel );
      for ( let i = 0; i < MT_CUSTOM_SLOTS(); ++i )
      {
         let e = new Edit( this );
         e.text = data.customNames[i];
         e.minWidth = 12 * emWidth;
         e.mtIndex = i;
         e.toolTip = customLabel.toolTip;
         e.onEditCompleted = function ()
         {
            data.customNames[this.mtIndex] = this.text.trim();
            self.rebuildChannelCombo();
            self.refreshTree();
         };
         this.customEdits.push( e );
         customSizer.add( e );
      }
      customSizer.addStretch();

      let channels_Control = new Control( this );
      channels_Control.sizer = new VerticalSizer;
      channels_Control.sizer.scaledSpacing = 4;
      channels_Control.sizer.add( filterSizer );
      channels_Control.sizer.add( customSizer );

      let channels_Section = new SectionBar( this, mtT( "Channels" ) );
      channels_Section.setSection( channels_Control );

      // =====================================================================
      // Images
      // =====================================================================
      this.tree = new TreeBox( this );
      this.tree.numberOfColumns = 7;
      this.tree.setHeaderText( 0, mtT( "Window" ) );
      this.tree.setHeaderText( 1, mtT( "Channel" ) );
      this.tree.setHeaderText( 2, mtT( "Tile" ) );
      this.tree.setHeaderText( 3, mtT( "FILTER" ) );
      this.tree.setHeaderText( 4, mtT( "RA" ) );
      this.tree.setHeaderText( 5, mtT( "Dec" ) );
      this.tree.setHeaderText( 6, mtT( "arcsec/px" ) );
      this.tree.headerVisible = true;
      this.tree.rootDecoration = false;
      this.tree.alternateRowColor = true;
      this.tree.multipleSelection = true;
      // Font-derived, so this follows the platform's UI font and its display
      // scaling on its own - font.width()/font.height are already physical
      // pixels, which is why this uses the unscaled setter. 8 rows, not more:
      // a TreeBox row is font.height plus style-dependent item padding, and
      // this is the largest fixed block in the dialog, so a generous floor is
      // what pushes the whole window past a small laptop screen under the
      // taller default fonts macOS and most Linux desktops use. The tree has
      // the stretch factor, so it grows past this whenever there is room.
      this.tree.setMinSize( 78 * emWidth, 8 * this.font.height );
      this.tree.toolTip = mtT( "tip.tree" );
      this.updatingTree = false;
      this.tree.onNodeUpdated = function ( node, column )
      {
         // Ignore the events that populating the tree would generate; only a
         // click from the user may change the image list.
         if ( self.updatingTree )
            return;
         if ( column === 0 && node.mtIndex !== undefined )
            data.images[node.mtIndex].enabled = node.checked;
      };

      let refresh_Button = new PushButton( this );
      refresh_Button.text = mtT( "Rescan windows" );
      refresh_Button.toolTip = mtT( "tip.rescan" );
      refresh_Button.onClick = function () { self.autoDetect( false ); };

      let renumber_Button = new PushButton( this );
      renumber_Button.text = mtT( "Renumber tiles" );
      renumber_Button.toolTip = mtT( "tip.renumber" );
      renumber_Button.onClick = function ()
      {
         self.assignTiles();
         self.refreshTree();
      };

      let remove_Button = new PushButton( this );
      remove_Button.text = mtT( "Remove selected" );
      remove_Button.toolTip = mtT( "tip.remove" );
      remove_Button.onClick = function ()
      {
         let doomed = {};
         for ( let node of self.tree.selectedNodes )
            if ( node.mtIndex !== undefined )
               doomed[node.mtIndex] = true;
         data.images = data.images.filter( (im, i) => !doomed[i] );
         self.refreshTree();
      };

      let treeButtons = new HorizontalSizer;
      treeButtons.scaledSpacing = 6;
      treeButtons.add( refresh_Button );
      treeButtons.add( renumber_Button );
      treeButtons.add( remove_Button );
      treeButtons.addStretch();

      let setChannel_Label = new Label( this );
      setChannel_Label.text = mtT( "Set channel:" );
      setChannel_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;

      this.channel_ComboBox = new ComboBox( this );
      this.channel_ComboBox.toolTip = mtT( "tip.setChannel" );

      let applyChannel_Button = new PushButton( this );
      applyChannel_Button.text = mtT( "Apply" );
      applyChannel_Button.toolTip = mtT( "tip.applyChannel" );
      applyChannel_Button.onClick = function ()
      {
         let keys = self.channelComboKeys;
         let i = self.channel_ComboBox.currentItem;
         if ( i < 0 || i >= keys.length )
            return;
         for ( let node of self.tree.selectedNodes )
            if ( node.mtIndex !== undefined )
               data.images[node.mtIndex].filterKey = keys[i];
         self.refreshTree();
      };

      let setTile_Label = new Label( this );
      setTile_Label.text = mtT( "Set tile:" );
      setTile_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;

      this.tile_SpinBox = new SpinBox( this );
      this.tile_SpinBox.minValue = 1;
      this.tile_SpinBox.maxValue = 999;
      this.tile_SpinBox.value = 1;
      this.tile_SpinBox.toolTip = mtT( "tip.setTile" );

      let applyTile_Button = new PushButton( this );
      applyTile_Button.text = mtT( "Apply" );
      applyTile_Button.toolTip = mtT( "tip.applyTile" );
      applyTile_Button.onClick = function ()
      {
         let t = self.tile_SpinBox.value - 1;
         for ( let node of self.tree.selectedNodes )
            if ( node.mtIndex !== undefined )
               data.images[node.mtIndex].tileIndex = t;
         self.refreshTree();
      };

      let assignSizer = new HorizontalSizer;
      assignSizer.scaledSpacing = 4;
      assignSizer.add( setChannel_Label );
      assignSizer.add( this.channel_ComboBox );
      assignSizer.add( applyChannel_Button );
      assignSizer.addScaledSpacing( 16 );
      assignSizer.add( setTile_Label );
      assignSizer.add( this.tile_SpinBox );
      assignSizer.add( applyTile_Button );
      assignSizer.addStretch();

      let images_Control = new Control( this );
      images_Control.sizer = new VerticalSizer;
      images_Control.sizer.scaledSpacing = 4;
      images_Control.sizer.add( this.tree, 100 );
      images_Control.sizer.add( treeButtons );
      images_Control.sizer.add( assignSizer );

      let images_Section = new SectionBar( this, mtT( "Images" ) );
      images_Section.setSection( images_Control );

      // =====================================================================
      // Tile preparation
      // =====================================================================
      let trim_Label = new Label( this );
      trim_Label.text = mtT( "Edge trim:" );
      trim_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      trim_Label.minWidth = labelWidth;

      this.trim_SpinBox = new SpinBox( this );
      this.trim_SpinBox.minValue = 0;
      this.trim_SpinBox.maxValue = 200;
      this.trim_SpinBox.value = data.trimPixels;
      this.trim_SpinBox.suffix = " px";
      this.trim_SpinBox.toolTip = mtT( "tip.trim" );
      this.trim_SpinBox.onValueUpdated = function ( v ) { data.trimPixels = v; };

      let interp_Label = new Label( this );
      interp_Label.text = mtT( "Interpolation:" );
      interp_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;

      this.interpolationItems = mtInterpolationItems();
      this.interp_ComboBox = new ComboBox( this );
      for ( let it of this.interpolationItems )
         this.interp_ComboBox.addItem( mtT( it.text ) );
      this.interp_ComboBox.currentItem = Math.max( 0,
         this.interpolationItems.findIndex( it => it.name === data.pixelInterpolation ) );
      data.pixelInterpolation = this.interpolationItems[this.interp_ComboBox.currentItem].name;
      this.interp_ComboBox.toolTip = mtT( "tip.interpolation" );
      this.interp_ComboBox.onItemSelected = function ( i )
      {
         data.pixelInterpolation = self.interpolationItems[i].name;
      };

      this.clamping_NumericEdit = new NumericEdit( this );
      this.clamping_NumericEdit.label.text = mtT( "Clamping:" );
      this.clamping_NumericEdit.setRange( 0, 1 );
      this.clamping_NumericEdit.setPrecision( 2 );
      this.clamping_NumericEdit.setValue( data.clampingThreshold );
      this.clamping_NumericEdit.toolTip = mtT( "tip.clamping" );
      this.clamping_NumericEdit.onValueUpdated = function ( v ) { data.clampingThreshold = v; };

      let prep_Sizer = new HorizontalSizer;
      prep_Sizer.scaledSpacing = 6;
      prep_Sizer.add( trim_Label );
      prep_Sizer.add( this.trim_SpinBox );
      prep_Sizer.addScaledSpacing( 12 );
      prep_Sizer.add( interp_Label );
      prep_Sizer.add( this.interp_ComboBox );
      prep_Sizer.addScaledSpacing( 12 );
      prep_Sizer.add( this.clamping_NumericEdit );
      prep_Sizer.addStretch();

      let prep_Control = new Control( this );
      prep_Control.sizer = new VerticalSizer;
      prep_Control.sizer.scaledSpacing = 4;
      prep_Control.sizer.add( prep_Sizer );

      let prep_Section = new SectionBar( this, mtT( "Tile preparation" ) );
      prep_Section.setSection( prep_Control );

      // =====================================================================
      // Mosaic grid (advanced)
      // =====================================================================
      this.autoRes_CheckBox = this.#makeAutoCheckBox( "Auto resolution",
         mtT( "tip.autoResolution" ),
         data.autoResolution, v => { data.autoResolution = v; self.res_NumericEdit.enabled = !v; } );
      this.res_NumericEdit = new NumericEdit( this );
      this.res_NumericEdit.label.text = mtT( "arcsec/px:" );
      this.res_NumericEdit.setRange( 0.0001, 3600 );
      this.res_NumericEdit.setPrecision( 4 );
      this.res_NumericEdit.setValue( data.resolutionArcsec );
      this.res_NumericEdit.enabled = !data.autoResolution;
      this.res_NumericEdit.onValueUpdated = function ( v ) { data.resolutionArcsec = v; };

      this.autoRot_CheckBox = this.#makeAutoCheckBox( "Auto rotation",
         mtT( "tip.autoRotation" ),
         data.autoRotation, v => { data.autoRotation = v; self.rot_NumericEdit.enabled = !v; } );
      this.rot_NumericEdit = new NumericEdit( this );
      this.rot_NumericEdit.label.text = mtT( "degrees:" );
      this.rot_NumericEdit.setRange( -360, 360 );
      this.rot_NumericEdit.setPrecision( 4 );
      this.rot_NumericEdit.setValue( data.rotation );
      this.rot_NumericEdit.enabled = !data.autoRotation;
      this.rot_NumericEdit.onValueUpdated = function ( v ) { data.rotation = v; };

      this.autoCentre_CheckBox = this.#makeAutoCheckBox( "Auto centre",
         mtT( "tip.autoCentre" ),
         data.autoCenter, v =>
         {
            data.autoCenter = v;
            self.ra_NumericEdit.enabled = !v;
            self.dec_NumericEdit.enabled = !v;
         } );
      this.ra_NumericEdit = new NumericEdit( this );
      this.ra_NumericEdit.label.text = mtT( "RA (deg):" );
      this.ra_NumericEdit.setRange( 0, 360 );
      this.ra_NumericEdit.setPrecision( 6 );
      this.ra_NumericEdit.setValue( data.centerRA );
      this.ra_NumericEdit.enabled = !data.autoCenter;
      this.ra_NumericEdit.onValueUpdated = function ( v ) { data.centerRA = v; };

      this.dec_NumericEdit = new NumericEdit( this );
      this.dec_NumericEdit.label.text = mtT( "Dec (deg):" );
      this.dec_NumericEdit.setRange( -90, 90 );
      this.dec_NumericEdit.setPrecision( 6 );
      this.dec_NumericEdit.setValue( data.centerDec );
      this.dec_NumericEdit.enabled = !data.autoCenter;
      this.dec_NumericEdit.onValueUpdated = function ( v ) { data.centerDec = v; };

      this.autoProj_CheckBox = this.#makeAutoCheckBox( "Auto projection",
         mtT( "tip.autoProjection" ),
         data.autoProjection, v => { data.autoProjection = v; self.proj_ComboBox.enabled = !v; } );
      this.projectionItems = mtProjectionItems();
      this.proj_ComboBox = new ComboBox( this );
      for ( let it of this.projectionItems )
         this.proj_ComboBox.addItem( mtT( it.text ) );
      this.proj_ComboBox.currentItem = Math.max( 0,
         this.projectionItems.findIndex( it => it.name === data.projection ) );
      data.projection = this.projectionItems[this.proj_ComboBox.currentItem].name;
      this.proj_ComboBox.enabled = !data.autoProjection;
      this.proj_ComboBox.onItemSelected = function ( i ) { data.projection = self.projectionItems[i].name; };

      this.autoDim_CheckBox = this.#makeAutoCheckBox( "Auto dimensions",
         mtT( "tip.autoDimensions" ),
         data.autoDimensions, v =>
         {
            data.autoDimensions = v;
            self.width_SpinBox.enabled = !v;
            self.height_SpinBox.enabled = !v;
         } );
      this.width_SpinBox = new SpinBox( this );
      this.width_SpinBox.minValue = 1;
      this.width_SpinBox.maxValue = 200000;
      this.width_SpinBox.value = data.width;
      this.width_SpinBox.enabled = !data.autoDimensions;
      this.width_SpinBox.onValueUpdated = function ( v ) { data.width = v; };

      this.height_SpinBox = new SpinBox( this );
      this.height_SpinBox.minValue = 1;
      this.height_SpinBox.maxValue = 200000;
      this.height_SpinBox.value = data.height;
      this.height_SpinBox.enabled = !data.autoDimensions;
      this.height_SpinBox.onValueUpdated = function ( v ) { data.height = v; };

      let gridRow = ( checkBox, widgets ) =>
      {
         let s = new HorizontalSizer;
         s.scaledSpacing = 6;
         // A floor, not a width: the checkbox is indicator + spacing + text, so
         // on a style with a wide indicator (macOS) these rows sit a few pixels
         // right of the Label columns in the other sections. Cosmetic, and the
         // rows still align with each other, which is what matters here.
         checkBox.minWidth = labelWidth;
         s.add( checkBox );
         for ( let w of widgets )
            s.add( w );
         s.addStretch();
         return s;
      };

      let grid_Control = new Control( this );
      grid_Control.sizer = new VerticalSizer;
      grid_Control.sizer.scaledSpacing = 4;
      grid_Control.sizer.add( gridRow( this.autoRes_CheckBox,    [ this.res_NumericEdit ] ) );
      grid_Control.sizer.add( gridRow( this.autoRot_CheckBox,    [ this.rot_NumericEdit ] ) );
      grid_Control.sizer.add( gridRow( this.autoCentre_CheckBox, [ this.ra_NumericEdit, this.dec_NumericEdit ] ) );
      grid_Control.sizer.add( gridRow( this.autoProj_CheckBox,   [ this.proj_ComboBox ] ) );
      grid_Control.sizer.add( gridRow( this.autoDim_CheckBox,    [ this.width_SpinBox, this.height_SpinBox ] ) );

      let grid_Section = new SectionBar( this, mtT( "Common mosaic grid" ) );
      grid_Section.setSection( grid_Control );

      // =====================================================================
      // Join settings
      // =====================================================================
      this.overlay_RadioButton = new RadioButton( this );
      this.overlay_RadioButton.text = mtT( "Overlay" );
      this.overlay_RadioButton.checked = (data.joinMode === 0);
      this.overlay_RadioButton.toolTip = mtT( "tip.overlay" );
      this.overlay_RadioButton.onCheck = function ( c ) { if ( c ) { data.joinMode = 0; self.updateJoinControls(); } };

      this.random_RadioButton = new RadioButton( this );
      this.random_RadioButton.text = mtT( "Random" );
      this.random_RadioButton.checked = (data.joinMode === 1);
      this.random_RadioButton.toolTip = mtT( "tip.random" );
      this.random_RadioButton.onCheck = function ( c ) { if ( c ) { data.joinMode = 1; self.updateJoinControls(); } };

      this.average_RadioButton = new RadioButton( this );
      this.average_RadioButton.text = mtT( "Average" );
      this.average_RadioButton.checked = (data.joinMode === 2);
      this.average_RadioButton.toolTip = mtT( "tip.averageMode" );
      this.average_RadioButton.onCheck = function ( c ) { if ( c ) { data.joinMode = 2; self.updateJoinControls(); } };

      let joinMode_Label = new Label( this );
      joinMode_Label.text = mtT( "Join mode:" );
      joinMode_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      joinMode_Label.minWidth = labelWidth;

      this.joinSize_NumericEdit = new NumericEdit( this );
      this.joinSize_NumericEdit.label.text = mtT( "Blend band:" );
      this.joinSize_NumericEdit.setRange( 1, 100 );
      this.joinSize_NumericEdit.setPrecision( 0 );
      this.joinSize_NumericEdit.setValue( data.joinSize );
      this.joinSize_NumericEdit.toolTip = mtT( "tip.blendBand" );
      this.joinSize_NumericEdit.onValueUpdated = function ( v ) { data.joinSize = v; };

      let joinMode_Sizer = new HorizontalSizer;
      joinMode_Sizer.scaledSpacing = 8;
      joinMode_Sizer.add( joinMode_Label );
      joinMode_Sizer.add( this.overlay_RadioButton );
      joinMode_Sizer.add( this.random_RadioButton );
      joinMode_Sizer.add( this.average_RadioButton );
      joinMode_Sizer.addScaledSpacing( 12 );
      joinMode_Sizer.add( this.joinSize_NumericEdit );
      joinMode_Sizer.addStretch();

      let stripAxis_Label = new Label( this );
      stripAxis_Label.text = mtT( "Join order:" );
      stripAxis_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      stripAxis_Label.minWidth = labelWidth;

      this.stripAxis_ComboBox = new ComboBox( this );
      this.stripAxis_ComboBox.addItem( mtT( "Auto" ) );
      this.stripAxis_ComboBox.addItem( mtT( "Rows first, then join the rows" ) );
      this.stripAxis_ComboBox.addItem( mtT( "Columns first, then join the columns" ) );
      this.stripAxis_ComboBox.currentItem = data.autoStripAxis ? 0 : (data.stripAxisIsRows ? 1 : 2);
      this.stripAxis_ComboBox.toolTip = mtT( "tip.joinOrder" );
      this.stripAxis_ComboBox.onItemSelected = function ( i )
      {
         data.autoStripAxis = (i === 0);
         data.stripAxisIsRows = (i !== 2);
      };

      let stripAxisSizer = new HorizontalSizer;
      stripAxisSizer.scaledSpacing = 6;
      stripAxisSizer.add( stripAxis_Label );
      stripAxisSizer.add( this.stripAxis_ComboBox );
      stripAxisSizer.addStretch();

      this.starDetection_NumericEdit = new NumericEdit( this );
      this.starDetection_NumericEdit.label.text = mtT( "Star detection:" );
      this.starDetection_NumericEdit.label.minWidth = labelWidth;
      this.starDetection_NumericEdit.setRange( -3, 2 );
      this.starDetection_NumericEdit.setPrecision( 1 );
      this.starDetection_NumericEdit.setValue( data.logStarDetection );
      this.starDetection_NumericEdit.toolTip = mtT( "tip.starDetection" );
      this.starDetection_NumericEdit.onValueUpdated = function ( v ) { data.logStarDetection = v; };

      this.sampleSize_SpinBox = new SpinBox( this );
      this.sampleSize_SpinBox.minValue = 4;
      this.sampleSize_SpinBox.maxValue = 100;
      this.sampleSize_SpinBox.value = data.sampleSize;
      this.sampleSize_SpinBox.suffix = " px";
      this.sampleSize_SpinBox.toolTip = mtT( "tip.sampleSize" );
      this.sampleSize_SpinBox.onValueUpdated = function ( v ) { data.sampleSize = v; };

      let sampleSize_Label = new Label( this );
      sampleSize_Label.text = mtT( "Sample size:" );
      sampleSize_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      sampleSize_Label.minWidth = labelWidth;

      this.starGrowth_NumericEdit = new NumericEdit( this );
      this.starGrowth_NumericEdit.label.text = mtT( "Star rejection:" );
      this.starGrowth_NumericEdit.setRange( 0.5, 8 );
      this.starGrowth_NumericEdit.setPrecision( 1 );
      this.starGrowth_NumericEdit.setValue( data.sampleStarGrowth );
      this.starGrowth_NumericEdit.toolTip = mtT( "tip.starRejection" );
      this.starGrowth_NumericEdit.onValueUpdated = function ( v ) { data.sampleStarGrowth = v; };

      this.smoothness_NumericEdit = new NumericEdit( this );
      this.smoothness_NumericEdit.label.text = mtT( "Smoothness:" );
      this.smoothness_NumericEdit.label.minWidth = labelWidth;
      this.smoothness_NumericEdit.setRange( -3, 2 );
      this.smoothness_NumericEdit.setPrecision( 1 );
      this.smoothness_NumericEdit.setValue( data.gradientSmoothness );
      this.smoothness_NumericEdit.toolTip = mtT( "tip.smoothness" );
      this.smoothness_NumericEdit.onValueUpdated = function ( v ) { data.gradientSmoothness = v; };

      this.autoTaper_CheckBox = new CheckBox( this );
      this.autoTaper_CheckBox.text = mtT( "Auto taper" );
      this.autoTaper_CheckBox.checked = data.useAutoTaper;
      this.autoTaper_CheckBox.toolTip = mtT( "tip.taper" );
      this.autoTaper_CheckBox.onCheck = function ( c )
      {
         data.useAutoTaper = c;
         self.taper_SpinBox.enabled = !c;
      };

      this.taper_SpinBox = new SpinBox( this );
      this.taper_SpinBox.minValue = 50;
      this.taper_SpinBox.maxValue = 5000;
      this.taper_SpinBox.value = data.taperLength;
      this.taper_SpinBox.suffix = " px";
      this.taper_SpinBox.enabled = !data.useAutoTaper;
      this.taper_SpinBox.toolTip = this.autoTaper_CheckBox.toolTip;
      this.taper_SpinBox.onValueUpdated = function ( v ) { data.taperLength = v; };

      let sampleSizer = new HorizontalSizer;
      sampleSizer.scaledSpacing = 6;
      sampleSizer.add( sampleSize_Label );
      sampleSizer.add( this.sampleSize_SpinBox );
      sampleSizer.addScaledSpacing( 12 );
      sampleSizer.add( this.starGrowth_NumericEdit );
      sampleSizer.addStretch();

      let detectSizer = new HorizontalSizer;
      detectSizer.scaledSpacing = 6;
      detectSizer.add( this.starDetection_NumericEdit );
      detectSizer.addStretch();

      let smoothSizer = new HorizontalSizer;
      smoothSizer.scaledSpacing = 6;
      smoothSizer.add( this.smoothness_NumericEdit );
      smoothSizer.addScaledSpacing( 12 );
      smoothSizer.add( this.autoTaper_CheckBox );
      smoothSizer.add( this.taper_SpinBox );
      smoothSizer.addStretch();

      let join_Control = new Control( this );
      join_Control.sizer = new VerticalSizer;
      join_Control.sizer.scaledSpacing = 4;
      join_Control.sizer.add( joinMode_Sizer );
      join_Control.sizer.add( stripAxisSizer );
      join_Control.sizer.add( detectSizer );
      join_Control.sizer.add( sampleSizer );
      join_Control.sizer.add( smoothSizer );

      let join_Section = new SectionBar( this, mtT( "Photometric join" ) );
      join_Section.setSection( join_Control );

      // =====================================================================
      // Output
      // =====================================================================
      let prefix_Label = new Label( this );
      prefix_Label.text = mtT( "Output prefix:" );
      prefix_Label.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      prefix_Label.minWidth = labelWidth;

      this.prefix_Edit = new Edit( this );
      this.prefix_Edit.text = data.outputPrefix;
      this.prefix_Edit.minWidth = 14 * emWidth;
      this.prefix_Edit.toolTip = mtT( "tip.prefix" );
      this.prefix_Edit.onEditCompleted = function ()
      {
         data.outputPrefix = this.text.trim();
         self.updateOutputPreview();
      };

      this.outputPreview_Label = new Label( this );
      this.outputPreview_Label.useRichText = true;
      this.outputPreview_Label.wordWrapping = true;

      this.autoCrop_CheckBox = new CheckBox( this );
      this.autoCrop_CheckBox.text = mtT( "Autocrop to the area all channels cover" );
      this.autoCrop_CheckBox.checked = data.autoCrop;
      this.autoCrop_CheckBox.toolTip = mtT( "tip.autocrop" );
      this.autoCrop_CheckBox.onCheck = function ( c ) { data.autoCrop = c; };

      this.autoStretch_CheckBox = new CheckBox( this );
      this.autoStretch_CheckBox.text = mtT( "Auto-stretch the result" );
      this.autoStretch_CheckBox.checked = data.autoStretch;
      this.autoStretch_CheckBox.toolTip = mtT( "tip.autostretch" );
      this.autoStretch_CheckBox.onCheck = function ( c ) { data.autoStretch = c; };

      this.keepIntermediates_CheckBox = new CheckBox( this );
      this.keepIntermediates_CheckBox.text = mtT( "Keep intermediate windows" );
      this.keepIntermediates_CheckBox.checked = data.keepIntermediates;
      this.keepIntermediates_CheckBox.toolTip = mtT( "tip.keepIntermediates" );
      this.keepIntermediates_CheckBox.onCheck = function ( c ) { data.keepIntermediates = c; };

      this.regenerate_CheckBox = new CheckBox( this );
      this.regenerate_CheckBox.text = mtT( "Rebuild astrometric solution" );
      this.regenerate_CheckBox.checked = data.regenerateSolution;
      this.regenerate_CheckBox.toolTip = mtT( "tip.regenerate" );
      this.regenerate_CheckBox.onCheck = function ( c ) { data.regenerateSolution = c; };

      let prefixSizer = new HorizontalSizer;
      prefixSizer.scaledSpacing = 6;
      prefixSizer.add( prefix_Label );
      prefixSizer.add( this.prefix_Edit );
      prefixSizer.addScaledSpacing( 12 );
      prefixSizer.add( this.keepIntermediates_CheckBox );
      prefixSizer.add( this.regenerate_CheckBox );
      prefixSizer.addStretch();

      let cropSizer = new HorizontalSizer;
      cropSizer.scaledSpacing = 6;
      let crop_Spacer = new Label( this );
      crop_Spacer.minWidth = labelWidth;
      cropSizer.add( crop_Spacer );
      cropSizer.add( this.autoCrop_CheckBox );
      cropSizer.addScaledSpacing( 12 );
      cropSizer.add( this.autoStretch_CheckBox );
      cropSizer.addStretch();

      let output_Control = new Control( this );
      output_Control.sizer = new VerticalSizer;
      output_Control.sizer.scaledSpacing = 4;
      output_Control.sizer.add( prefixSizer );
      output_Control.sizer.add( cropSizer );
      output_Control.sizer.add( this.outputPreview_Label );

      let output_Section = new SectionBar( this, mtT( "Output" ) );
      output_Section.setSection( output_Control );

      // =====================================================================
      // Buttons
      // =====================================================================
      let plan_Button = new PushButton( this );
      plan_Button.text = mtT( "Check plan" );
      mtSetIcon( this, plan_Button, ":/icons/find.png", null );
      plan_Button.toolTip = mtT( "tip.checkPlan" );
      plan_Button.onClick = function () { self.checkPlan(); };

      this.run_Button = new PushButton( this );
      this.run_Button.text = mtT( "Run" );
      mtSetIcon( this, this.run_Button, ":/icons/power.png", null );
      this.run_Button.defaultButton = true;
      this.run_Button.toolTip = mtT( "tip.run" );
      this.run_Button.onClick = function ()
      {
         let problem = data.validate();
         if ( problem )
         {
            new MessageBox( "<p>" + problem + "</p>", MT_TITLE(), StdIcon.Error, StdButton.Ok ).execute();
            return;
         }
         self.ok();
      };

      let cancel_Button = new PushButton( this );
      cancel_Button.text = mtT( "Cancel" );
      mtSetIcon( this, cancel_Button, ":/icons/close.png", null );
      cancel_Button.onClick = function () { self.cancel(); };

      let buttons_Sizer = new HorizontalSizer;
      buttons_Sizer.scaledSpacing = 6;
      buttons_Sizer.add( plan_Button );
      buttons_Sizer.addStretch();
      buttons_Sizer.add( this.run_Button );
      buttons_Sizer.add( cancel_Button );

      // A SectionBar toggle changes the content height, and setMinSize() below
      // pins the floor - without this handler collapsing a section leaves dead
      // space and expanding one can push the buttons off-screen. Both core
      // reference scripts install exactly this on every bar.
      let onToggleSection = function ( section, toggleBegin )
      {
         if ( toggleBegin )
            return;
         let dlg = section.dialog;
         dlg.setVariableHeight();
         dlg.adjustToContents();
         dlg.setMinHeight();
         dlg.capHeight();
      };
      for ( let bar of [ help_Section, channels_Section, images_Section, prep_Section,
                         grid_Section, join_Section, output_Section ] )
         bar.onToggleSection = onToggleSection;

      // =====================================================================
      // Live language switch
      //
      // Retranslate every control in place, the way the sibling CaeloWorks
      // scripts do, rather than closing and reopening the window. Every local
      // control built above is still in scope here, so this one closure can
      // reach all of them. Data values in the tree (identifiers, coordinates)
      // are not translated - they are what a user pastes into a forum post.
      // =====================================================================
      this.applyLanguage = function ( code )
      {
         mtSetLanguage( code );
         data.language = code;
         data.saveLanguage();

         // SectionBar.title assigned after construction does not always repaint;
         // set the underlying label too. Both are guarded so a build that
         // exposes neither keeps the language the bar opened in rather than throw.
         let retitle = function ( bar, key )
         {
            try { bar.title = mtT( key ); } catch ( x ) {}
            try { if ( bar.label != null ) bar.label.text = mtT( key ); } catch ( x ) {}
         };
         // Rebuild a combo's items in the current language, keeping the selection.
         let rebuildItems = function ( combo, texts )
         {
            let cur = combo.currentItem;
            combo.clear();
            for ( let t of texts )
               combo.addItem( t );
            combo.currentItem = Math.max( 0, Math.min( cur, texts.length - 1 ) );
         };

         // Header
         self.tagline_Label.text = "<i>" + mtT( "ui.tagline" ) + "</i>";
         self.desc_Label.text = mtT( "ui.header" );
         language_Label.text = mtT( "Language:" );
         self.language_ComboBox.toolTip = mtT( "tip.language" );

         // Channels
         for ( let f of MT_STANDARD_FILTERS() )
            if ( self.filterCheckBoxes[f.key] )
               self.filterCheckBoxes[f.key].toolTip =
                  mtTv( "tip.filter", { LABEL: mtT( f.label ), ID: data.outputPrefix + f.key } );
         customLabel.text = mtT( "Other channels:" );
         customLabel.toolTip = mtTv( "tip.custom", { N: MT_CUSTOM_SLOTS(), PREFIX: data.outputPrefix } );
         for ( let e of self.customEdits )
            e.toolTip = customLabel.toolTip;

         // Images
         self.tree.setHeaderText( 0, mtT( "Window" ) );
         self.tree.setHeaderText( 1, mtT( "Channel" ) );
         self.tree.setHeaderText( 2, mtT( "Tile" ) );
         self.tree.setHeaderText( 3, mtT( "FILTER" ) );
         self.tree.setHeaderText( 4, mtT( "RA" ) );
         self.tree.setHeaderText( 5, mtT( "Dec" ) );
         self.tree.setHeaderText( 6, mtT( "arcsec/px" ) );
         self.tree.toolTip = mtT( "tip.tree" );
         refresh_Button.text  = mtT( "Rescan windows" );  refresh_Button.toolTip  = mtT( "tip.rescan" );
         renumber_Button.text = mtT( "Renumber tiles" );  renumber_Button.toolTip = mtT( "tip.renumber" );
         remove_Button.text   = mtT( "Remove selected" ); remove_Button.toolTip   = mtT( "tip.remove" );
         setChannel_Label.text = mtT( "Set channel:" );
         self.channel_ComboBox.toolTip = mtT( "tip.setChannel" );
         applyChannel_Button.text = mtT( "Apply" ); applyChannel_Button.toolTip = mtT( "tip.applyChannel" );
         setTile_Label.text = mtT( "Set tile:" );
         self.tile_SpinBox.toolTip = mtT( "tip.setTile" );
         applyTile_Button.text = mtT( "Apply" ); applyTile_Button.toolTip = mtT( "tip.applyTile" );

         // Tile preparation
         trim_Label.text = mtT( "Edge trim:" );
         self.trim_SpinBox.toolTip = mtT( "tip.trim" );
         interp_Label.text = mtT( "Interpolation:" );
         rebuildItems( self.interp_ComboBox, self.interpolationItems.map( it => mtT( it.text ) ) );
         self.interp_ComboBox.toolTip = mtT( "tip.interpolation" );
         self.clamping_NumericEdit.label.text = mtT( "Clamping:" );
         self.clamping_NumericEdit.toolTip = mtT( "tip.clamping" );

         // Common mosaic grid
         self.autoRes_CheckBox.text    = mtT( "Auto resolution" );  self.autoRes_CheckBox.toolTip    = mtT( "tip.autoResolution" );
         self.autoRot_CheckBox.text    = mtT( "Auto rotation" );    self.autoRot_CheckBox.toolTip    = mtT( "tip.autoRotation" );
         self.autoCentre_CheckBox.text = mtT( "Auto centre" );      self.autoCentre_CheckBox.toolTip = mtT( "tip.autoCentre" );
         self.autoProj_CheckBox.text   = mtT( "Auto projection" );  self.autoProj_CheckBox.toolTip   = mtT( "tip.autoProjection" );
         self.autoDim_CheckBox.text    = mtT( "Auto dimensions" );  self.autoDim_CheckBox.toolTip    = mtT( "tip.autoDimensions" );
         self.res_NumericEdit.label.text = mtT( "arcsec/px:" );
         self.rot_NumericEdit.label.text = mtT( "degrees:" );
         self.ra_NumericEdit.label.text  = mtT( "RA (deg):" );
         self.dec_NumericEdit.label.text = mtT( "Dec (deg):" );
         rebuildItems( self.proj_ComboBox, self.projectionItems.map( it => mtT( it.text ) ) );

         // Photometric join
         self.overlay_RadioButton.text = mtT( "Overlay" ); self.overlay_RadioButton.toolTip = mtT( "tip.overlay" );
         self.random_RadioButton.text  = mtT( "Random" );  self.random_RadioButton.toolTip  = mtT( "tip.random" );
         self.average_RadioButton.text = mtT( "Average" ); self.average_RadioButton.toolTip = mtT( "tip.averageMode" );
         joinMode_Label.text = mtT( "Join mode:" );
         self.joinSize_NumericEdit.label.text = mtT( "Blend band:" );
         self.joinSize_NumericEdit.toolTip = mtT( "tip.blendBand" );
         stripAxis_Label.text = mtT( "Join order:" );
         rebuildItems( self.stripAxis_ComboBox, [ mtT( "Auto" ),
            mtT( "Rows first, then join the rows" ), mtT( "Columns first, then join the columns" ) ] );
         self.stripAxis_ComboBox.toolTip = mtT( "tip.joinOrder" );
         self.starDetection_NumericEdit.label.text = mtT( "Star detection:" );
         self.starDetection_NumericEdit.toolTip = mtT( "tip.starDetection" );
         sampleSize_Label.text = mtT( "Sample size:" );
         self.sampleSize_SpinBox.toolTip = mtT( "tip.sampleSize" );
         self.starGrowth_NumericEdit.label.text = mtT( "Star rejection:" );
         self.starGrowth_NumericEdit.toolTip = mtT( "tip.starRejection" );
         self.smoothness_NumericEdit.label.text = mtT( "Smoothness:" );
         self.smoothness_NumericEdit.toolTip = mtT( "tip.smoothness" );
         self.autoTaper_CheckBox.text = mtT( "Auto taper" ); self.autoTaper_CheckBox.toolTip = mtT( "tip.taper" );
         self.taper_SpinBox.toolTip = self.autoTaper_CheckBox.toolTip;

         // Output
         prefix_Label.text = mtT( "Output prefix:" );
         self.prefix_Edit.toolTip = mtT( "tip.prefix" );
         self.autoCrop_CheckBox.text = mtT( "Autocrop to the area all channels cover" );
         self.autoCrop_CheckBox.toolTip = mtT( "tip.autocrop" );
         self.autoStretch_CheckBox.text = mtT( "Auto-stretch the result" );
         self.autoStretch_CheckBox.toolTip = mtT( "tip.autostretch" );
         self.keepIntermediates_CheckBox.text = mtT( "Keep intermediate windows" );
         self.keepIntermediates_CheckBox.toolTip = mtT( "tip.keepIntermediates" );
         self.regenerate_CheckBox.text = mtT( "Rebuild astrometric solution" );
         self.regenerate_CheckBox.toolTip = mtT( "tip.regenerate" );

         // Buttons
         plan_Button.text = mtT( "Check plan" ); plan_Button.toolTip = mtT( "tip.checkPlan" );
         self.run_Button.text = mtT( "Run" );    self.run_Button.toolTip = mtT( "tip.run" );
         cancel_Button.text = mtT( "Cancel" );

         // Section bars
         retitle( help_Section,     "Help" );
         retitle( channels_Section, "Channels" );
         retitle( images_Section,   "Images" );
         retitle( prep_Section,     "Tile preparation" );
         retitle( grid_Section,     "Common mosaic grid" );
         retitle( join_Section,     "Photometric join" );
         retitle( output_Section,   "Output" );

         // Anything carrying channel names or per-row status text.
         self.rebuildChannelCombo();   // also refreshes the output preview
         self.refreshTree();           // the "unsolved" cells are translated

         self.adjustToContents();
         self.capHeight();             // French text is longer; keep it on-screen
      };

      // =====================================================================
      // Layout
      // =====================================================================
      this.sizer = new VerticalSizer;
      this.sizer.scaledMargin = 8;
      this.sizer.scaledSpacing = 6;
      this.sizer.add( this.header_Sizer );
      this.sizer.add( this.tagline_Label );
      this.sizer.addSpacing( 2 );
      this.sizer.add( help_Section );
      this.sizer.add( help_Control );
      this.sizer.add( channels_Section );
      this.sizer.add( channels_Control );
      this.sizer.add( images_Section );
      this.sizer.add( images_Control, 100 );
      this.sizer.add( prep_Section );
      this.sizer.add( prep_Control );
      this.sizer.add( grid_Section );
      this.sizer.add( grid_Control );
      this.sizer.add( join_Section );
      this.sizer.add( join_Control );
      this.sizer.add( output_Section );
      this.sizer.add( output_Control );
      this.sizer.addScaledSpacing( 4 );
      this.sizer.add( buttons_Sizer );

      // The help notes and the advanced grid overrides start out of the way.
      // Hiding the section's control is how the core scripts do this - SectionBar
      // reads the section's visibility, so the bar's arrow follows. It must
      // happen before adjustToContents(), or the hidden rows are still measured.
      help_Control.hide();
      grid_Control.hide();

      this.adjustToContents();
      this.setMinSize();
      this.capHeight();

      this.rebuildChannelCombo();
      this.updateOutputPreview();
      this.updateJoinControls();
   }

   // -------------------------------------------------------------------------

   /**
    * Keeps the window within the screen budget, releasing the minimum-height
    * pin first so the resize is actually allowed to take effect.
    */
   capHeight()
   {
      if ( this.height > this.maxDialogHeight )
      {
         this.setMinHeight( 0 );
         this.resize( this.width, this.maxDialogHeight );
      }
   }

   // -------------------------------------------------------------------------

   #makeAutoCheckBox( text, toolTip, checked, onCheck )
   {
      let cb = new CheckBox( this );
      cb.text = mtT( text );
      cb.toolTip = toolTip;
      cb.checked = checked;
      cb.onCheck = function ( c ) { onCheck( c ); };
      return cb;
   }

   // -------------------------------------------------------------------------

   /** The blend band only means anything for the Random and Average modes. */
   updateJoinControls()
   {
      this.joinSize_NumericEdit.enabled = (this.data.joinMode !== 0);
   }

   // -------------------------------------------------------------------------

   updateOutputPreview()
   {
      let channels = this.data.activeChannels();
      if ( channels.length === 0 )
         this.outputPreview_Label.text = mtT( "<p><i>No channel selected.</i></p>" );
      else
         this.outputPreview_Label.text = "<p>" + mtT( "Will create: " ) + "<b>" +
            channels.map( c => c.outputId ).join( "</b>, <b>" ) + "</b></p>";
   }

   // -------------------------------------------------------------------------

   rebuildChannelCombo()
   {
      let keys = this.data.allChannelKeys();
      keys.push( MT_UNASSIGNED() );
      this.channelComboKeys = keys;
      this.channel_ComboBox.clear();
      for ( let k of keys )
         this.channel_ComboBox.addItem( k === MT_UNASSIGNED() ? mtT( "(none)" ) : k );
      this.channel_ComboBox.currentItem = 0;
      this.updateOutputPreview();
   }

   // -------------------------------------------------------------------------

   /**
    * Rebuilds the image list from every open main view.
    * @param {Boolean} quiet Suppress the "nothing found" message box.
    */
   autoDetect( quiet )
   {
      let data = this.data;
      data.images = [];

      let windows = ImageWindow.windows;
      let unsolved = 0;

      for ( let w of windows )
      {
         if ( !w || w.isNull )
            continue;
         let view = w.mainView;
         if ( !view || view.isNull )
            continue;

         let im = new MT_Image( view.fullId );
         im.rawFilter = mtFitsString( w, "FILTER" );
         let key = mtMatchStandardFilter( im.rawFilter );
         im.filterKey = key.length ? key : MT_UNASSIGNED();

         let md = mtExtractMetadata( w, false /*allowRegenerate*/ );
         if ( md )
         {
            im.solved = true;
            im.metadata = md;
            im.ra = md.ra;
            im.dec = md.dec;
            im.resolution = md.resolution;
            im.width = md.width;
            im.height = md.height;
         }
         else
         {
            im.solved = false;
            im.enabled = false;
            ++unsolved;
         }
         data.images.push( im );
      }

      // A raw FILTER value that matched nothing becomes a candidate custom
      // channel, so the user only has to tick it rather than type it.
      this.#proposeCustomChannels();

      this.assignTiles();
      this.#syncChannelSelection();
      this.rebuildChannelCombo();
      this.refreshTree();

      if ( !quiet )
      {
         let solved = data.images.filter( im => im.solved ).length;
         if ( solved === 0 )
            new MessageBox( mtTv( "msg.noSolvedImages", { "TITLE": MT_TITLE() } ),
                            MT_TITLE(), StdIcon.Warning, StdButton.Ok ).execute();
         else if ( unsolved > 0 )
            console.warningln( format(
               mtT( "Warning: %d open image(s) have no astrometric solution and were left unticked." ),
               unsolved ) );
      }
   }

   // -------------------------------------------------------------------------

   /**
    * Ticks exactly the channels that images were actually found for, and unticks
    * the rest.
    *
    * Without this the saved settings win, so a session that once assembled LRGB
    * arrives at an SHO project with L, R, G and B still ticked and nothing behind
    * them - which then reads as four failed channels in the summary.
    *
    * Left alone when nothing is plate solved, so a workspace that is not ready
    * yet does not silently clear the user's selection.
    */
   #syncChannelSelection()
   {
      let data = this.data;
      let usable = data.images.filter( im => im.solved );
      if ( usable.length === 0 )
         return;

      let present = {};
      for ( let im of usable )
         present[im.filterKey] = true;

      let on = [], off = [];
      for ( let f of MT_STANDARD_FILTERS() )
      {
         let has = present[f.key] === true;
         data.filterEnabled[f.key] = has;
         if ( this.filterCheckBoxes[f.key] )
            this.filterCheckBoxes[f.key].checked = has;
         (has ? on : off).push( f.key );
      }

      // A custom slot is "on" by virtue of holding a name; clear the ones that
      // no open image uses, so they do not appear in the output preview either.
      for ( let i = 0; i < data.customNames.length; ++i )
      {
         let n = data.customNames[i].trim();
         if ( n.length && present[n] !== true )
         {
            data.customNames[i] = "";
            if ( this.customEdits[i] )
               this.customEdits[i].text = "";
         }
         else if ( n.length )
            on.push( n );
      }

      console.writeln( mtT( "Channels found: " ) + (on.length ? on.join( ", " ) : mtT( "none" )) );
      if ( off.length )
         console.writeln( mtT( "Not present, unticked: " ) + off.join( ", " ) );
   }

   // -------------------------------------------------------------------------

   /**
    * Fills empty custom-channel slots with FILTER values that did not match any
    * standard channel.
    */
   #proposeCustomChannels()
   {
      let data = this.data;
      let existing = {};
      for ( let n of data.customNames )
         if ( n.trim().length )
            existing[mtNormaliseFilter( n )] = n.trim();

      let candidates = [];
      for ( let im of data.images )
      {
         if ( im.filterKey !== MT_UNASSIGNED() || !im.rawFilter.length )
            continue;
         let n = mtNormaliseFilter( im.rawFilter );
         if ( existing[n] === undefined && candidates.indexOf( im.rawFilter.trim() ) < 0 )
            candidates.push( im.rawFilter.trim() );
      }

      for ( let c of candidates )
      {
         let slot = data.customNames.findIndex( n => !n.trim().length );
         if ( slot < 0 )
            break;
         data.customNames[slot] = c;
         this.customEdits[slot].text = c;
         existing[mtNormaliseFilter( c )] = c;
      }

      // Re-key the images that now match a custom channel.
      for ( let im of data.images )
         if ( im.filterKey === MT_UNASSIGNED() && im.rawFilter.length )
         {
            let match = existing[mtNormaliseFilter( im.rawFilter )];
            if ( match !== undefined )
               im.filterKey = match;
         }
   }

   // -------------------------------------------------------------------------

   /**
    * Groups the images into tiles by sky position: images whose centres are
    * closer than about half a field belong to the same tile.
    */
   assignTiles()
   {
      let images = this.data.images.filter( im => im.solved );
      if ( images.length === 0 )
         return;

      // The threshold has to be large enough to absorb the dithering between
      // filters of the same tile, and small enough not to swallow a genuinely
      // different tile. Half a field - the separation of two tiles that overlap
      // by 50% - is far too generous; 15% of the smallest field still separates
      // tiles overlapping by up to 85%.
      let threshold = Number.MAX_VALUE;
      for ( let im of images )
         threshold = Math.min( threshold, im.resolution * Math.min( im.width, im.height ) );
      threshold *= 0.15;
      if ( !(threshold > 0) )
         threshold = 1/60;

      /** @type Object[] { ra, dec, n, index } */
      let tiles = [];
      for ( let im of images )
      {
         let best = -1;
         let bestDist = Number.MAX_VALUE;
         for ( let t = 0; t < tiles.length; ++t )
         {
            let d = mtAngularDistance( im.ra, im.dec, tiles[t].ra, tiles[t].dec );
            if ( d < threshold && d < bestDist )
            {
               bestDist = d;
               best = t;
            }
         }
         if ( best < 0 )
         {
            tiles.push( { ra: im.ra, dec: im.dec, n: 1 } );
            im.tileIndex = tiles.length - 1;
         }
         else
         {
            // Running mean keeps the tile centre stable as more filters arrive.
            let t = tiles[best];
            t.ra  = (t.ra * t.n + im.ra) / (t.n + 1);
            t.dec = (t.dec * t.n + im.dec) / (t.n + 1);
            ++t.n;
            im.tileIndex = best;
         }
      }

      // Number the tiles top-left to bottom-right so the table reads naturally.
      let order = tiles.map( (t, i) => ({ i: i, ra: t.ra, dec: t.dec }) );
      order.sort( (a, b) => (b.dec - a.dec) || (a.ra - b.ra) );
      let remap = {};
      for ( let k = 0; k < order.length; ++k )
         remap[order[k].i] = k;
      for ( let im of images )
         im.tileIndex = remap[im.tileIndex];

      for ( let im of this.data.images )
         if ( !im.solved )
            im.tileIndex = 0;
   }

   // -------------------------------------------------------------------------

   refreshTree()
   {
      let data = this.data;
      let active = {};
      for ( let ch of data.activeChannels() )
         active[ch.key] = true;

      this.updatingTree = true;
      try
      {
         this.tree.clear();
         for ( let i = 0; i < data.images.length; ++i )
         {
            let im = data.images[i];
            let node = new TreeBoxNode( this.tree );
            node.mtIndex = i;
            node.checkable = true;
            node.checked = im.enabled;
            node.setText( 0, im.viewId );
            node.setText( 1, im.filterKey === MT_UNASSIGNED() ? "-" : im.filterKey );
            node.setText( 2, im.solved ? "" + (im.tileIndex + 1) : "-" );
            node.setText( 3, im.rawFilter );
            node.setText( 4, im.solved ? mtFormatRA( im.ra ) : mtT( "unsolved" ) );
            node.setText( 5, im.solved ? mtFormatDec( im.dec ) : "" );
            node.setText( 6, im.solved ? format( "%.3f", im.resolution*3600 ) : "" );

            // Grey out rows that will not take part in the run. Rows that will are
            // left with the theme's own colour.
            let willBeUsed = im.enabled && im.solved && active[im.filterKey] === true;
            if ( !willBeUsed )
               for ( let c = 0; c < 7; ++c )
                  node.setTextColor( c, 0xff909090 );
         }
         for ( let c = 0; c < 7; ++c )
            this.tree.adjustColumnWidthToContents( c );
      }
      finally
      {
         // Never leave the guard latched: a stuck flag would silently kill the
         // tick boxes for the rest of the session.
         this.updatingTree = false;
      }

      this.updateOutputPreview();
   }

   // -------------------------------------------------------------------------

   /**
    * Dry run: validate, compute the grid, print the join order. Nothing is
    * modified and no window is created.
    */
   checkPlan()
   {
      let data = this.data;
      let problem = data.validate();
      if ( problem )
      {
         new MessageBox( "<p>" + problem + "</p>", MT_TITLE(), StdIcon.Error, StdButton.Ok ).execute();
         return;
      }

      console.show();
      console.noteln( "\n\n=== " + MT_TITLE() + mtT( ": plan check" ) + " ===" );
      for ( let w of data.warnings() )
         console.warningln( mtT( "Warning: " ) + w );

      try
      {
         // Grid and layout only. No window is created and nothing is modified.
         let metadata = data.activeImages().map( im => im.metadata );
         let grid = new MT_MosaicGrid( data, metadata );
         grid.compute();
         mtPrintLayout( data, grid );

         for ( let ch of data.activeChannels() )
         {
            let n = data.imagesForChannel( ch.key ).length;
            console.writeln( format( mtT( "  %-10s %d tile(s)  ->  %s" ), ch.key, n, ch.outputId ) );
         }
         console.noteln( mtT( "Plan check complete. Nothing was modified." ) );
      }
      catch ( x )
      {
         console.criticalln( "*** " + (x.message ? x.message : x) );
         new MessageBox( "<p>" + (x.message ? x.message : x) + "</p>",
                         MT_TITLE(), StdIcon.Error, StdButton.Ok ).execute();
      }
   }

}

// ----------------------------------------------------------------------------

/**
 * Prints the planned join order for a computed grid. Used by "Check plan".
 * @param {MosaicToolboxData} data
 * @param {MT_MosaicGrid} grid
 */
function mtPrintLayout( data, grid )
{
   let layout = mtComputeLayout( data, grid );
   console.noteln( "\n" + mtT( "Planned join order" ) );
   console.writeln( mtDescribeLayout( layout ) );
   console.writeln( "\n" + mtT( "Per channel:" ) );
}

// ----------------------------------------------------------------------------

/**
 * Small-angle separation between two celestial positions, in degrees. Accurate
 * enough for tile clustering, where the positions are always close together.
 *
 * @param {Number} ra1 degrees
 * @param {Number} dec1 degrees
 * @param {Number} ra2 degrees
 * @param {Number} dec2 degrees
 * @returns {Number} degrees
 */
function mtAngularDistance( ra1, dec1, ra2, dec2 )
{
   let dRa = ra1 - ra2;
   while ( dRa > 180 )  dRa -= 360;
   while ( dRa < -180 ) dRa += 360;
   let cosDec = FMath.cos( FMath.rad( (dec1 + dec2)/2 ) );
   let x = dRa * cosDec;
   let y = dec1 - dec2;
   return Math.sqrt( x*x + y*y );
}

// ----------------------------------------------------------------------------
// EOF MT_Dialog.js
