/**
 * MINIMAL CHANGES TO app.js FOR MARKUP MODULE INTEGRATION
 * ========================================================
 * 
 * Just 3 small changes needed — No core logic is modified!
 * Copy/paste the snippets below into their respective locations in app.js
 */

// ============================================================
// CHANGE #1: Export velosApp API
// ============================================================
// LOCATION: End of the main IIFE in app.js, right before the closing })();
// 
// ADD THIS:

window.velosApp = {
  /**
   * Current slide index (0-based)
   */
  currentSlideIndex() {
    return isPdfLoaded && pdfDoc ? currentPage : defaultIndex;
  },

  /**
   * Total slides
   */
  totalSlides() {
    return isPdfLoaded && pdfDoc ? totalPages : defaultSlides.length;
  },

  /**
   * Get draw canvas context
   */
  getDrawContext() {
    return drawCtx;
  },

  /**
   * Get slide card element
   */
  getSlideCard() {
    return E.slideCard;
  },

  /**
   * Dispatch ready event
   */
  ready() {
    window.dispatchEvent(new CustomEvent("velosReady"));
  },
};

// Announce readiness
setTimeout(() => window.velosApp?.ready(), 500);

// ============================================================
// CHANGE #2: Hook into processHands (around line 2650)
// ============================================================
// LOCATION: In the processHands() function, right before the final closing brace
// 
// FIND THIS:
//    function processHands(
//        hands,
//        now
//    ) {
//        safeText(
//            E.handCountValue,
//            hands.length
//        );
//        ...
//    }
//
// CHANGE IT TO:

    function processHands(
        hands,
        now
    ) {
        safeText(
            E.handCountValue,
            hands.length
        );

        // *** ADD THIS LINE ***
        // Fire event for markup module
        if (window.processHandsWithMarkup) {
          window.processHandsWithMarkup(hands, now);
        }

        if (
            mouseEnabled
        ) {
            updateMouse(
                hands,
                now
            );
            // ... rest of function unchanged
        } else {
            processPresentationHands(
                hands,
                now
            );
        }
    }


// ============================================================
// CHANGE #3: Dispatch event on slide change (around line 1500)
// ============================================================
// LOCATION: In showSlide() function, right after applyViewportTransform()
//
// FIND THIS:
//    async function showSlide(
//        index
//    ) {
//        ...
//        applyViewportTransform();
//        updateDeckUI();
//        invalidateHitCache();
//    }
//
// ADD BEFORE THE FINAL CLOSING BRACE:

        applyViewportTransform();

        updateDeckUI();

        invalidateHitCache();

        // *** ADD THESE LINES ***
        // Announce slide change to markup module
        window.dispatchEvent(
          new CustomEvent("velosSlideChanged", {
            detail: {
              slideIndex: isPdfLoaded && pdfDoc ? currentPage : defaultIndex,
              totalSlides: isPdfLoaded && pdfDoc ? totalPages : defaultSlides.length,
            },
          })
        );
    


// ============================================================
// CHANGE #4 (OPTIONAL): Update showToast for integration
// ============================================================
// LOCATION: The showToast() function (around line 540)
//
// Make showToast globally accessible (should already be, but make sure it's not scoped)
// No code change needed if it's already exposed globally!

window.showToast = showToast; // Add this if showToast is defined inside the IIFE


// ============================================================
// THAT'S IT! 
// ============================================================
// 
// Now your HTML should load scripts in this order:
//
//   <script src="app.js"></script>
//   <script src="gesture-markup.js"></script>
//   <script src="app-markup-integration.js"></script>
//
// The markup module will:
// ✅ Listen to hand landmarks from app.js
// ✅ Detect circles, slashes, arrows
// ✅ Store annotations
// ✅ Render on the same drawCanvas
// ✅ Clear when slides change
// ✅ Export transcripts
//
// All without modifying app.js's core logic!
