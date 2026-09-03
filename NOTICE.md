# Attributions

Mosaic Toolbox builds on published work by others. This file records what came
from where and under what terms. It is required by the licences named below and
must travel with any copy or fork of this script.

---

## The script itself

**Mosaic Toolbox** was written by **Nicolas Godingen**, who built it on the work
credited below and maintained it through to version 2.3.1.

## Astrometric grid and reprojection

The astrometric grid computation in `mosaictoolbox/MT_Astrometry.js` is derived
from the **MosaicByCoordinates** script, © 2013–2026 Andrés del Pozo and
© 2019–2026 Juan Conejero (PTeam), used under the **PixInsight Class Library
License 2.0**.

The full text of that licence follows, reproduced as its clause 1 requires. It
covers the derived astrometry code specifically; the rest of Mosaic Toolbox is
under CC BY-NC 4.0 (see LICENSE).

```
*******************************************************************************
PixInsight Class Library License
Version 2.0.1, 29 December 2025
*******************************************************************************

Copyright (c) 2025, Pleiades Astrophoto S.L. All Rights Reserved.

Redistribution and use in both source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions, and the following restriction and disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions, and the following restriction and disclaimer in the
   documentation and/or other materials provided with the distribution.

3. Neither the names "PixInsight" and "Pleiades Astrophoto" nor the names of
   their contributors may be used to endorse or promote products derived from
   this software without specific prior written permission. For written
   permission, please contact Pleiades Astrophoto S.L.

4. All products derived from this software, in any form whatsoever, must
   reproduce the following acknowledgment in the end-user documentation and/or
   other materials provided with the product: "This product is based on
   software from the PixInsight project, developed by Pleiades Astrophoto and
   its contributors (https://pixinsight.com/)." Alternatively, if that is where
   third-party acknowledgments normally appear, this acknowledgment must be
   reproduced in the product itself.

The use of this source code in whole or in part, in both source and binary
forms, is strictly forbidden for:

  a. Training machine learning systems, including, but not limited to, language
     models, generative models, artificial intelligence systems, or automated
     code generation systems.
  b. Inclusion in training datasets or corpora for machine learning systems,
     including, but not limited to, language models and generative models.
  c. Providing API services that incorporate or derive from this software for
     automated code generation.

This restriction applies to all commercial or non-profit entities and expressly
includes use via APIs, wrappers, or third-party tools. Exceptions require
explicit written permission from Pleiades Astrophoto S.L.

THIS SOFTWARE IS PROVIDED BY PLEIADES ASTROPHOTO AND ITS CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL PLEIADES ASTROPHOTO OR ITS CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, BUSINESS INTERRUPTION; PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; AND LOSS OF USE, DATA OR PROFITS) HOWEVER CAUSED
AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## The photometric join

The photometric join is Mosaic Toolbox's own implementation of the published
technique, built on core PixInsight objects (`StarDetector`, `SurfaceSpline`,
`Image`). It is not derived from any third-party mosaic script. **PhotometricMosaic**
by John Murphy (<https://astroprocessing.com/>) remains an excellent and
considerably more refined tool with interactive diagnostics this script does not
attempt to reproduce; none of its code is used, copied or required here.

## Platform

This product is based on software from the PixInsight project, developed by
Pleiades Astrophoto and its contributors (https://pixinsight.com/).

---

## Maintenance

Maintained by **Caelo Works** (<https://caelo.works>) from version 2.3.1 onwards,
with the agreement of Nicolas Godingen.

By his own wish the credit stays here and in the README, and does not appear
anywhere in the interface.
