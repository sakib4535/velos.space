    import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

(function () {
  "use strict";

  // Share link redirector
  document.body.addEventListener("click", function (event) {
    const link = event.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href) return;

    const regex = /^\/c\/([^\/]+)\/share\/([^\/]+)$/;
    const match = href.match(regex);

    if (match) {
      const isButton = event.target.closest("button");
      if (isButton) return;

      event.preventDefault();
      const chatId = match[1];
      const shareId = match[2];
      window.location.href = `/share/${shareId}?c=${chatId}`;
    }
  });

  // Scroll Unlocker
  function preventScrollLock(target) {
      const originalAddEventListener = target.addEventListener;
      target.addEventListener = function(type, listener, options) {
          if (type === 'wheel' || type === 'touchmove') return; 
          return originalAddEventListener.call(this, type, listener, options);
      };
  }
  preventScrollLock(document);
  preventScrollLock(window);

  window.addEventListener("hashchange", function (event) {
      if (window.location.hash === "#settings" || window.location.hash === "#pricing") {
        event.stopImmediatePropagation();
        event.preventDefault();
        history.replaceState(null, null, " ");
      }
    }, true
  );

  const filterRules = [
    { type: "selectorOnly", selector: '[data-testid="accounts-profile-button"]' },
    { type: "selectorOnly", selector: '[data-testid="conversation-options-button"]' },
    { type: "selectorOnly", selector: "#modal-account-payment" },
    { type: "selectorOnly", selector: ".data-prompt-textarea-header aside" },
    { type: "selectorOnly", selector: 'a[href="/library"]' },
    { type: "selectorOnly", selector: 'a[href="/admin"]' },
    { type: "selectorOnly", selector: 'a[href="/apps"]' },
    { type: "selectorOnly", selector: 'a[href="/c/mustbe_hidden_pin"]' },
    { type: "selectorOnly", selector: 'a[href="/deep-research"]' },
    { type: "textOnly", text: "Report conversation" },
    { type: "textOnly", text: "This is a copy of a shared ChatGPT conversation" },
    { type: "textOnly", text: "Messages beyond this point are only visible to you" },
    { type: "textOnly", text: "Archive" },
    { type: "textOnly", text: "Start a group chat" },
    { type: "xpath", query: "//button[contains(., 'Invite team members')]" }
  ];

  function cleanDOM() {
    document.body.removeAttribute('data-scroll-locked');
    document.documentElement.removeAttribute('data-scroll-locked');
    
    const nextRoot = document.getElementById('__next');
    if (nextRoot) {
        nextRoot.removeAttribute('aria-hidden');
    }

    document.head.querySelectorAll('style[data-radix-scroll-prevent-default]').forEach(el => {
        el.remove();
    });

    document.querySelectorAll('div[aria-hidden="true"][style*="position: fixed"]').forEach(el => {
        if (el.style.backgroundColor || el.style.backdropFilter || el.style.opacity) {
            el.remove();
        }
    });

    document.querySelectorAll('[aria-description="Share sheet"]').forEach((el) => {
        if (el.parentElement) {
          el.parentElement.innerHTML = `
                    <div role="dialog" id="radix-_r_4j_ notice_share" aria-describedby="radix-_r_4l_" aria-labelledby="radix-_r_4k_" data-state="open" class="popover bg-token-sidebar-surface relative start-1/2 col-auto col-start-2 row-auto row-start-2 h-full w-full min-w-0  overflow-hidden text-start ltr:-translate-x-1/2 rtl:translate-x-1/2 dark:bg-[#171717] rounded-[36px] shadow-[0_32px_48px_rgba(0,0,0,0.175),_0_0_1px_rgba(0,0,0,0.2)] dark:shadow-[0_32px_48px_rgba(0,0,0,0.175),_0_0_1px_rgba(255,255,255,0.4)] flex flex-col focus:outline-hidden max-w-[640px]" tabindex="-1" style="pointer-events: auto;"><img src="https://placehold.co/600x400" alt="Notice"></div>
                `;
        }
    });

    document.querySelectorAll('[href="/cdn/assets/sprites-core-9c5054d5.svg#f7f872"]').forEach((el) => {
        if (el.parentElement) el.parentElement.parentElement.parentElement.remove();
    });

    document.querySelectorAll('[href="/cdn/assets/sprites-core-9c5054d5.svg#61ee0c"]').forEach((el) => {
        if (el.parentElement) el.parentElement.parentElement.parentElement.parentElement.remove();
    });
      
    document.querySelectorAll('[href="/cdn/assets/sprites-core-9c5054d5.svg#427dd9"]').forEach((el) => {
        if (el.parentElement) el.parentElement.parentElement.remove();
    });

    const dynamicModal = document.querySelector('#settings, #pricing, [id*="pricing"], [class*="modal-pricing"], [id*="settings"], [class*="modal-settings"]');
    if (dynamicModal) {
      dynamicModal.remove();
    }

    filterRules.forEach((rule) => {
      if (rule.type === "selectorOnly") {
        const elements = document.querySelectorAll(rule.selector);
        elements.forEach((element) => { if(element) element.style.setProperty('display', 'none', 'important'); });
      } else if (rule.type === "textOnly") {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let textNode;
        const nodesToHide = [];
        while ((textNode = walker.nextNode())) {
          if (textNode.nodeValue.trim() === rule.text) {
            const parent = textNode.parentElement;
            if (parent && parent.children.length === 0) nodesToHide.push(parent);
          }
        }
        nodesToHide.forEach((node) => { if(node) node.style.setProperty('display', 'none', 'important'); });
      } else if (rule.type === "xpath") {
        const snapshot = document.evaluate(rule.query, document, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < snapshot.snapshotLength; i++) {
          const node = snapshot.snapshotItem(i);
          if (node) node.style.setProperty('display', 'none', 'important');
        }
      }
    });
  }

  let isCleaning = false;
  const observer = new MutationObserver((mutationsList) => {
    if (isCleaning) return;
    for (const mutation of mutationsList) {
      if (mutation.type === 'attributes') {
          if (mutation.attributeName === 'data-scroll-locked' && mutation.target === document.body) document.body.removeAttribute('data-scroll-locked');
          if (mutation.attributeName === 'aria-hidden' && mutation.target.id === '__next') mutation.target.removeAttribute('aria-hidden');
      }
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
            if (node.tagName === 'STYLE' && node.hasAttribute('data-radix-scroll-prevent-default')) {
                node.remove();
            }
        });

        isCleaning = true;
        cleanDOM();
        isCleaning = false;
        break;
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'data-scroll-locked', 'aria-hidden'] });
  cleanDOM();
})();

    // Core DOM references.
    const video = document.getElementById('cam');
    const pipVideo = document.getElementById('pip-video');
    const pipOverlay = document.getElementById('pip-overlay');
    const pipCtx = pipOverlay.getContext('2d');
    const slideNum = document.getElementById('slideNum');
    const slideContent = document.getElementById('slideContent');
    const slideCard = document.getElementById('slideCard');
    const laserDot = document.getElementById('laserDot');
    const zoomIndicator = document.getElementById('zoomIndicator');
    const gestureStatus = document.getElementById('gestureStatus');
    const toast = document.getElementById('toast');
    const fpsEl = document.getElementById('fps');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const autoBtn = document.getElementById('autoBtn');
    const highlightBtn = document.getElementById('highlightBtn');
    const mouseToggleBtn = document.getElementById('mouseToggleBtn');
    const laserBtn = document.getElementById('laserBtn');
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const fileInput = document.getElementById('fileInput');
    const drawCanvas = document.getElementById('drawCanvas');
    const ctx = drawCanvas.getContext('2d');
    const fingerCountEl = document.getElementById('finger-count');
    const fingerCountNum = document.getElementById('fingerCountNum');
    const cursorEl = document.getElementById('hand-cursor');
    const gestureValueEl = document.getElementById('gestureValue');
    const errorBox = document.getElementById('errorBox');


    // Workspace UI references.
    const deckTitleTop = document.getElementById('deckTitleTop');
    const deckMetaTop = document.getElementById('deckMetaTop');
    const deckTitleSide = document.getElementById('deckTitleSide');
    const deckMetaSide = document.getElementById('deckMetaSide');
    const deckTypeLabel = document.getElementById('deckTypeLabel');
    const deckProgress = document.getElementById('deckProgress');
    const deckProgressText = document.getElementById('deckProgressText');
    const leftPanelMeta = document.getElementById('leftPanelMeta');
    const stageTitle = document.getElementById('stageTitle');
    const stageMeta = document.getElementById('stageMeta');
    const footerDeckName = document.getElementById('footerDeckName');
    const footerPage = document.getElementById('footerPage');
    const workspaceMode = document.getElementById('workspaceMode');
    const handCountValue = document.getElementById('handCountValue');
    const fpsMetric = document.getElementById('fpsMetric');
    const zoomMetric = document.getElementById('zoomMetric');
    const gestureMetric = document.getElementById('gestureMetric');
    const confidenceBar = document.getElementById('confidenceBar');
    const confidenceValue = document.getElementById('confidenceValue');
    const sessionElapsed = document.getElementById('sessionElapsed');
    const liveClock = document.getElementById('liveClock');
    const modelState = document.getElementById('modelState');
    const modelStateMini = document.getElementById('modelStateMini');
    const settingsModelState = document.getElementById('settingsModelState');
    const cameraState = document.getElementById('cameraState');
    const cameraStateDot = document.getElementById('cameraStateDot');
    const cameraLiveDot = document.getElementById('cameraLiveDot');
    const cameraLiveText = document.getElementById('cameraLiveText');
    const cameraBadgeDot = document.getElementById('cameraBadgeDot');
    const cameraBadgeText = document.getElementById('cameraBadgeText');
    const modeBadge = document.getElementById('modeBadge');
    const deckStatusDot = document.getElementById('deckStatusDot');
    const stageStatusDot = document.getElementById('stageStatusDot');
    const settingsDeckSource = document.getElementById('settingsDeckSource');
    const settingsDeckPages = document.getElementById('settingsDeckPages');
    const cameraFooterState = document.getElementById('cameraFooterState');
    const cameraResolutionLabel = document.getElementById('cameraResolutionLabel');
    const cameraDeviceLabel = document.getElementById('cameraDeviceLabel');
    const inspectorMeta = document.getElementById('inspectorMeta');

    const sidebarToggle = document.getElementById('sidebarToggle');
    const inspectorToggle = document.getElementById('inspectorToggle');
    const settingsBtn = document.getElementById('settingsBtn');
    const shortcutsBtn = document.getElementById('shortcutsBtn');
    const themeBtn = document.getElementById('themeBtn');
    const fitBtn = document.getElementById('fitBtn');
    const clearInkBtn = document.getElementById('clearInkBtn');
    const pipToggleBtn = document.getElementById('pipToggleBtn');
    const settingsDrawer = document.getElementById('settingsDrawer');
    const shortcutsModal = document.getElementById('shortcutsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const closeShortcutsBtn = document.getElementById('closeShortcutsBtn');
    const backdrop = document.getElementById('backdrop');

    const themeSelect = document.getElementById('themeSelect');
    const compactSwitch = document.getElementById('compactSwitch');
    const reducedMotionSwitch = document.getElementById('reducedMotionSwitch');
    const gestureModeSwitch = document.getElementById('gestureModeSwitch');
    const cameraPreviewSwitch = document.getElementById('cameraPreviewSwitch');
    const autoHideSwitch = document.getElementById('autoHideSwitch');
    const drawerAutoHideSwitch = document.getElementById('drawerAutoHideSwitch');
    const drawerCameraSwitch = document.getElementById('drawerCameraSwitch');

    const laserToolBtn = document.getElementById('laserToolBtn');
    const highlightToolBtn = document.getElementById('highlightToolBtn');
    const mouseToolBtn = document.getElementById('mouseToolBtn');
    const autoToolBtn = document.getElementById('autoToolBtn');
    const laserToolState = document.getElementById('laserToolState');
    const highlightToolState = document.getElementById('highlightToolState');
    const mouseToolState = document.getElementById('mouseToolState');
    const autoToolState = document.getElementById('autoToolState');

    let gestureNavigationEnabled = true;
    let sessionStartedAt = Date.now();
    let autoHidePanels = false;

    // PDF.js guard
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // PDF state.
    let pdfDoc = null;
    let currentPage = 0;
    let totalPages = 0;
    let pageImages = [];
    let isPdfLoaded = false;

    const defaultSlides = [
        { title: '🚀 Welcome', content: ['Gesture‑controlled presentation', 'No clicker, no keyboard', 'Just your hands'] },
        { title: '📋 Agenda', content: ['Introduction to Velos', 'Live demo: hand tracking', 'Use cases & Q&A'] },
        { title: '🧠 How it works', content: ['MediaPipe Hand Landmarks', 'Real‑time finger tracking', 'Gesture classification engine'] },
        { title: '✋ Gesture map', content: ['Open hand → Next slide', 'Fist → Previous slide', 'Peace → Toggle fullscreen', 'Point → Laser pointer'] },
        { title: '🏠 Smart Home mode', content: ['Toggle lights with gestures', 'Adjust temperature with swipes', 'All‑off / All‑on commands'] },
        { title: '🙏 Thank you', content: ['Try it yourself!', 'Open source & customisable', 'Any questions?'] }
    ];
    let useDefault = true;
    let defaultIndex = 0;

    // Zoom state. A short two-hand stability window prevents accidental scaling.
    let currentZoom = 1.0;
    let baseZoom = 1.0;
    let baseDist = 0;
    let zoomActive = false;
    let zoomStableCount = 0;
    const ZOOM_STABLE_FRAMES = 4;   // require 4 consecutive frames with two hands

    // Pointer and annotation state.
    let laserActive = false;
    let highlighterMode = false;
    let isDrawing = false;
    let lastDrawX = 0, lastDrawY = 0;

    // Gesture recognition state.
    let landmarker = null;
    let gestureCooldown = 0;
    const COOLDOWN_FRAMES = 6;
    let lastGesture = 'none';
    let gestureConfidence = 0;
    const CONFIDENCE_THRESHOLD = 3;

    let smoothedIndexTip = { x: 0.5, y: 0.5 };
    const SMOOTHING_FACTOR = 0.35;

    let handHistory = [];
    const HISTORY_LENGTH = 8;
    const SWIPE_THRESHOLD = 0.06;

    let autoPlay = false;
    let autoTimer = null;

    // Air-mouse state.
    // Mouse mode owns a separate tracking pipeline. Presentation gestures are not
    // evaluated while mouseEnabled === true.
    let mouseEnabled = false;

    // Left-button state machine.
    let leftPinchActive = false;
    let pinchStartTime = 0;
    let pinchStartPos = { x: 0, y: 0 };       // visual/click position (usually snapped)
    let pinchLockPoint = { x: 0, y: 0 };      // frozen cursor position during a click
    let pinchInputAnchor = { x: 0, y: 0 };    // raw mapped hand position for drag detection
    let pinchStartTarget = null;
    let isDragging = false;
    let isLeftClickPending = false;
    let dragTarget = null;

    let lastLeftPinchTime = 0;
    let lastClickTarget = null;
    let lastClickPos = { x: 0, y: 0 };
    let nextLeftClickAllowedAt = 0;

    // Right-button state.
    let wasPeaceSign = false;
    let peaceStartTime = 0;
    let rightClickCooldown = 0;

    // Cursor tracking.
    let lastMouseTip = null;
    let lastTrackedMouseTip = null;
    let mouseCursorX = window.innerWidth * 0.5;
    let mouseCursorY = window.innerHeight * 0.5;
    let mouseCursorInitialized = false;
    let pinchCloseFrames = 0;
    let pinchOpenFrames = 0;
    let lastHoverTarget = null;
    let lastHoverPoint = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };

    // Cached proximity hit-test data.
    let _hitCache = null;
    let _hitCacheTime = 0;

    const MOUSE_CONFIG = {
        // Camera control region -> full viewport. The small margins make reaching
        // screen edges possible without forcing the physical hand out of frame.
        xMin: 0.075,
        xMax: 0.925,
        yMin: 0.065,
        yMax: 0.93,

        // Patch A: stable resting cursor with faster response during intentional motion.
        smoothingMin: 0.30,
        smoothingMax: 0.76,
        speedForMaxSmoothing: 0.045,
        deadzone: 0.0025,

        // Thumb/index pinch thresholds normalized by palm size.
        // Hysteresis + 3 stable frames prevents landmark noise from creating clicks.
        pinchCloseRatio: 0.56,
        pinchOpenRatio: 0.64,
        pinchStableFrames: 2,
        releaseStableFrames: 2,

        // A normal click fires while the pinch is still held. Release only re-arms
        // the next click, so imperfect release detection can no longer swallow clicks.
        clickTriggerMs: 135,
        clickCooldownMs: 150,
        maxClickHoldMs: 1800,
        dragThresholdPx: 40,
        dragArmMs: 105,
        doubleClickInterval: 460,
        doubleClickDistancePx: 34,

        snapRadiusPx: 48,
        snapInsidePadPx: 10,
        hitCacheMs: 250,

        rightClickHoldMs: 460,
        rightClickCooldownMs: 850,
        edgeMargin: 12,
    };

    // MediaPipe hand skeleton.
    const HAND_CONNECTIONS = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [0,9],[9,10],[10,11],[11,12],
        [0,13],[13,14],[14,15],[15,16],
        [0,17],[17,18],[18,19],[19,20],
        [5,9],[9,13],[13,17],[0,17],[0,5]
    ];
    const FINGER_TIP_INDICES = [4,8,12,16,20];
    const FINGER_PIP_INDICES = [2,6,10,14,18];
    const FINGER_NAMES = ['thumb','index','middle','ring','pinky'];

    // Keep overlay canvases in sync with their rendered size.
    function resizeDrawCanvas() {
        const rect = slideContent.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        drawCanvas.width = rect.width * (window.devicePixelRatio || 1);
        drawCanvas.height = rect.height * (window.devicePixelRatio || 1);
        drawCanvas.style.width = rect.width + 'px';
        drawCanvas.style.height = rect.height + 'px';
        ctx.setTransform(1,0,0,1,0,0);
        ctx.scale(drawCanvas.width / rect.width, drawCanvas.height / rect.height);
    }

    function resizePipOverlay() {
        const rect = pipOverlay.parentElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        // Draw in CSS-pixel coordinates. The backing store is DPR-scaled only once.
        // This fixes the old offset/doubling bug on HiDPI displays.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        pipOverlay.width = Math.max(1, Math.round(rect.width * dpr));
        pipOverlay.height = Math.max(1, Math.round(rect.height * dpr));
        pipOverlay.style.width = rect.width + 'px';
        pipOverlay.style.height = rect.height + 'px';
        pipCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        _hitCache = null;
    }

    function clearDrawCanvas() {
        if (drawCanvas.width > 0 && drawCanvas.height > 0) {
            ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        }
        isDrawing = false;
    }

    // Slide rendering.
    function showSlide(index) {
        clearDrawCanvas();
        if (isPdfLoaded && pdfDoc) {
            if (index < 0 || index >= totalPages) return;
            currentPage = index;
            slideNum.textContent = `${currentPage+1} / ${totalPages}`;
            slideContent.innerHTML = '';
            const canvas = pageImages[currentPage];
            if (canvas) {
                slideContent.appendChild(canvas);
            } else {
                slideContent.innerHTML = '<div class="placeholder">Rendering page...</div>';
                renderPage(currentPage).then(c => {
                    if (c) {
                        pageImages[currentPage] = c;
                        slideContent.innerHTML = '';
                        slideContent.appendChild(c);
                    }
                });
            }
            slideContent.appendChild(drawCanvas);
            resizeDrawCanvas();
        } else {
            useDefault = true;
            if (index < 0 || index >= defaultSlides.length) return;
            defaultIndex = index;
            const s = defaultSlides[index];
            slideNum.textContent = `${index+1} / ${defaultSlides.length}`;
            slideContent.innerHTML = `
                <div style="width:100%;padding:20px;">
                    <h1 style="font-size:clamp(2.2rem,6vw,4.2rem);font-weight:700;background:linear-gradient(135deg,#f0f8ff,#7bc9ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:24px;">${s.title}</h1>
                    <ul style="list-style:none;padding:0;">
                        ${s.content.map(item => `<li style="font-size:clamp(1.2rem,2.5vw,2rem);color:#c8d8e8;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);padding-left:28px;position:relative;">◆ ${item}</li>`).join('')}
                    </ul>
                </div>
            `;
            slideContent.appendChild(drawCanvas);
            resizeDrawCanvas();
        }
        applyZoom(currentZoom);
        updateDeckUI();
    }

    function applyZoom(scale) {
        slideCard.style.transform = `scale(${scale})`;
        zoomIndicator.textContent = `Zoom: ${Math.round(scale * 100)}%`;
        if (zoomMetric) zoomMetric.textContent = `${Math.round(scale * 100)}%`;
        zoomIndicator.classList.add('show');
        clearTimeout(zoomIndicator._hideTimer);
        zoomIndicator._hideTimer = setTimeout(() => {
            zoomIndicator.classList.remove('show');
        }, 2000);
        setTimeout(resizeDrawCanvas, 100);
    }

    function resetZoom() {
        currentZoom = 1.0;
        applyZoom(1.0);
        zoomActive = false;
        baseDist = 0;
        zoomStableCount = 0;
    }

    // PDF rendering.
    async function renderPage(pageNum) {
        if (!pdfDoc || typeof pdfjsLib === 'undefined') return null;
        try {
            const page = await pdfDoc.getPage(pageNum + 1);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const renderContext = { canvasContext: context, viewport: viewport };
            await page.render(renderContext).promise;
            return canvas;
        } catch (e) {
            console.error('Render error:', e);
            return null;
        }
    }

    async function loadPDF(file) {
        if (typeof pdfjsLib === 'undefined') {
            showToast('PDF.js not loaded', 2000);
            return;
        }
        const arrayBuffer = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        totalPages = pdfDoc.numPages;
        isPdfLoaded = true;
        useDefault = false;
        pageImages = [];
        const canvas = await renderPage(0);
        if (canvas) pageImages[0] = canvas;
        currentPage = 0;
        showSlide(0);
        showToast(`Loaded ${totalPages} PDF pages`, 1500);
        updateDeckUI(file.name);
    }

    // Navigation and presentation controls.
    function nextSlide() {
        if (isPdfLoaded && pdfDoc) {
            const next = (currentPage + 1) % totalPages;
            showSlide(next);
            showToast(`Page ${next+1}/${totalPages}`);
        } else {
            const next = (defaultIndex + 1) % defaultSlides.length;
            showSlide(next);
            showToast('Next slide');
        }
    }

    function prevSlide() {
        if (isPdfLoaded && pdfDoc) {
            const prev = (currentPage - 1 + totalPages) % totalPages;
            showSlide(prev);
            showToast(`Page ${prev+1}/${totalPages}`);
        } else {
            const prev = (defaultIndex - 1 + defaultSlides.length) % defaultSlides.length;
            showSlide(prev);
            showToast('Previous slide');
        }
    }

    function toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            showToast('Exit fullscreen');
        } else {
            document.body.requestFullscreen();
            showToast('Fullscreen');
        }
    }

    function toggleAutoPlay() {
        autoPlay = !autoPlay;
        if (autoPlay) {
            autoBtn.classList.add('active');
            startAutoPlay();
            showToast('Auto‑play started ▶️');
        } else {
            autoBtn.classList.remove('active');
            clearTimeout(autoTimer);
            showToast('Auto‑play stopped ⏹');
        }
        syncToolStates();
    }

    function startAutoPlay() {
        if (!autoPlay) return;
        autoTimer = setTimeout(() => {
            nextSlide();
            startAutoPlay();
        }, 5000);
    }

    function toggleHighlighter() {
        highlighterMode = !highlighterMode;
        if (highlighterMode) {
            highlightBtn.classList.add('active');
            showToast('🖊️ Highlighter ON');
            if (!laserActive) {
                laserActive = true;
                laserDot.classList.add('active');
                laserDot.classList.add('highlighter');
            } else {
                laserDot.classList.add('highlighter');
            }
        } else {
            highlightBtn.classList.remove('active');
            laserDot.classList.remove('highlighter');
            showToast('🖊️ Highlighter OFF');
        }
        isDrawing = false;
        clearDrawCanvas();
        syncToolStates();
    }

    // ── Toast ──
    let toastTimer = null;

    function showToast(msg, duration = 1200) {
        if (toastTimer) clearTimeout(toastTimer);
        toast.textContent = msg;
        toast.classList.add('show');
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
            toastTimer = null;
        }, duration);
    }

    function showError(msg) {
        errorBox.style.display = 'block';
        errorBox.textContent = msg;
        setTimeout(() => {
            errorBox.style.display = 'none';
        }, 5000);
    }

    // Gesture classification helpers.
    function landmarkDistance3D(a, b) {
        if (!a || !b) return Infinity;
        const dz = (a.z || 0) - (b.z || 0);
        return Math.hypot(a.x - b.x, a.y - b.y, dz);
    }

    function jointAngleDeg(a, b, c) {
        if (!a || !b || !c) return 0;
        const ab = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
        const cb = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
        const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
        const ma = Math.hypot(ab.x, ab.y, ab.z);
        const mc = Math.hypot(cb.x, cb.y, cb.z);
        if (ma < 1e-6 || mc < 1e-6) return 0;
        const cos = Math.max(-1, Math.min(1, dot / (ma * mc)));
        return Math.acos(cos) * 180 / Math.PI;
    }

    function getFingerExtension(landmarks) {
        if (!landmarks || landmarks.length < 21) return [false, false, false, false, false];

        const wrist = landmarks[0];
        const result = [];

        // Thumb: use joint straightness + distance from wrist, which works for either
        // left/right hand and is much less dependent on camera rotation.
        const thumbMcpAngle = jointAngleDeg(landmarks[1], landmarks[2], landmarks[3]);
        const thumbIpAngle = jointAngleDeg(landmarks[2], landmarks[3], landmarks[4]);
        const thumbExtended =
            thumbMcpAngle > 135 &&
            thumbIpAngle > 145 &&
            landmarkDistance3D(landmarks[4], wrist) >
                landmarkDistance3D(landmarks[3], wrist) * 1.05;
        result.push(thumbExtended);

        // Index, middle, ring, pinky.
        const chains = [
            [5, 6, 7, 8],
            [9, 10, 11, 12],
            [13, 14, 15, 16],
            [17, 18, 19, 20],
        ];

        for (const [mcp, pip, dip, tip] of chains) {
            const pipAngle = jointAngleDeg(landmarks[mcp], landmarks[pip], landmarks[dip]);
            const dipAngle = jointAngleDeg(landmarks[pip], landmarks[dip], landmarks[tip]);
            const extended =
                pipAngle > 150 &&
                dipAngle > 145 &&
                landmarkDistance3D(landmarks[tip], wrist) >
                    landmarkDistance3D(landmarks[pip], wrist) * 1.08;
            result.push(extended);
        }

        return result;
    }

    function recognizeGesture(landmarks) {
        if (!landmarks || landmarks.length < 21) return 'none';
        const ext = getFingerExtension(landmarks);
        const [thumb, index, middle, ring, pinky] = ext;
        const count = ext.filter(Boolean).length;

        if (!thumb && !index && !middle && !ring && !pinky) return 'fist';
        if (thumb && index && middle && ring && pinky) return 'open';
        if (thumb && index && !middle && !ring && !pinky) return 'point';
        if (index && middle && !ring && !pinky && !thumb) return 'peace';
        if (thumb && !index && !middle && !ring && !pinky) {
            const wrist = landmarks[0];
            const tip = landmarks[4];
            if (tip.y < wrist.y - 0.02) return 'thumbsup';
            if (tip.y > wrist.y + 0.02) return 'thumbsdown';
            return 'thumbsup';
        }
        if (count >= 3 && thumb) return 'open';
        return 'none';
    }

    function getHandCenter(landmarks) {
        let cx = 0, cy = 0;
        for (const lm of landmarks) { cx += lm.x; cy += lm.y; }
        return { x: cx / landmarks.length, y: cy / landmarks.length };
    }

    function detectSwipe(history) {
        if (history.length < HISTORY_LENGTH) return null;
        const first = history[0];
        const last = history[history.length - 1];
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) return null;
        if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'swipeRight' : 'swipeLeft';
        return dy > 0 ? 'swipeDown' : 'swipeUp';
    }

    // Laser and highlighter update.
    function updateLaser(landmarks) {
        if (!landmarks || landmarks.length < 21) {
            laserDot.classList.remove('active');
            isDrawing = false;
            return;
        }
        const idx = landmarks[8];
        smoothedIndexTip.x += (idx.x - smoothedIndexTip.x) * SMOOTHING_FACTOR;
        smoothedIndexTip.y += (idx.y - smoothedIndexTip.y) * SMOOTHING_FACTOR;

        const contentRect = slideContent.getBoundingClientRect();
        const sx = (1 - smoothedIndexTip.x) * window.innerWidth;
        const sy = smoothedIndexTip.y * window.innerHeight;

        const relX = (sx - contentRect.left) / contentRect.width;
        const relY = (sy - contentRect.top) / contentRect.height;

        const inside = relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1;

        if (inside && laserActive) {
            laserDot.classList.add('active');
            laserDot.style.left = (relX * 100) + '%';
            laserDot.style.top = (relY * 100) + '%';
            if (highlighterMode) {
                const canvasRect = drawCanvas.getBoundingClientRect();
                if (canvasRect.width > 0 && canvasRect.height > 0) {
                    const drawX = (sx - canvasRect.left) * (drawCanvas.width / canvasRect.width);
                    const drawY = (sy - canvasRect.top) * (drawCanvas.height / canvasRect.height);
                    if (isDrawing) {
                        ctx.beginPath();
                        ctx.moveTo(lastDrawX, lastDrawY);
                        ctx.lineTo(drawX, drawY);
                        ctx.strokeStyle = '#00ff88';
                        ctx.lineWidth = 6 * (drawCanvas.width / canvasRect.width);
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.stroke();
                    } else {
                        isDrawing = true;
                    }
                    lastDrawX = drawX;
                    lastDrawY = drawY;
                }
            } else {
                isDrawing = false;
            }
            const distFromCenter = Math.hypot(relX - 0.5, relY - 0.5);
            const size = 14 + distFromCenter * 8;
            laserDot.style.width = size + 'px';
            laserDot.style.height = size + 'px';
        } else {
            laserDot.classList.remove('active');
            isDrawing = false;
        }
    }

    // Map a recognized gesture to a presenter action.
    function dispatchAction(gesture, landmarks) {
        if (gestureCooldown > 0) return;
        if (gesture === 'none') return;
        if (mouseEnabled) return;
        if (!gestureNavigationEnabled) return;

        if (highlighterMode) {
            const navGestures = ['open', 'fist', 'swipeLeft', 'swipeRight'];
            if (navGestures.includes(gesture)) {
                gestureStatus.textContent = '🖊️';
                gestureStatus.classList.add('show');
                clearTimeout(gestureStatus._hideTimer);
                gestureStatus._hideTimer = setTimeout(() => {
                    gestureStatus.classList.remove('show');
                }, 400);
                return;
            }
        }

        if (gesture === lastGesture && gesture !== 'point' && gesture !== 'thumbsup' && gesture !== 'thumbsdown') {
            if (gestureCooldown > 0) return;
        }

        gestureCooldown = COOLDOWN_FRAMES;
        lastGesture = gesture;

        const emojis = {
            'open': '✋',
            'fist': '✊',
            'peace': '✌️',
            'point': '👆',
            'thumbsup': '👍',
            'thumbsdown': '👎',
            'swipeLeft': '⬅️',
            'swipeRight': '➡️',
            'swipeUp': '⬆️',
            'swipeDown': '⬇️'
        };
        gestureStatus.textContent = emojis[gesture] || '✋';
        gestureStatus.classList.add('show');
        clearTimeout(gestureStatus._hideTimer);
        gestureStatus._hideTimer = setTimeout(() => {
            gestureStatus.classList.remove('show');
        }, 800);
        gestureValueEl.textContent = gesture;
        if (gestureMetric) gestureMetric.textContent = gesture;
        updateConfidence(gesture === 'none' ? 0 : 100);

        switch (gesture) {
            case 'open':
            case 'swipeRight':
                nextSlide();
                break;
            case 'fist':
            case 'swipeLeft':
                prevSlide();
                break;
            case 'peace':
                toggleFullscreen();
                break;
            case 'point':
                laserActive = !laserActive;
                if (!laserActive) {
                    laserDot.classList.remove('active');
                    isDrawing = false;
                    if (highlighterMode) {
                        highlighterMode = false;
                        highlightBtn.classList.remove('active');
                        laserDot.classList.remove('highlighter');
                        showToast('🖊️ Highlighter OFF');
                    }
                } else {
                    if (highlighterMode) {
                        laserDot.classList.add('highlighter');
                    }
                    if (landmarks) updateLaser(landmarks);
                }
                showToast(laserActive ? '🔦 Laser ON' : '🔦 Laser OFF');
                break;
            case 'thumbsup':
                if (!autoPlay) toggleAutoPlay();
                break;
            case 'thumbsdown':
                if (autoPlay) toggleAutoPlay();
                break;
            default:
                break;
        }
    }

    // Camera preview + hand overlay.
    //
    // IMPORTANT: the video frame and every landmark use the SAME projection function.
    // This keeps dots on top of the real fingers even when the optional convex lens
    // preview is active.
    const LENS_STRENGTH = 0.16;   // 0 = flat; ~0.10-0.24 is a sensible preview range
    const LENS_GRID_X = 8;
    const LENS_GRID_Y = 5;

    function clearPipCanvas() {
        const rect = pipOverlay.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        pipCtx.clearRect(0, 0, rect.width, rect.height);
        return rect;
    }

    function getPipVideoBox() {
        const rect = pipOverlay.getBoundingClientRect();
        const vw = pipVideo.videoWidth || video.videoWidth || 16;
        const vh = pipVideo.videoHeight || video.videoHeight || 9;
        if (!rect.width || !rect.height || !vw || !vh) {
            return { x: 0, y: 0, width: rect.width || 1, height: rect.height || 1 };
        }

        // Equivalent to object-fit: contain. No source pixels are cropped.
        const scale = Math.min(rect.width / vw, rect.height / vh);
        const width = vw * scale;
        const height = vh * scale;
        return {
            x: (rect.width - width) / 2,
            y: (rect.height - height) / 2,
            width,
            height,
        };
    }

    function lensProjectUV(u, v, box) {
        // Source normalized coordinates -> mirrored selfie coordinates [-1, 1].
        let nx = -((u * 2) - 1);
        let ny = (v * 2) - 1;

        if (LENS_STRENGTH > 0) {
            // Mild radial convex/barrel preview. Normalize by the corner scale so
            // the entire captured frame remains represented instead of being cropped.
            const r2 = nx * nx + ny * ny;
            const factor = (1 + LENS_STRENGTH * r2) / (1 + 2 * LENS_STRENGTH);
            nx *= factor;
            ny *= factor;
        }

        return {
            x: box.x + (nx * 0.5 + 0.5) * box.width,
            y: box.y + (ny * 0.5 + 0.5) * box.height,
        };
    }

    function projectPipLandmark(p, box) {
        return lensProjectUV(p.x, p.y, box);
    }

    function affineFromTriangles(s0, s1, s2, d0, d1, d2) {
        const den =
            s0.x * (s1.y - s2.y) +
            s1.x * (s2.y - s0.y) +
            s2.x * (s0.y - s1.y);

        if (Math.abs(den) < 1e-8) return null;

        const a = (
            d0.x * (s1.y - s2.y) +
            d1.x * (s2.y - s0.y) +
            d2.x * (s0.y - s1.y)
        ) / den;

        const c = (
            d0.x * (s2.x - s1.x) +
            d1.x * (s0.x - s2.x) +
            d2.x * (s1.x - s0.x)
        ) / den;

        const e = (
            d0.x * (s1.x * s2.y - s2.x * s1.y) +
            d1.x * (s2.x * s0.y - s0.x * s2.y) +
            d2.x * (s0.x * s1.y - s1.x * s0.y)
        ) / den;

        const b = (
            d0.y * (s1.y - s2.y) +
            d1.y * (s2.y - s0.y) +
            d2.y * (s0.y - s1.y)
        ) / den;

        const d = (
            d0.y * (s2.x - s1.x) +
            d1.y * (s0.x - s2.x) +
            d2.y * (s1.x - s0.x)
        ) / den;

        const f = (
            d0.y * (s1.x * s2.y - s2.x * s1.y) +
            d1.y * (s2.x * s0.y - s0.x * s2.y) +
            d2.y * (s0.x * s1.y - s1.x * s0.y)
        ) / den;

        return { a, b, c, d, e, f };
    }

    function drawVideoTriangle(s0, s1, s2, d0, d1, d2) {
        const m = affineFromTriangles(s0, s1, s2, d0, d1, d2);
        if (!m) return;

        pipCtx.save();
        pipCtx.beginPath();
        pipCtx.moveTo(d0.x, d0.y);
        pipCtx.lineTo(d1.x, d1.y);
        pipCtx.lineTo(d2.x, d2.y);
        pipCtx.closePath();
        pipCtx.clip();

        pipCtx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
        pipCtx.drawImage(pipVideo, 0, 0);
        pipCtx.restore();
    }

    function drawConvexCameraFrame(box) {
        const vw = pipVideo.videoWidth;
        const vh = pipVideo.videoHeight;
        if (!vw || !vh || !box.width || !box.height) return;

        // Opaque backing prevents the undistorted fallback video from showing through
        // between the warped mesh cells.
        const rect = pipOverlay.getBoundingClientRect();
        pipCtx.save();
        pipCtx.fillStyle = '#030507';
        pipCtx.fillRect(0, 0, rect.width, rect.height);
        pipCtx.restore();

        // A small texture mesh gives a genuine radial lens effect while allowing the
        // exact same lensProjectUV() function to be used for the landmarks.
        for (let gy = 0; gy < LENS_GRID_Y; gy++) {
            const v0 = gy / LENS_GRID_Y;
            const v1 = (gy + 1) / LENS_GRID_Y;

            for (let gx = 0; gx < LENS_GRID_X; gx++) {
                const u0 = gx / LENS_GRID_X;
                const u1 = (gx + 1) / LENS_GRID_X;

                const s00 = { x: u0 * vw, y: v0 * vh };
                const s10 = { x: u1 * vw, y: v0 * vh };
                const s01 = { x: u0 * vw, y: v1 * vh };
                const s11 = { x: u1 * vw, y: v1 * vh };

                const d00 = lensProjectUV(u0, v0, box);
                const d10 = lensProjectUV(u1, v0, box);
                const d01 = lensProjectUV(u0, v1, box);
                const d11 = lensProjectUV(u1, v1, box);

                drawVideoTriangle(s00, s10, s11, d00, d10, d11);
                drawVideoTriangle(s00, s11, s01, d00, d11, d01);
            }
        }
    }

    function drawHandSkeleton(lm, handIndex, box) {
        if (!lm || lm.length < 21) return null;

        const pts = lm.map(p => projectPipLandmark(p, box));
        const ext = getFingerExtension(lm);
        const count = ext.filter(Boolean).length;

        const handStyles = [
            {
                line: 'rgba(101, 230, 189, 0.78)',
                joint: '#66ddff',
                tip: '#65e6bd',
                label: '#c9fff0',
            },
            {
                line: 'rgba(168, 147, 255, 0.78)',
                joint: '#9acbff',
                tip: '#c1b3ff',
                label: '#eee9ff',
            },
        ];
        const hs = handStyles[handIndex % handStyles.length];

        pipCtx.save();
        pipCtx.strokeStyle = hs.line;
        pipCtx.lineWidth = 1.8;

        for (const [i, j] of HAND_CONNECTIONS) {
            if (i >= pts.length || j >= pts.length) continue;
            pipCtx.beginPath();
            pipCtx.moveTo(pts[i].x, pts[i].y);
            pipCtx.lineTo(pts[j].x, pts[j].y);
            pipCtx.stroke();
        }

        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const isTip = FINGER_TIP_INDICES.includes(i);
            pipCtx.beginPath();
            pipCtx.arc(p.x, p.y, isTip ? 4.5 : 2.7, 0, Math.PI * 2);
            pipCtx.fillStyle = isTip ? hs.tip : hs.joint;
            if (isTip) {
                pipCtx.shadowColor = hs.tip;
                pipCtx.shadowBlur = 8;
            }
            pipCtx.fill();
            pipCtx.shadowBlur = 0;
        }

        // Per-hand object label anchored near the wrist.
        const wrist = pts[0];
        const label = `H${handIndex + 1} · ${count}`;
        pipCtx.font = '600 11px Inter, system-ui, sans-serif';
        pipCtx.textAlign = 'left';
        pipCtx.textBaseline = 'middle';
        const tw = pipCtx.measureText(label).width + 12;
        const lx = Math.max(4, Math.min(box.x + box.width - tw - 4, wrist.x + 7));
        const ly = Math.max(12, Math.min(box.y + box.height - 12, wrist.y + 8));
        pipCtx.fillStyle = 'rgba(3, 7, 10, 0.72)';
        pipCtx.fillRect(lx, ly - 10, tw, 20);
        pipCtx.fillStyle = hs.label;
        pipCtx.fillText(label, lx + 6, ly);
        pipCtx.restore();

        return { count, points: pts };
    }

    function drawLandmarksOnPip(landmarksArray) {
        const rect = clearPipCanvas();
        if (!rect) return;

        const box = getPipVideoBox();
        if (pipVideo.readyState >= 2) {
            drawConvexCameraFrame(box);
        }

        if (!landmarksArray || landmarksArray.length === 0) {
            fingerCountEl.classList.add('hidden');
            return;
        }

        const handResults = [];
        for (let i = 0; i < landmarksArray.length; i++) {
            const result = drawHandSkeleton(landmarksArray[i], i, box);
            if (result) handResults.push(result);
        }

        if (handResults.length === 0) {
            fingerCountEl.classList.add('hidden');
            return;
        }

        const counts = handResults.map(h => h.count);
        const total = counts.reduce((sum, n) => sum + n, 0);

        if (counts.length === 1) {
            fingerCountNum.textContent = `1 hand · ${counts[0]} fingers`;
        } else {
            fingerCountNum.textContent =
                `${counts.length} hands · ${counts.map((n, i) => `H${i + 1}:${n}`).join(' · ')} · total ${total}`;
        }
        fingerCountEl.classList.remove('hidden');
    }

    // Air-mouse interaction.
    // v6 click model:
    //   hover -> stable pinch -> short hold -> ONE real element click
    //   release only re-arms the next click
    //   deliberate early movement before clickTriggerMs becomes a drag
    // This is intentionally independent from presentation gestures.
    const INTERACTIVE_SELECTOR = [
        'button',
        'a[href]',
        'input',
        'select',
        'textarea',
        'label',
        '[role="button"]',
        '[role="link"]',
        '[role="menuitem"]',
        '[tabindex]:not([tabindex="-1"])',
        '[onclick]'
    ].join(',');

    let clickFiredForCurrentPinch = false;
    let dragMouseDownSent = false;

    function clamp01(value) {
        return Math.max(0, Math.min(1, value));
    }

    function mapRange01(value, min, max) {
        if (max <= min) return 0.5;
        return clamp01((value - min) / (max - min));
    }

    function pointDistance(a, b) {
        if (!a || !b) return Infinity;
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function isIgnoredMouseElement(el) {
        if (!el) return true;
        return el === cursorEl ||
            el === laserDot ||
            el.id === 'pip-overlay' ||
            el.id === 'pip-video' ||
            el.id === 'drawCanvas' ||
            !!el.closest?.('#pip-wrapper');
    }

    function isUsableInteractive(el) {
        if (!(el instanceof Element) || isIgnoredMouseElement(el)) return false;
        const style = window.getComputedStyle(el);
        if (style.pointerEvents === 'none' ||
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            Number(style.opacity) === 0) {
            return false;
        }
        if (el.matches?.(':disabled,[aria-disabled="true"]')) return false;
        return true;
    }

    function getInteractiveCenters() {
        const els = document.querySelectorAll(INTERACTIVE_SELECTOR);
        const result = [];
        for (const el of els) {
            if (!isUsableInteractive(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            if (r.right < -40 || r.left > innerWidth + 40 ||
                r.bottom < -40 || r.top > innerHeight + 40) continue;
            result.push({ el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, r });
        }
        return result;
    }

    function refreshHitCache(force = false) {
        const now = performance.now();
        if (force || !_hitCache || now - _hitCacheTime > MOUSE_CONFIG.hitCacheMs) {
            _hitCache = getInteractiveCenters();
            _hitCacheTime = now;
        }
        return _hitCache;
    }

    function findNearestInteractive(x, y, maxDist = MOUSE_CONFIG.snapRadiusPx) {
        const targets = refreshHitCache(false);
        let best = null;
        let bestScore = Infinity;

        for (const target of targets) {
            const dx = x < target.r.left ? target.r.left - x :
                x > target.r.right ? x - target.r.right : 0;
            const dy = y < target.r.top ? target.r.top - y :
                y > target.r.bottom ? y - target.r.bottom : 0;
            const edgeDistance = Math.hypot(dx, dy);
            if (edgeDistance > maxDist) continue;

            const centerDistance = Math.hypot(target.cx - x, target.cy - y);
            const score = edgeDistance * 4 + centerDistance * 0.10;
            if (score < bestScore) {
                bestScore = score;
                best = target;
            }
        }
        return best;
    }

    function getTargetElement(x, y) {
        // First prefer what is actually under the pointer.
        const stack = document.elementsFromPoint(x, y);
        for (const raw of stack) {
            if (!(raw instanceof Element) || isIgnoredMouseElement(raw)) continue;
            const actionable = raw.closest?.(INTERACTIVE_SELECTOR);
            if (actionable && isUsableInteractive(actionable)) return actionable;
        }

        // Then allow a small proximity tolerance for tiny controls.
        const near = findNearestInteractive(x, y, MOUSE_CONFIG.snapRadiusPx);
        return near?.el || null;
    }

    function snapPoint(x, y) {
        const near = findNearestInteractive(x, y, MOUSE_CONFIG.snapRadiusPx);
        if (!near) return { x, y, snapped: false, target: null };

        const pad = MOUSE_CONFIG.snapInsidePadPx;
        const inside =
            x >= near.r.left - pad && x <= near.r.right + pad &&
            y >= near.r.top - pad && y <= near.r.bottom + pad;

        if (!inside) return { x, y, snapped: false, target: null };
        return { x: near.cx, y: near.cy, snapped: true, target: near.el };
    }

    function makePointerOptions(x, y, button, buttons, detail = 1) {
        return {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button,
            buttons,
            detail,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            pressure: buttons ? 0.5 : 0,
        };
    }

    function dispatchMouseDown(el, x, y, button = 0) {
        if (!el) return;
        const buttons = button === 0 ? 1 : 2;
        const opts = makePointerOptions(x, y, button, buttons, 1);
        if (window.PointerEvent) el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
    }

    function dispatchMouseMove(el, x, y, buttons = 1) {
        if (!el) return;
        const opts = makePointerOptions(x, y, 0, buttons, 0);
        if (window.PointerEvent) el.dispatchEvent(new PointerEvent('pointermove', opts));
        el.dispatchEvent(new MouseEvent('mousemove', opts));
    }

    function dispatchMouseUp(el, x, y, button = 0) {
        if (!el) return;
        const opts = makePointerOptions(x, y, button, 0, 1);
        if (window.PointerEvent) el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
    }

    function dispatchSyntheticClick(el, x, y, detail = 1) {
        if (!el) return false;
        const opts = makePointerOptions(x, y, 0, 0, detail);
        el.dispatchEvent(new MouseEvent('click', opts));
        if (detail === 2) el.dispatchEvent(new MouseEvent('dblclick', opts));
        return true;
    }

    function dispatchContextMenu(el, x, y) {
        if (!el) return;
        const opts = makePointerOptions(x, y, 2, 0, 1);
        el.dispatchEvent(new MouseEvent('contextmenu', opts));
        cursorEl.classList.add('right-click');
        setTimeout(() => cursorEl.classList.remove('right-click'), 200);
    }

    function flashCursor() {
        cursorEl.classList.add('flash');
        setTimeout(() => cursorEl.classList.remove('flash'), 130);
    }

    function getHandScale(lm) {
        if (!lm || lm.length < 21) return 0.1;
        const palmWidth = pointDistance(lm[5], lm[17]);
        const palmLength = pointDistance(lm[0], lm[9]);
        return Math.max(palmWidth, palmLength, 0.035);
    }

    function getPinchRatio(lm, fingerTipIndex) {
        if (!lm?.[4] || !lm?.[fingerTipIndex]) return Infinity;
        return pointDistance(lm[4], lm[fingerTipIndex]) / getHandScale(lm);
    }

    function chooseMouseHand(hands) {
        if (!hands || hands.length === 0) return null;
        if (hands.length === 1 || !lastTrackedMouseTip) return hands[0];

        let best = hands[0];
        let bestDistance = Infinity;
        for (const hand of hands) {
            const tip = hand?.[8];
            if (!tip) continue;
            const normalized = { x: 1 - tip.x, y: tip.y };
            const d = pointDistance(normalized, lastTrackedMouseTip);
            if (d < bestDistance) {
                bestDistance = d;
                best = hand;
            }
        }
        return best;
    }

    function resetMousePressState({ release = false } = {}) {
        if (release && leftPinchActive && isDragging && dragMouseDownSent) {
            const upTarget = getTargetElement(mouseCursorX, mouseCursorY) || dragTarget || pinchStartTarget;
            try { dispatchMouseUp(upTarget, mouseCursorX, mouseCursorY, 0); } catch (_) {}
        }

        leftPinchActive = false;
        isDragging = false;
        isLeftClickPending = false;
        clickFiredForCurrentPinch = false;
        dragMouseDownSent = false;
        pinchStartTarget = null;
        dragTarget = null;
        pinchStartTime = 0;
        pinchLockPoint = { x: mouseCursorX, y: mouseCursorY };
        pinchInputAnchor = { x: mouseCursorX, y: mouseCursorY };
        pinchCloseFrames = 0;
        pinchOpenFrames = 0;
        cursorEl.classList.remove('pinching', 'dragging');
    }

    function resetAirMouseTracking({ hideCursor = false, release = false } = {}) {
        resetMousePressState({ release });
        wasPeaceSign = false;
        peaceStartTime = 0;
        lastMouseTip = null;
        lastTrackedMouseTip = null;
        mouseCursorInitialized = false;
        lastHoverTarget = null;
        lastHoverPoint = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
        _hitCache = null;
        _hitCacheTime = 0;
        if (hideCursor) {
            cursorEl.classList.remove('active', 'right-click');
            cursorEl.style.opacity = '0';
        }
    }

    function activateMouseTarget(el, x, y, isDouble = false) {
        if (!el || !isUsableInteractive(el)) return false;

        // Focus first when possible. This makes keyboard-oriented controls/selects
        // behave closer to a real mouse click.
        try { el.focus?.({ preventScroll: true }); } catch (_) {}

        // For the app's normal HTML controls, native HTMLElement.click() is the most
        // reliable way to invoke the registered click handler from hand tracking.
        try {
            if (typeof el.click === 'function' && !el.matches?.(':disabled,[aria-disabled="true"]')) {
                el.click();
                if (isDouble) {
                    const dbl = makePointerOptions(x, y, 0, 0, 2);
                    el.dispatchEvent(new MouseEvent('dblclick', dbl));
                }
                flashCursor();
                return true;
            }
        } catch (err) {
            console.debug('Native element click fallback:', err);
        }

        try {
            const ok = dispatchSyntheticClick(el, x, y, isDouble ? 2 : 1);
            if (ok) flashCursor();
            return ok;
        } catch (err) {
            console.warn('Air-mouse click failed:', err);
            return false;
        }
    }

    function fireLeftClick(clickTarget, x, y, now) {
        if (!clickTarget || clickFiredForCurrentPinch || now < nextLeftClickAllowedAt) return false;

        const sinceLast = now - lastLeftPinchTime;
        const sameTarget = lastClickTarget === clickTarget;
        const closeToLast = Math.hypot(x - lastClickPos.x, y - lastClickPos.y) <= MOUSE_CONFIG.doubleClickDistancePx;
        const isDouble = sameTarget && closeToLast &&
            sinceLast > 90 && sinceLast <= MOUSE_CONFIG.doubleClickInterval;

        const ok = activateMouseTarget(clickTarget, x, y, isDouble);
        if (!ok) return false;

        clickFiredForCurrentPinch = true;
        isLeftClickPending = false;
        lastLeftPinchTime = now;
        lastClickTarget = clickTarget;
        lastClickPos = { x, y };
        nextLeftClickAllowedAt = now + MOUSE_CONFIG.clickCooldownMs;
        showToast(isDouble ? 'Double click' : 'Left click', 420);
        return true;
    }

    function updateMouse(landmarks) {
        if (!mouseEnabled) {
            cursorEl.classList.remove('active');
            return;
        }

        const lm = chooseMouseHand(landmarks);
        if (!lm || lm.length < 21) {
            cursorEl.style.opacity = '0.25';
            resetMousePressState({ release: true });
            wasPeaceSign = false;
            peaceStartTime = 0;
            return;
        }

        const idx = lm[8];
        if (!idx) return;

        // Selfie/mirrored mapping.
        let nx = 1 - idx.x;
        let ny = idx.y;

        if (lastMouseTip) {
            const rawDelta = Math.hypot(nx - lastMouseTip.x, ny - lastMouseTip.y);
            if (rawDelta < MOUSE_CONFIG.deadzone) {
                nx = lastMouseTip.x;
                ny = lastMouseTip.y;
            }
        }

        const rawSpeed = lastMouseTip
            ? Math.hypot(nx - lastMouseTip.x, ny - lastMouseTip.y)
            : 0;

        lastMouseTip = { x: nx, y: ny };
        lastTrackedMouseTip = { x: nx, y: ny };

        const mappedX = mapRange01(nx, MOUSE_CONFIG.xMin, MOUSE_CONFIG.xMax);
        const mappedY = mapRange01(ny, MOUSE_CONFIG.yMin, MOUSE_CONFIG.yMax);
        const inputX = mappedX * Math.max(1, window.innerWidth - 1);
        const inputY = mappedY * Math.max(1, window.innerHeight - 1);

        const speedT = clamp01(rawSpeed / MOUSE_CONFIG.speedForMaxSmoothing);
        const alpha = MOUSE_CONFIG.smoothingMin +
            (MOUSE_CONFIG.smoothingMax - MOUSE_CONFIG.smoothingMin) * speedT;

        if (!mouseCursorInitialized) {
            mouseCursorX = inputX;
            mouseCursorY = inputY;
            mouseCursorInitialized = true;
        } else if (!leftPinchActive || isDragging) {
            mouseCursorX += (inputX - mouseCursorX) * alpha;
            mouseCursorY += (inputY - mouseCursorY) * alpha;
        }

        let freeX = Math.max(0, Math.min(window.innerWidth - 1, mouseCursorX));
        let freeY = Math.max(0, Math.min(window.innerHeight - 1, mouseCursorY));

        const now = performance.now();
        const indexPinchRatio = getPinchRatio(lm, 8);
        const closeCandidate = indexPinchRatio <= MOUSE_CONFIG.pinchCloseRatio;
        const openCandidate = indexPinchRatio >= MOUSE_CONFIG.pinchOpenRatio;

        // Keep a fresh hover target every frame. Do not stop updating merely because
        // the fingers have started moving toward a pinch; that was a source of stale/null targets.
        if (!leftPinchActive) {
            const snap = snapPoint(freeX, freeY);
            if (snap.snapped) {
                mouseCursorX += (snap.x - mouseCursorX) * 0.52;
                mouseCursorY += (snap.y - mouseCursorY) * 0.52;
                freeX = Math.max(0, Math.min(window.innerWidth - 1, mouseCursorX));
                freeY = Math.max(0, Math.min(window.innerHeight - 1, mouseCursorY));
            }

            const hoverSnap = snapPoint(freeX, freeY);
            const currentTarget = hoverSnap.target || getTargetElement(freeX, freeY);
            if (currentTarget) {
                lastHoverTarget = currentTarget;
                const r = currentTarget.getBoundingClientRect();
                lastHoverPoint = hoverSnap.snapped
                    ? { x: hoverSnap.x, y: hoverSnap.y }
                    : {
                        x: Math.max(r.left + 1, Math.min(r.right - 1, freeX)),
                        y: Math.max(r.top + 1, Math.min(r.bottom - 1, freeY)),
                    };
            } else if (!closeCandidate) {
                lastHoverTarget = null;
                lastHoverPoint = { x: freeX, y: freeY };
            }
        }

        if (!leftPinchActive) {
            pinchOpenFrames = 0;
            pinchCloseFrames = closeCandidate ? pinchCloseFrames + 1 : 0;

            if (pinchCloseFrames >= MOUSE_CONFIG.pinchStableFrames) {
                leftPinchActive = true;
                pinchCloseFrames = 0;
                pinchOpenFrames = 0;
                pinchStartTime = now;
                clickFiredForCurrentPinch = false;
                dragMouseDownSent = false;

                // Re-resolve once at pinch start, then lock the target and center.
                const currentSnap = snapPoint(freeX, freeY);
                pinchStartTarget = currentSnap.target ||
                    getTargetElement(freeX, freeY) ||
                    lastHoverTarget;

                if (pinchStartTarget) {
                    const r = pinchStartTarget.getBoundingClientRect();
                    pinchStartPos = {
                        x: r.left + r.width / 2,
                        y: r.top + r.height / 2,
                    };
                } else {
                    pinchStartPos = { ...lastHoverPoint };
                }

                pinchLockPoint = { ...pinchStartPos };
                pinchInputAnchor = { x: inputX, y: inputY };
                dragTarget = pinchStartTarget;
                isDragging = false;
                isLeftClickPending = !!pinchStartTarget;

                mouseCursorX = pinchLockPoint.x;
                mouseCursorY = pinchLockPoint.y;
                cursorEl.classList.add('pinching');
            }
        } else {
            pinchCloseFrames = 0;
            pinchOpenFrames = openCandidate ? pinchOpenFrames + 1 : 0;

            const movedPx = Math.hypot(
                inputX - pinchInputAnchor.x,
                inputY - pinchInputAnchor.y
            );
            const heldMs = now - pinchStartTime;

            // Drag wins only if deliberate movement happens before the click fires.
            if (!isDragging && !clickFiredForCurrentPinch &&
                heldMs >= MOUSE_CONFIG.dragArmMs &&
                movedPx >= MOUSE_CONFIG.dragThresholdPx &&
                pinchStartTarget) {
                isDragging = true;
                isLeftClickPending = false;
                dragMouseDownSent = true;
                cursorEl.classList.add('dragging');
                dispatchMouseDown(pinchStartTarget, pinchStartPos.x, pinchStartPos.y, 0);
                mouseCursorX = inputX;
                mouseCursorY = inputY;
            }

            // KEY FIX: fire the click while pinch is held. We no longer depend on the
            // release threshold to make the click happen.
            if (!isDragging && !clickFiredForCurrentPinch &&
                heldMs >= MOUSE_CONFIG.clickTriggerMs &&
                pinchStartTarget) {
                fireLeftClick(pinchStartTarget, pinchStartPos.x, pinchStartPos.y, now);
            }

            if (isDragging) {
                mouseCursorX += (inputX - mouseCursorX) * Math.max(alpha, 0.62);
                mouseCursorY += (inputY - mouseCursorY) * Math.max(alpha, 0.62);
                const dragX = Math.max(0, Math.min(window.innerWidth - 1, mouseCursorX));
                const dragY = Math.max(0, Math.min(window.innerHeight - 1, mouseCursorY));
                const moveTarget = getTargetElement(dragX, dragY) || dragTarget || pinchStartTarget;
                dispatchMouseMove(moveTarget, dragX, dragY, 1);
            } else {
                mouseCursorX = pinchLockPoint.x;
                mouseCursorY = pinchLockPoint.y;
            }

            // Release re-arms the next pinch. If the user made a very quick pinch and
            // released before clickTriggerMs, fire once here as a fallback.
            if (pinchOpenFrames >= MOUSE_CONFIG.releaseStableFrames) {
                if (isDragging && dragMouseDownSent) {
                    const upX = Math.max(0, Math.min(window.innerWidth - 1, mouseCursorX));
                    const upY = Math.max(0, Math.min(window.innerHeight - 1, mouseCursorY));
                    const upTarget = getTargetElement(upX, upY) || dragTarget || pinchStartTarget;
                    dispatchMouseUp(upTarget, upX, upY, 0);
                } else if (!clickFiredForCurrentPinch && pinchStartTarget) {
                    fireLeftClick(pinchStartTarget, pinchStartPos.x, pinchStartPos.y, now);
                }
                resetMousePressState({ release: false });
            }

            // Safety: do not let a noisy detector hold the click latch forever.
            if (leftPinchActive && !isDragging && heldMs > MOUSE_CONFIG.maxClickHoldMs) {
                if (!clickFiredForCurrentPinch && pinchStartTarget) {
                    fireLeftClick(pinchStartTarget, pinchStartPos.x, pinchStartPos.y, now);
                }
                resetMousePressState({ release: false });
            }
        }

        const drawX = Math.max(0, Math.min(window.innerWidth - 1, mouseCursorX));
        const drawY = Math.max(0, Math.min(window.innerHeight - 1, mouseCursorY));
        cursorEl.style.transform =
            `translate3d(${drawX}px, ${drawY}px, 0) translate(-50%, -50%)`;
        cursorEl.style.opacity = '1';
        cursorEl.classList.add('active');

        if (gestureValueEl) {
            if (leftPinchActive && isDragging) {
                gestureValueEl.textContent = `Mouse · DRAG ${indexPinchRatio.toFixed(2)}`;
            } else if (leftPinchActive && clickFiredForCurrentPinch) {
                gestureValueEl.textContent = `Mouse · CLICKED ${indexPinchRatio.toFixed(2)}`;
            } else if (leftPinchActive) {
                gestureValueEl.textContent = `Mouse · PINCH ${indexPinchRatio.toFixed(2)}`;
            } else {
                gestureValueEl.textContent = `Mouse · MOVE ${indexPinchRatio.toFixed(2)}`;
            }
        }

        // Right click: deliberate peace sign OR thumb-middle pinch held briefly.
        const ext = getFingerExtension(lm);
        const [, idxExt, midExt, ringExt, pinkyExt] = ext;
        const strictPeace = idxExt && midExt && !ringExt && !pinkyExt && !leftPinchActive;
        const middlePinchRatio = getPinchRatio(lm, 12);
        const middlePinch =
            middlePinchRatio < (MOUSE_CONFIG.pinchCloseRatio * 1.08) &&
            !leftPinchActive;

        const nearEdge =
            drawY < MOUSE_CONFIG.edgeMargin ||
            drawY > window.innerHeight - MOUSE_CONFIG.edgeMargin ||
            drawX < MOUSE_CONFIG.edgeMargin ||
            drawX > window.innerWidth - MOUSE_CONFIG.edgeMargin;

        const shouldRightClick = strictPeace || middlePinch;
        if (shouldRightClick && !nearEdge && now >= rightClickCooldown) {
            if (!wasPeaceSign) {
                wasPeaceSign = true;
                peaceStartTime = now;
            } else if (now - peaceStartTime >= MOUSE_CONFIG.rightClickHoldMs) {
                const snap = snapPoint(drawX, drawY);
                const rx = snap.snapped ? snap.x : drawX;
                const ry = snap.snapped ? snap.y : drawY;
                const target = snap.target || getTargetElement(rx, ry);
                if (target) {
                    dispatchContextMenu(target, rx, ry);
                    showToast('Right click', 420);
                }
                rightClickCooldown = now + MOUSE_CONFIG.rightClickCooldownMs;
                wasPeaceSign = false;
                peaceStartTime = 0;
            }
        } else if (!shouldRightClick) {
            wasPeaceSign = false;
            peaceStartTime = 0;
        }
    }

    // Main detection loop.
    let frameCount = 0, lastFpsTime = performance.now();
    let lastVideoTime = -1;
    let primaryLandmarks = null;
    let gestureBuffer = [];
    const BUFFER_SIZE = 5;

    async function processFrame() {
        if (video.readyState < 2) {
            requestAnimationFrame(processFrame);
            return;
        }

        // Render raw camera fallback if the model is unavailable.
        if (!landmarker) {
            const rect = clearPipCanvas();
            if (rect && pipVideo.readyState >= 2) {
                drawConvexCameraFrame(getPipVideoBox());
            }
            requestAnimationFrame(processFrame);
            return;
        }

        // Only process a new camera frame.
        if (video.currentTime === lastVideoTime) {
            requestAnimationFrame(processFrame);
            return;
        }
        lastVideoTime = video.currentTime;

        const res = landmarker.detectForVideo(video, performance.now());
        const hands = res?.landmarks || [];
        const handCount = hands.length;

        drawLandmarksOnPip(hands);
        if (handCountValue) handCountValue.textContent = String(handCount);

        // ─────────────────────────────────────────────────────────────────────
        // MODE 1: AIR MOUSE
        // Presentation gesture classification is NOT evaluated in this branch.
        // ─────────────────────────────────────────────────────────────────────
        if (mouseEnabled) {
            if (handCount > 0) {
                updateMouse(hands);
            } else {
                cursorEl.style.opacity = '0.25';
                resetMousePressState({ release: true });
                wasPeaceSign = false;
                peaceStartTime = 0;
                lastTrackedMouseTip = null;
                lastMouseTip = null;
            }

            zoomActive = false;
            zoomStableCount = 0;
            gestureBuffer = [];
            handHistory = [];
            lastGesture = 'none';
            primaryLandmarks = null;
            isDrawing = false;
            laserDot.classList.remove('active', 'highlighter');

            if (gestureCooldown > 0) gestureCooldown--;
            frameCount++;
            const mouseNow = performance.now();
            if (mouseNow - lastFpsTime >= 500) {
                const fps = Math.round(frameCount / ((mouseNow - lastFpsTime) / 1000));
                frameCount = 0;
                lastFpsTime = mouseNow;
                fpsEl.textContent = `FPS: ${fps}`;
                if (fpsMetric) fpsMetric.textContent = `${fps} fps`;
            }

            requestAnimationFrame(processFrame);
            return;
        }

        // ─────────────────────────────────────────────────────────────────────
        // MODE 2: PRESENTATION GESTURES
        // Air-mouse click/drag/right-click logic is never evaluated here.
        // ─────────────────────────────────────────────────────────────────────
        cursorEl.classList.remove('active', 'pinching', 'dragging', 'right-click');
        cursorEl.style.opacity = '0';

        const zoomAllowed = !highlighterMode;

        if (zoomAllowed && handCount === 2) {
            zoomStableCount = Math.min(
                zoomStableCount + 1,
                ZOOM_STABLE_FRAMES + 1
            );
        } else {
            zoomStableCount = Math.max(zoomStableCount - 1, 0);
        }

        if (zoomStableCount >= ZOOM_STABLE_FRAMES &&
            zoomAllowed &&
            handCount === 2) {
            const c1 = getHandCenter(hands[0]);
            const c2 = getHandCenter(hands[1]);
            const dist = Math.hypot(c1.x - c2.x, c1.y - c2.y);

            if (!zoomActive) {
                zoomActive = true;
                baseDist = dist;
                baseZoom = currentZoom;
            } else if (baseDist > 1e-6) {
                const ratio = dist / baseDist;
                currentZoom = Math.min(3.0, Math.max(0.3, baseZoom * ratio));
                applyZoom(currentZoom);
            }

            handHistory = [];
            gestureBuffer = [];

            if (laserActive && hands.length > 0) {
                updateLaser(hands[0]);
            }
        } else {
            if (zoomActive) zoomActive = false;

            // One-hand presentation gestures. With two hands, the two-hand zoom branch
            // owns the frame; this prevents a second hand from accidentally navigating.
            if (handCount !== 2) {
                const primaryHand = handCount > 0 ? hands[0] : null;
                primaryLandmarks = primaryHand;

                if (primaryHand) {
                    const gesture = recognizeGesture(primaryHand);
                    const center = getHandCenter(primaryHand);

                    handHistory.push(center);
                    if (handHistory.length > HISTORY_LENGTH) handHistory.shift();

                    let swipe = null;
                    if (!highlighterMode && handHistory.length >= HISTORY_LENGTH) {
                        swipe = detectSwipe(handHistory);
                    }

                    gestureBuffer.push(swipe || gesture);
                    if (gestureBuffer.length > BUFFER_SIZE) gestureBuffer.shift();

                    const counts = {};
                    for (const g of gestureBuffer) {
                        if (g && g !== 'none') {
                            counts[g] = (counts[g] || 0) + 1;
                        }
                    }

                    let bestGesture = 'none';
                    let bestCount = 0;
                    for (const [g, count] of Object.entries(counts)) {
                        if (count > bestCount) {
                            bestCount = count;
                            bestGesture = g;
                        }
                    }

                    if (bestCount >= CONFIDENCE_THRESHOLD &&
                        bestGesture !== 'none') {
                        dispatchAction(bestGesture, primaryHand);
                        gestureBuffer = [];
                    }

                    if (laserActive) {
                        updateLaser(primaryHand);
                    } else {
                        isDrawing = false;
                        laserDot.classList.remove('active');
                    }
                } else {
                    if (laserActive) {
                        laserDot.classList.remove('active');
                        isDrawing = false;
                    }
                    gestureBuffer = [];
                    handHistory = [];
                }
            }
        }

        if (gestureCooldown > 0) gestureCooldown--;
        if (!gestureMetric?.textContent || gestureMetric.textContent === 'none') {
            updateConfidence(0);
        }

        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 500) {
            const fps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
            frameCount = 0;
            lastFpsTime = now;
            fpsEl.textContent = `FPS: ${fps}`;
            if (fpsMetric) fpsMetric.textContent = `${fps} fps`;
        }

        requestAnimationFrame(processFrame);
    }


    // Workspace presentation helpers.
    function currentSlidePosition() {
        if (isPdfLoaded && pdfDoc) {
            return {
                index: currentPage,
                total: totalPages,
                label: 'Page'
            };
        }

        return {
            index: defaultIndex,
            total: defaultSlides.length,
            label: 'Slide'
        };
    }

    function updateDeckUI(sourceName = null) {
        const position = currentSlidePosition();
        const page = position.index + 1;
        const total = Math.max(1, position.total);
        const progress = Math.max(0, Math.min(100, Math.round((page / total) * 100)));

        const isPdf = isPdfLoaded && pdfDoc;
        const fallbackName = 'Velos';
        const knownName = sourceName || deckTitleTop?.dataset.fileName || fallbackName;
        const deckName = isPdf ? knownName : fallbackName;

        if (sourceName && deckTitleTop) {
            deckTitleTop.dataset.fileName = sourceName;
        }

        if (deckTitleTop) deckTitleTop.textContent = deckName;
        if (deckTitleSide) deckTitleSide.textContent = deckName;
        if (footerDeckName) footerDeckName.textContent = deckName;
        if (stageTitle) stageTitle.textContent = deckName;

        if (deckMetaTop) {
            deckMetaTop.textContent = isPdf
                ? `${total} PDF pages · local file`
                : `${total} built-in slides · ready to present`;
        }

        if (deckMetaSide) {
            deckMetaSide.textContent = isPdf
                ? 'Local PDF presentation'
                : 'Built-in presentation';
        }

        if (deckTypeLabel) deckTypeLabel.textContent = isPdf ? 'PDF' : 'Demo';
        if (leftPanelMeta) leftPanelMeta.textContent = `${total} ${isPdf ? 'pages' : 'slides'}`;
        if (settingsDeckPages) settingsDeckPages.textContent = String(total);
        if (settingsDeckSource) {
            settingsDeckSource.textContent = isPdf
                ? 'Local PDF loaded from this device.'
                : 'Built-in demonstration slides.';
        }

        if (deckProgress) deckProgress.style.width = `${progress}%`;
        if (deckProgressText) deckProgressText.textContent = `${progress}%`;
        if (footerPage) footerPage.textContent = `${position.label} ${page} of ${total}`;
        if (stageMeta) stageMeta.textContent = `${position.label} ${page} of ${total} · gesture input ${gestureNavigationEnabled ? 'enabled' : 'paused'}`;
    }

    function syncToolStates() {
        const laserOn = !!laserActive;
        const highlightOn = !!highlighterMode;
        const mouseOn = !!mouseEnabled;
        const autoOn = !!autoPlay;

        laserBtn?.classList.toggle('active', laserOn);
        highlightBtn?.classList.toggle('active', highlightOn);
        mouseToggleBtn?.classList.toggle('active', mouseOn);
        mouseToggleBtn?.classList.toggle('mouse-on', mouseOn);
        autoBtn?.classList.toggle('active', autoOn);

        laserToolBtn?.classList.toggle('active', laserOn);
        highlightToolBtn?.classList.toggle('active', highlightOn);
        mouseToolBtn?.classList.toggle('active', mouseOn);
        mouseToolBtn?.classList.toggle('mouse-on', mouseOn);
        autoToolBtn?.classList.toggle('active', autoOn);

        if (laserToolState) laserToolState.textContent = laserOn ? 'On' : 'Off';
        if (highlightToolState) highlightToolState.textContent = highlightOn ? 'On' : 'Off';
        if (mouseToolState) mouseToolState.textContent = mouseOn ? 'On' : 'Off';
        if (autoToolState) autoToolState.textContent = autoOn ? 'On' : 'Off';

        if (workspaceMode) {
            workspaceMode.textContent = mouseOn
                ? 'Air mouse'
                : highlightOn
                    ? 'Highlight'
                    : laserOn
                        ? 'Laser'
                        : 'Gesture';
        }

        if (modeBadge) {
            modeBadge.textContent = mouseOn
                ? 'Air mouse mode'
                : highlightOn
                    ? 'Highlight mode'
                    : laserOn
                        ? 'Laser mode'
                        : gestureNavigationEnabled
                            ? 'Gesture mode'
                            : 'Manual mode';
        }
    }

    function updateConfidence(value) {
        const clamped = Math.max(0, Math.min(100, Number(value) || 0));
        if (confidenceBar) confidenceBar.style.width = `${clamped}%`;
        if (confidenceValue) confidenceValue.textContent = `${Math.round(clamped)}%`;
    }

    function setCameraState(label, state = 'busy') {
        if (cameraState) cameraState.textContent = `Camera ${label.toLowerCase()}`;
        if (cameraFooterState) cameraFooterState.textContent = label === 'Ready' ? 'Tracking available' : label;
        if (cameraLiveText) cameraLiveText.textContent = label === 'Ready' ? 'LIVE' : label.toUpperCase();
        if (cameraBadgeText) cameraBadgeText.textContent = label === 'Ready' ? 'Camera ready' : `Camera ${label.toLowerCase()}`;

        [cameraStateDot, cameraLiveDot, cameraBadgeDot].forEach(dot => {
            if (!dot) return;
            dot.classList.remove('online', 'busy', 'offline');
            dot.classList.add(state);
        });
    }

    function setModelState(label) {
        if (modelState) modelState.textContent = label;
        if (modelStateMini) modelStateMini.textContent = label;
        if (settingsModelState) settingsModelState.textContent = label;
    }

    function openSettings() {
        settingsDrawer?.classList.add('show');
        backdrop?.classList.add('show');
    }

    function closeSettings() {
        settingsDrawer?.classList.remove('show');
        if (!shortcutsModal?.classList.contains('show')) {
            backdrop?.classList.remove('show');
        }
    }

    function openShortcuts() {
        shortcutsModal?.classList.add('show');
        backdrop?.classList.add('show');
    }

    function closeShortcuts() {
        shortcutsModal?.classList.remove('show');
        if (!settingsDrawer?.classList.contains('show')) {
            backdrop?.classList.remove('show');
        }
    }

    function toggleShortcuts() {
        if (shortcutsModal?.classList.contains('show')) {
            closeShortcuts();
        } else {
            openShortcuts();
        }
    }

    function closeOverlays() {
        closeSettings();
        closeShortcuts();
    }

    function setTheme(theme) {
        const next = theme === 'light' ? 'light' : 'dark';
        document.body.dataset.theme = next;
        if (themeSelect) themeSelect.value = next;
        try {
            localStorage.setItem('velos-theme', next);
        } catch (_) {}
    }

    function toggleTheme() {
        const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
        setTheme(next);
        showToast(next === 'light' ? 'Light workspace' : 'Dark studio');
    }

    function setCameraPreviewVisible(visible) {
        document.body.classList.toggle('pip-hidden', !visible);
        if (cameraPreviewSwitch) cameraPreviewSwitch.checked = visible;
        if (drawerCameraSwitch) drawerCameraSwitch.checked = visible;
    }

    function setAutoHidePanels(enabled) {
        autoHidePanels = !!enabled;
        if (autoHideSwitch) autoHideSwitch.checked = autoHidePanels;
        if (drawerAutoHideSwitch) drawerAutoHideSwitch.checked = autoHidePanels;
    }

    function updateClockAndSession() {
        const now = new Date();
        const elapsed = Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000));
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;

        if (sessionElapsed) {
            sessionElapsed.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        if (liveClock) {
            liveClock.textContent = now.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    function loadSavedPreferences() {
        try {
            const savedTheme = localStorage.getItem('gestureflow-theme');
            if (savedTheme === 'light' || savedTheme === 'dark') {
                setTheme(savedTheme);
            }
        } catch (_) {}
    }

    function handleFullscreenChange() {
        if (!document.fullscreenElement || !autoHidePanels) return;
        document.body.classList.add('panel-collapsed-left', 'panel-collapsed-right');
        sidebarToggle?.classList.remove('active');
        inspectorToggle?.classList.remove('active');
    }

    // Core presenter events.
    prevBtn.addEventListener('click', prevSlide);
    nextBtn.addEventListener('click', nextSlide);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    autoBtn.addEventListener('click', toggleAutoPlay);
    highlightBtn.addEventListener('click', toggleHighlighter);
    resetZoomBtn.addEventListener('click', resetZoom);


    fitBtn?.addEventListener('click', resetZoom);
    clearInkBtn?.addEventListener('click', () => {
        clearDrawCanvas();
        showToast('Annotations cleared');
    });

    laserToolBtn?.addEventListener('click', () => laserBtn.click());
    highlightToolBtn?.addEventListener('click', () => highlightBtn.click());
    mouseToolBtn?.addEventListener('click', () => mouseToggleBtn.click());
    autoToolBtn?.addEventListener('click', () => autoBtn.click());

    sidebarToggle?.addEventListener('click', () => {
        const collapsed = document.body.classList.toggle('panel-collapsed-left');
        sidebarToggle.classList.toggle('active', !collapsed);
        setTimeout(resizeDrawCanvas, 220);
    });

    inspectorToggle?.addEventListener('click', () => {
        const collapsed = document.body.classList.toggle('panel-collapsed-right');
        inspectorToggle.classList.toggle('active', !collapsed);
        setTimeout(() => {
            resizePipOverlay();
            resizeDrawCanvas();
        }, 220);
    });

    settingsBtn?.addEventListener('click', openSettings);
    shortcutsBtn?.addEventListener('click', openShortcuts);
    closeSettingsBtn?.addEventListener('click', closeSettings);
    closeShortcutsBtn?.addEventListener('click', closeShortcuts);
    backdrop?.addEventListener('click', closeOverlays);
    themeBtn?.addEventListener('click', toggleTheme);

    themeSelect?.addEventListener('change', e => setTheme(e.target.value));

    compactSwitch?.addEventListener('change', e => {
        document.body.classList.toggle('compact-mode', e.target.checked);
        setTimeout(resizeDrawCanvas, 100);
    });

    reducedMotionSwitch?.addEventListener('change', e => {
        document.body.classList.toggle('reduced-motion', e.target.checked);
    });

    gestureModeSwitch?.addEventListener('change', e => {
        gestureNavigationEnabled = e.target.checked;
        if (!gestureNavigationEnabled) {
            gestureBuffer = [];
            handHistory = [];
        }
        updateDeckUI();
        syncToolStates();
        showToast(gestureNavigationEnabled ? 'Gesture navigation enabled' : 'Gesture navigation paused');
    });

    cameraPreviewSwitch?.addEventListener('change', e => {
        setCameraPreviewVisible(e.target.checked);
    });

    drawerCameraSwitch?.addEventListener('change', e => {
        setCameraPreviewVisible(e.target.checked);
    });

    autoHideSwitch?.addEventListener('change', e => {
        setAutoHidePanels(e.target.checked);
    });

    drawerAutoHideSwitch?.addEventListener('change', e => {
        setAutoHidePanels(e.target.checked);
    });

    pipToggleBtn?.addEventListener('click', () => {
        setCameraPreviewVisible(false);
        showToast('Camera preview hidden');
    });

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    mouseToggleBtn.addEventListener('click', () => {
        mouseEnabled = !mouseEnabled;
        mouseToggleBtn.classList.toggle('active', mouseEnabled);
        mouseToggleBtn.classList.toggle('mouse-on', mouseEnabled);

        if (!mouseEnabled) {
            resetAirMouseTracking({ hideCursor: true, release: true });
            document.body.classList.remove('hand-cursor-active');
        } else {
            resetAirMouseTracking({ hideCursor: false, release: false });
            document.body.classList.add('hand-cursor-active');

            // Mouse mode owns the hand-tracking pipeline. Presentation gestures/tools
            // are ignored until mouse mode is turned off again.
            isDrawing = false;
            laserActive = false;
            highlighterMode = false;
            laserDot.classList.remove('active', 'highlighter');
            handHistory = [];
            gestureBuffer = [];
            zoomActive = false;
            zoomStableCount = 0;
            lastGesture = 'none';
        }

        showToast(mouseEnabled
            ? 'Air mouse ON · presentation gestures locked · pinch and hold briefly to click'
            : 'Air mouse OFF · presentation gestures available');
        syncToolStates();
    });

    laserBtn.addEventListener('click', () => {
        if (mouseEnabled) { showToast('Mouse mode active – laser disabled'); return; }
        laserActive = !laserActive;
        if (!laserActive) { laserDot.classList.remove('active'); isDrawing = false; }
        showToast(laserActive ? 'Laser on' : 'Laser off');
        syncToolStates();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            await loadPDF(file);
        } catch (err) {
            showToast('❌ Error loading PDF: ' + err.message, 2000);
            console.error(err);
        }
        fileInput.value = '';
    });

    document.addEventListener('keydown', (e) => {
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

        if (key === 'ArrowRight') nextSlide();
        if (key === 'ArrowLeft') prevSlide();
        if (key === 'f') toggleFullscreen();
        if (key === 'a') toggleAutoPlay();
        if (key === 'h') toggleHighlighter();
        if (key === 'm') mouseToggleBtn.click();
        if (key === 'l') laserBtn.click();
        if (key === 'r') resetZoom();
        if (key === 'c') clearDrawCanvas();
        if (key === '?') toggleShortcuts();
        if (key === 'escape') closeOverlays();
    });

    // Camera and model initialization.
    async function initModel() {
        const fileset = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        landmarker = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU"
            },
            numHands: 2,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.55,
            runningMode: "VIDEO"
        });
        console.log('MediaPipe HandLandmarker ready');
        setModelState('Ready');
    }

    async function initCam() {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                aspectRatio: { ideal: 16 / 9 },
                frameRate: { ideal: 30, max: 60 },
                facingMode: "user"
            },
            audio: false
        });

        const track = stream.getVideoTracks()[0];

        // Use the widest REAL field of view the camera exposes. A software lens effect
        // cannot see outside the sensor, so hardware/digital zoom is forced to minimum
        // when the browser exposes that capability.
        try {
            const caps = track.getCapabilities?.() || {};
            if (caps.zoom &&
                Number.isFinite(caps.zoom.min) &&
                Number.isFinite(caps.zoom.max)) {
                await track.applyConstraints({
                    advanced: [{ zoom: caps.zoom.min }]
                });
            }
        } catch (zoomErr) {
            console.debug('Minimum camera zoom not available:', zoomErr);
        }

        video.srcObject = stream;
        pipVideo.srcObject = stream;

        await Promise.all([video.play(), pipVideo.play()]);

        const settings = track.getSettings?.() || {};
        const actualW = settings.width || video.videoWidth || 1280;
        const actualH = settings.height || video.videoHeight || 720;

        if (cameraResolutionLabel) {
            cameraResolutionLabel.textContent = `${actualW} × ${actualH}`;
        }
        if (cameraDeviceLabel && track.label) {
            cameraDeviceLabel.textContent = track.label;
        }
        if (cameraFooterState) {
            cameraFooterState.textContent =
                'Full frame · widest available view · convex preview';
        }

        resizePipOverlay();
        setCameraState('Ready', 'online');
    }

    const resizeObserver = new ResizeObserver(() => {
        resizePipOverlay();
    });
    const pipWrapper = document.getElementById('pip-wrapper');
    if (pipWrapper) resizeObserver.observe(pipWrapper);


    loadSavedPreferences();
    setCameraState('Starting', 'busy');
    setModelState('Loading');
    setCameraPreviewVisible(true);
    setAutoHidePanels(false);
    updateDeckUI();
    syncToolStates();
    updateClockAndSession();
    setInterval(updateClockAndSession, 1000);

    // Start the presenter runtime.
    (async () => {
        try {
            // Start camera first
            await initCam();
            showToast('Camera ready', 1200);
        } catch (camErr) {
            setCameraState('Unavailable', 'offline');
            showError('Camera error: ' + camErr.message);
            console.error(camErr);
            return; // Stop if camera fails
        }

        try {
            await initModel();
            showToast('Hand tracking ready', 1200);
        } catch (modelErr) {
            setModelState('Unavailable');
            showError('Hand model failed; camera preview is still available.');
            console.error(modelErr);
            // Continue with camera only
        }

        try {
            showSlide(0);
            processFrame();
            setTimeout(resizeDrawCanvas, 50);
            setTimeout(resizePipOverlay, 50);
            if (landmarker) {
                showToast('Presenter ready · press M for air mouse', 2400);
            } else {
                showToast('Camera ready · hand tracking unavailable', 2800);
            }
        } catch (renderErr) {
            showError('❌ Rendering error: ' + renderErr.message);
            console.error(renderErr);
        }
    })();
