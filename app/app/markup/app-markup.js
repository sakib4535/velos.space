/**
 * Velos Markup Integration Layer
 * ==============================
 * Bridges gesture-markup.js with app.js
 * 
 * INSTALLATION:
 * 1. Load in HTML AFTER app.js:
 *    <script src="app.js"></script>
 *    <script src="gesture-markup.js"></script>
 *    <script src="app-markup-integration.js"></script>
 *
 * 2. This script self-initializes and adds UI controls
 */

(() => {
  "use strict";

  // Wait for both app.js and gesture-markup.js to load
  function waitForDependencies() {
    return new Promise((resolve) => {
      if (window.velosMarkup && window.velosApp) {
        resolve();
        return;
      }

      const checkInterval = setInterval(() => {
        if (window.velosMarkup && window.velosApp) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        console.warn("⚠️ Velos dependencies not loaded within 10s");
        resolve();
      }, 10000);
    });
  }

  // ============================================================
  // INTEGRATION HOOKS
  // ============================================================

  function hookIntoGestureDetection() {
    // Intercept hand detection and fire custom event for markup module
    const originalProcessHands = window.processHands || (() => {});

    window.processHandsWithMarkup = function (hands, now) {
      // Call original handler
      if (typeof originalProcessHands === "function") {
        originalProcessHands.call(this, hands, now);
      }

      // Fire custom event for markup module
      if (hands && hands.length > 0) {
        window.dispatchEvent(
          new CustomEvent("velosHandsDetected", {
            detail: {
              landmarks: hands[0], // First hand's landmarks
              hands,
              timestamp: now,
            },
          })
        );
      }
    };

    console.log("✅ Hand detection hook installed");
  }

  function hookIntoSlideChange() {
    // When slide changes, redraw markup for new slide
    window.addEventListener("velosSlideChanged", (event) => {
      if (window.velosMarkup) {
        window.velosMarkup.redrawAll();
      }
    });

    console.log("✅ Slide change hook installed");
  }

  function hookIntoClearInk() {
    // Integrate with existing "Clear Ink" button
    const clearInkBtn = document.getElementById("clearInkBtn");
    if (clearInkBtn) {
      const originalClick = clearInkBtn.onclick;

      clearInkBtn.onclick = function () {
        if (typeof originalClick === "function") {
          originalClick.call(this);
        }

        // Also clear markup annotations
        if (window.velosMarkup) {
          window.velosMarkup.clearAnnotations();
        }
      };
    }

    console.log("✅ Clear Ink integration done");
  }

  // ============================================================
  // UI CONTROLS
  // ============================================================

  function createMarkupControlButton() {
    // Create toggle button for markup mode
    const btn = document.createElement("button");
    btn.id = "markupToggleBtn";
    btn.type = "button";
    btn.className = "control-btn";
    btn.title = "Enable Gesture-to-Markup AI";
    btn.innerHTML = `<span class="label-desktop">AI Markup</span><span class="label-mobile">📝</span>`;
    btn.setAttribute("aria-label", "Toggle AI Gesture Markup");

    btn.addEventListener("click", () => {
      const isEnabled = window.velosMarkup?.isEnabled?.();

      if (isEnabled) {
        window.velosMarkup.disableMarkup();
        btn.classList.remove("active");
        showToast("AI Markup disabled");
      } else {
        window.velosMarkup.enableMarkup();
        btn.classList.add("active");
        showToast("AI Markup enabled — draw circles, slashes, arrows");
      }
    });

    // Insert next to laser button if it exists
    const laserBtn = document.getElementById("laserBtn");
    if (laserBtn && laserBtn.parentElement) {
      laserBtn.parentElement.insertBefore(btn, laserBtn.nextSibling);
    } else {
      // Fallback: append to body
      document.body.appendChild(btn);
    }

    console.log("✅ Markup toggle button created");
    return btn;
  }

  function addMarkupSettings() {
    // Add settings panel option for markup
    const settingsDrawer = document.getElementById("settingsDrawer");
    if (!settingsDrawer) return;

    const markupSection = document.createElement("div");
    markupSection.className = "settings-section";
    markupSection.innerHTML = `
      <h3>🎨 Gesture-to-Markup AI</h3>
      <div class="settings-item">
        <label>
          <input type="checkbox" id="markupEnabledSwitch" />
          Enable AI Shape Recognition
        </label>
        <p class="hint">Auto-detect circles, slashes, arrows in your gestures.</p>
      </div>
      <div class="settings-item">
        <label>
          <input type="checkbox" id="markupOcrSwitch" checked />
          Link Annotations to Text (OCR)
        </label>
        <p class="hint">Automatically associate gestures with slide content.</p>
      </div>
      <button id="exportMarkupBtn" class="secondary-btn">📋 Export Annotations Transcript</button>
    `;

    settingsDrawer.appendChild(markupSection);

    // Wire up events
    const enableSwitch = document.getElementById("markupEnabledSwitch");
    if (enableSwitch) {
      enableSwitch.addEventListener("change", (e) => {
        if (e.target.checked) {
          window.velosMarkup?.enableMarkup();
        } else {
          window.velosMarkup?.disableMarkup();
        }
      });
    }

    const exportBtn = document.getElementById("exportMarkupBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const transcript = window.velosMarkup?.exportTranscript?.();
        if (transcript) {
          const blob = new Blob([JSON.stringify(transcript, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `velos-markup-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);

          showToast("Transcript exported");
        }
      });
    }

    console.log("✅ Markup settings added");
  }

  function showToast(message) {
    // Use app.js's toast if available
    if (window.showToast) {
      window.showToast(message, 1200);
    } else {
      console.log(`[Toast] ${message}`);
    }
  }

  // ============================================================
  // DEBUGGING / DEV TOOLS
  // ============================================================

  function exposeDevTools() {
    // Make APIs easily accessible in console
    window.velosMarkupDebug = {
      /**
       * Get all annotations for current slide
       */
      getAnnotations() {
        return window.velosMarkup?.getAnnotations?.() || [];
      },

      /**
       * Manually trigger circle detection test
       */
      testCircleDetection() {
        console.log(
          "%c[TEST] Circle Detection",
          "color: #4CAF50; font-weight: bold"
        );
        // Would need access to internal detectCircle function
      },

      /**
       * See exported transcript
       */
      getTranscript() {
        return window.velosMarkup?.exportTranscript?.();
      },

      /**
       * Enable markup immediately
       */
      enable() {
        window.velosMarkup?.enableMarkup();
        console.log("✅ Markup enabled");
      },

      /**
       * Disable markup
       */
      disable() {
        window.velosMarkup?.disableMarkup();
        console.log("❌ Markup disabled");
      },

      /**
       * Clear all annotations
       */
      clear() {
        window.velosMarkup?.clearAnnotations();
        console.log("🗑️ All annotations cleared");
      },

      /**
       * Show help
       */
      help() {
        console.log(
          `%c
        🎨 Velos Markup Debug Tools
        ==========================
        velosMarkupDebug.enable()              - Turn on markup mode
        velosMarkupDebug.disable()             - Turn off
        velosMarkupDebug.clear()               - Clear annotations
        velosMarkupDebug.getAnnotations()      - List all annotations
        velosMarkupDebug.getTranscript()       - Export transcript
        `,
          "color: #2196F3; font-family: monospace"
        );
      },
    };

    console.log(
      "%cVelos Markup ready! Type velosMarkupDebug.help() for commands.",
      "color: #4CAF50; font-weight: bold"
    );
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  async function init() {
    console.log("🚀 Initializing Velos Markup Integration...");

    // Wait for dependencies
    await waitForDependencies();

    if (!window.velosMarkup) {
      console.error("❌ gesture-markup.js not loaded!");
      return;
    }

    // Install hooks
    hookIntoGestureDetection();
    hookIntoSlideChange();
    hookIntoClearInk();

    // Create UI
    createMarkupControlButton();
    addMarkupSettings();

    // Dev tools
    exposeDevTools();

    console.log("✅ Velos Markup Integration complete!");

    // Dispatch ready event
    window.dispatchEvent(new CustomEvent("velosMarkupReady"));
  }

  // Start initialization when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
