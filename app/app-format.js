import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/*
 * Velos Gesture Presentation - Fresh Stable Build
 * ------------------------------------------------
 * Main goals:
 * - no overlapping / stuck MediaPipe detection loop
 * - inference throttled to a sane FPS
 * - lightweight camera preview
 * - lazy PDF rendering with a small LRU cache
 * - no mutation-observer feedback loop on style/class changes
 * - no dangling advanced/training variables from merged builds
 * - same core features: PDF, screen share, zoom/pan, gestures,
 *   fist drag/pan, laser/highlighter, air mouse, fullscreen, UI controls
 */

(() => {
    "use strict";

    // ============================================================
    // CONFIG
    // ============================================================

    const CONFIG = Object.freeze({
        camera: {
            width: 960,
            height: 540,
            fps: 30
        },

        performance: {
            inferenceFps: 24,
            previewFps: 24,
            maxCanvasDpr: 1.5,
            errorLogCooldownMs: 1500
        },

        pdf: {
            maxPixelsPerPage: 3_000_000,
            maxCachePages: 5,
            prefetchDelayMs: 180
        },

        zoom: {
            min: 0.3,
            max: 3.0,
            stableFrames: 4
        },

        pan: {
            minZoom: 1.01,
            handGain: 1.0,
            pointerGain: 1.0,
            keyboardStepPx: 80,
            edgeGuardPx: 18,
            lostHandReleaseMs: 300,
            releaseStableFrames: 2
        },

        gesture: {
            bufferSize: 5,
            confidenceFrames: 3,
            swipeHistory: 8,
            swipeThreshold: 0.06,
            actionCooldownMs: 550,
            postManipulationLockMs: 1600,
            shakaHoldMs: 1000,
            shakaBreakGraceMs: 160
        },

        mouse: {
            xMin: 0.075,
            xMax: 0.925,
            yMin: 0.065,
            yMax: 0.93,

            smoothingMin: 0.30,
            smoothingMax: 0.76,
            speedForMaxSmoothing: 0.045,
            deadzone: 0.0025,

            pinchCloseRatio: 0.56,
            pinchOpenRatio: 0.64,
            pinchStableFrames: 2,
            releaseStableFrames: 2,

            clickTriggerMs: 145,
            clickCooldownMs: 165,
            maxClickHoldMs: 1500,

            dragThresholdPx: 38,
            dragArmMs: 105,

            doubleClickInterval: 460,
            doubleClickDistancePx: 34,

            snapRadiusPx: 48,
            snapInsidePadPx: 10,

            hitCacheMs: 600,
            targetLookupMs: 55,

            rightClickHoldMs: 480,
            rightClickCooldownMs: 850,

            edgeMargin: 12
        }
    });

    const MEDIAPIPE_WASM_URL =
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

    const HAND_MODEL_URL =
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

    const PDF_WORKER_URL =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


    // ============================================================
    // DOM CACHE
    // ============================================================

    let E = {};
    let pipCtx = null;
    let drawCtx = null;
    let stageCanvas = null;

    const $ = (id) => document.getElementById(id);


    function cacheDom() {
        E = {
            video: $("cam"),
            pipVideo: $("pip-video"),
            pipOverlay: $("pip-overlay"),
            pipWrapper: $("pip-wrapper"),

            slideNum: $("slideNum"),
            slideContent: $("slideContent"),
            slideCard: $("slideCard"),

            laserDot: $("laserDot"),
            zoomIndicator: $("zoomIndicator"),
            gestureStatus: $("gestureStatus"),
            toast: $("toast"),
            fpsEl: $("fps"),

            prevBtn: $("prevBtn"),
            nextBtn: $("nextBtn"),
            fullscreenBtn: $("fullscreenBtn"),
            autoBtn: $("autoBtn"),
            highlightBtn: $("highlightBtn"),
            mouseToggleBtn: $("mouseToggleBtn"),
            laserBtn: $("laserBtn"),
            resetZoomBtn: $("resetZoomBtn"),

            fileInput: $("fileInput"),
            drawCanvas: $("drawCanvas"),

            fingerCountEl: $("finger-count"),
            fingerCountNum: $("fingerCountNum"),

            cursorEl: $("hand-cursor"),
            gestureValueEl: $("gestureValue"),
            errorBox: $("errorBox"),

            deckTitleTop: $("deckTitleTop"),
            deckMetaTop: $("deckMetaTop"),
            deckTitleSide: $("deckTitleSide"),
            deckMetaSide: $("deckMetaSide"),
            deckTypeLabel: $("deckTypeLabel"),
            deckProgress: $("deckProgress"),
            deckProgressText: $("deckProgressText"),
            leftPanelMeta: $("leftPanelMeta"),

            stageTitle: $("stageTitle"),
            stageMeta: $("stageMeta"),

            footerDeckName: $("footerDeckName"),
            footerPage: $("footerPage"),

            workspaceMode: $("workspaceMode"),
            handCountValue: $("handCountValue"),
            fpsMetric: $("fpsMetric"),
            zoomMetric: $("zoomMetric"),
            gestureMetric: $("gestureMetric"),

            confidenceBar: $("confidenceBar"),
            confidenceValue: $("confidenceValue"),

            sessionElapsed: $("sessionElapsed"),
            liveClock: $("liveClock"),

            modelState: $("modelState"),
            modelStateMini: $("modelStateMini"),
            settingsModelState: $("settingsModelState"),

            cameraState: $("cameraState"),
            cameraStateDot: $("cameraStateDot"),
            cameraLiveDot: $("cameraLiveDot"),
            cameraLiveText: $("cameraLiveText"),
            cameraBadgeDot: $("cameraBadgeDot"),
            cameraBadgeText: $("cameraBadgeText"),

            modeBadge: $("modeBadge"),

            deckStatusDot: $("deckStatusDot"),
            stageStatusDot: $("stageStatusDot"),

            settingsDeckSource: $("settingsDeckSource"),
            settingsDeckPages: $("settingsDeckPages"),

            cameraFooterState: $("cameraFooterState"),
            cameraResolutionLabel: $("cameraResolutionLabel"),
            cameraDeviceLabel: $("cameraDeviceLabel"),

            inspectorMeta: $("inspectorMeta"),

            sidebarToggle: $("sidebarToggle"),
            inspectorToggle: $("inspectorToggle"),
            settingsBtn: $("settingsBtn"),
            shortcutsBtn: $("shortcutsBtn"),
            themeBtn: $("themeBtn"),
            fitBtn: $("fitBtn"),
            clearInkBtn: $("clearInkBtn"),
            pipToggleBtn: $("pipToggleBtn"),

            settingsDrawer: $("settingsDrawer"),
            shortcutsModal: $("shortcutsModal"),
            closeSettingsBtn: $("closeSettingsBtn"),
            closeShortcutsBtn: $("closeShortcutsBtn"),
            backdrop: $("backdrop"),

            themeSelect: $("themeSelect"),
            compactSwitch: $("compactSwitch"),
            reducedMotionSwitch: $("reducedMotionSwitch"),
            gestureModeSwitch: $("gestureModeSwitch"),
            cameraPreviewSwitch: $("cameraPreviewSwitch"),
            autoHideSwitch: $("autoHideSwitch"),
            drawerAutoHideSwitch: $("drawerAutoHideSwitch"),
            drawerCameraSwitch: $("drawerCameraSwitch"),

            laserToolBtn: $("laserToolBtn"),
            highlightToolBtn: $("highlightToolBtn"),
            mouseToolBtn: $("mouseToolBtn"),
            autoToolBtn: $("autoToolBtn"),

            laserToolState: $("laserToolState"),
            highlightToolState: $("highlightToolState"),
            mouseToolState: $("mouseToolState"),
            autoToolState: $("autoToolState")
        };


        stageCanvas =
            E.slideCard?.closest?.(".stage-canvas") ||
            E.slideCard?.parentElement ||
            null;


        pipCtx =
            E.pipOverlay?.getContext?.(
                "2d",
                {
                    alpha: true
                }
            ) ||
            null;


        drawCtx =
            E.drawCanvas?.getContext?.(
                "2d",
                {
                    alpha: true
                }
            ) ||
            null;


        if (E.slideCard) {
            E.slideCard.style.willChange =
                "transform";

            E.slideCard.style.transformOrigin =
                "50% 50%";

            E.slideCard.style.touchAction =
                "none";
        }


        if (stageCanvas) {
            stageCanvas.style.overflow =
                "hidden";
        }


        if (E.drawCanvas) {
            E.drawCanvas.style.pointerEvents =
                "none";
        }
    }


    function ensureScreenShareButton() {
        let btn =
            $("screenShareBtn");


        if (btn) {
            E.screenShareBtn =
                btn;

            return;
        }


        btn =
            document.createElement(
                "button"
            );


        btn.id =
            "screenShareBtn";

        btn.type =
            "button";

        btn.title =
            "Share your screen live";

        btn.textContent =
            "🖥 Share Screen";


        const styleSource =
            E.fullscreenBtn ||
            E.nextBtn ||
            E.prevBtn;


        if (styleSource?.className) {
            btn.className =
                styleSource.className;
        }


        if (E.fullscreenBtn?.parentElement) {
            E.fullscreenBtn.insertAdjacentElement(
                "afterend",
                btn
            );

        } else if (E.fileInput?.parentElement) {
            E.fileInput.parentElement.appendChild(
                btn
            );

        } else {
            document.body.appendChild(
                btn
            );
        }


        E.screenShareBtn =
            btn;
    }


    // ============================================================
    // LIGHTWEIGHT HOST GUARDS
    // ============================================================

    const HOST_HIDE_SELECTORS = [
        '[data-testid="accounts-profile-button"]',
        '[data-testid="conversation-options-button"]',
        "#modal-account-payment",
        ".data-prompt-textarea-header aside",
        'a[href="/library"]',
        'a[href="/admin"]',
        'a[href="/apps"]',
        'a[href="/c/mustbe_hidden_pin"]',
        'a[href="/deep-research"]'
    ];


    const HOST_BLOCKED_TEXT =
        new Set([
            "Report conversation",
            "This is a copy of a shared ChatGPT conversation",
            "Messages beyond this point are only visible to you",
            "Archive",
            "Start a group chat",
            "Invite team members"
        ]);


    let hostCleanupTimer =
        null;

    let hostObserver =
        null;

    let bodyAttrObserver =
        null;


    function installHostGuards() {
        const style =
            document.createElement(
                "style"
            );


        style.id =
            "velos-host-guard-style";


        style.textContent =
            `${HOST_HIDE_SELECTORS.join(",")} { display:none !important; }`;


        document.head.appendChild(
            style
        );


        document.body.addEventListener(
            "click",
            (event) => {
                const link =
                    event.target.closest?.(
                        "a"
                    );


                if (
                    !link ||
                    event.target.closest?.(
                        "button"
                    )
                ) {
                    return;
                }


                const href =
                    link.getAttribute(
                        "href"
                    );


                const match =
                    href?.match?.(
                        /^\/c\/([^/]+)\/share\/([^/]+)$/
                    );


                if (!match) {
                    return;
                }


                event.preventDefault();


                window.location.href =
                    `/share/${match[2]}?c=${match[1]}`;
            }
        );


        window.addEventListener(
            "hashchange",
            (event) => {
                if (
                    location.hash ===
                        "#settings" ||

                    location.hash ===
                        "#pricing"
                ) {
                    event.preventDefault();


                    history.replaceState(
                        null,
                        "",
                        location.pathname +
                            location.search
                    );
                }
            },
            true
        );


        const processAddedRoot =
            (root) => {

                if (
                    !(
                        root instanceof
                        Element
                    )
                ) {
                    return;
                }


                if (
                    root.matches?.(
                        "style[data-radix-scroll-prevent-default]"
                    )
                ) {
                    root.remove();

                    return;
                }


                const nestedRadixStyles =
                    root.querySelectorAll?.(
                        "style[data-radix-scroll-prevent-default]"
                    );


                nestedRadixStyles?.forEach(
                    (el) =>
                        el.remove()
                );


                const candidates =
                    [];


                if (
                    root.matches?.(
                        "button,a,[role='menuitem'],span,p"
                    )
                ) {
                    candidates.push(
                        root
                    );
                }


                root.querySelectorAll?.(
                    "button,a,[role='menuitem'],span,p"
                )?.forEach(
                    (el, index) => {
                        if (
                            index <
                            250
                        ) {
                            candidates.push(
                                el
                            );
                        }
                    }
                );


                for (
                    const el
                    of candidates
                ) {
                    if (
                        el.childElementCount >
                        0
                    ) {
                        continue;
                    }


                    const text =
                        el.textContent?.trim?.();


                    if (
                        HOST_BLOCKED_TEXT.has(
                            text
                        )
                    ) {
                        el.style.setProperty(
                            "display",
                            "none",
                            "important"
                        );
                    }
                }
            };


        const scheduleHostCleanup =
            (nodes = []) => {

                if (
                    hostCleanupTimer
                ) {
                    return;
                }


                hostCleanupTimer =
                    setTimeout(
                        () => {
                            hostCleanupTimer =
                                null;


                            document.body.removeAttribute(
                                "data-scroll-locked"
                            );


                            document.documentElement.removeAttribute(
                                "data-scroll-locked"
                            );


                            $("__next")?.removeAttribute(
                                "aria-hidden"
                            );


                            document
                                .querySelectorAll(
                                    "style[data-radix-scroll-prevent-default]"
                                )
                                .forEach(
                                    (el) =>
                                        el.remove()
                                );


                            const dynamicModal =
                                document.querySelector(
                                    '#pricing,[id*="pricing"],[class*="modal-pricing"]'
                                );


                            dynamicModal?.remove?.();


                            for (
                                const node
                                of nodes
                            ) {
                                processAddedRoot(
                                    node
                                );
                            }


                            invalidateHitCache();

                        },
                        80
                    );
            };


        hostObserver =
            new MutationObserver(
                (mutations) => {
                    const added =
                        [];


                    for (
                        const mutation
                        of mutations
                    ) {
                        if (
                            mutation.type !==
                            "childList"
                        ) {
                            continue;
                        }


                        for (
                            const node
                            of mutation.addedNodes
                        ) {
                            if (
                                node.nodeType ===
                                    1 &&

                                added.length <
                                    20
                            ) {
                                added.push(
                                    node
                                );
                            }
                        }
                    }


                    if (
                        added.length
                    ) {
                        scheduleHostCleanup(
                            added
                        );
                    }
                }
            );


        hostObserver.observe(
            document.documentElement,
            {
                childList: true,
                subtree: true
            }
        );


        bodyAttrObserver =
            new MutationObserver(
                () => {
                    document.body.removeAttribute(
                        "data-scroll-locked"
                    );


                    $("__next")?.removeAttribute(
                        "aria-hidden"
                    );
                }
            );


        bodyAttrObserver.observe(
            document.body,
            {
                attributes: true,
                attributeFilter: [
                    "data-scroll-locked"
                ]
            }
        );


        const nextRoot =
            $("__next");


        if (nextRoot) {
            bodyAttrObserver.observe(
                nextRoot,
                {
                    attributes: true,
                    attributeFilter: [
                        "aria-hidden"
                    ]
                }
            );
        }


        scheduleHostCleanup([
            document.body
        ]);
    }


    // ============================================================
    // STATE
    // ============================================================

    const defaultSlides = [
        {
            title:
                "🚀 Welcome",

            content: [
                "Gesture-controlled presentation",
                "No clicker, no keyboard",
                "Just your hands"
            ]
        },

        {
            title:
                "📋 Agenda",

            content: [
                "Introduction to Velos",
                "Live demo: hand tracking",
                "Use cases & Q&A"
            ]
        },

        {
            title:
                "🧠 How it works",

            content: [
                "MediaPipe Hand Landmarks",
                "Real-time finger tracking",
                "Gesture classification engine"
            ]
        },

        {
            title:
                "✋ Gesture map",

            content: [
                "Open hand → Next slide / release fist manipulation",
                "Fist → Drag object / pan zoomed presentation",
                "Thumb + pinky held 1s → Air mouse ON",
                "Pinch → Air-mouse click / drag",
                "Swipe left/right → Previous/next slide",
                "Peace → Toggle fullscreen",
                "Point → Toggle laser pointer",
                "Two hands → Zoom"
            ]
        },

        {
            title:
                "🏠 Smart presentation mode",

            content: [
                "Laser and highlighter tools",
                "Live screen sharing",
                "Mouse/touch/fist viewport panning"
            ]
        },

        {
            title:
                "🙏 Thank you",

            content: [
                "Try it yourself!",
                "Open source & customisable",
                "Any questions?"
            ]
        }
    ];


    let cameraStream =
        null;

    let landmarker =
        null;

    let running =
        false;

    let rafId =
        0;

    let inferenceBusy =
        false;

    let lastInferenceAt =
        0;

    let lastPreviewAt =
        0;

    let lastVideoTime =
        -1;

    let lastHands =
        [];

    let inferenceFrameCount =
        0;

    let lastFpsTime =
        performance.now();

    let lastErrorLogAt =
        0;


    let pdfDoc =
        null;

    let pdfFileName =
        "Velos";

    let currentPage =
        0;

    let totalPages =
        0;

    let isPdfLoaded =
        false;

    let defaultIndex =
        0;

    let slideRenderToken =
        0;


    const pdfCache =
        new Map();

    const pdfRenderPromises =
        new Map();


    let screenShareStream =
        null;

    let screenShareVideo =
        null;

    let screenShareActive =
        false;


    let currentZoom =
        1;

    let baseZoom =
        1;

    let baseDist =
        0;

    let zoomActive =
        false;

    let zoomStableCount =
        0;

    let panX =
        0;

    let panY =
        0;

    let lastTransformString =
        "";


    let laserActive =
        false;

    let highlighterMode =
        false;

    let isDrawing =
        false;

    let lastDrawX =
        0;

    let lastDrawY =
        0;


    let smoothedIndexTip = {
        x: 0.5,
        y: 0.5
    };


    let gestureNavigationEnabled =
        true;

    let gestureBuffer =
        [];

    let handHistory =
        [];

    let lastStableGesture =
        "none";

    let gestureActionBlockedUntil =
        0;

    let openNavigationLockedUntil =
        0;

    let openNavigationArmed =
        true;


    let shakaHoldStartedAt =
        0;

    let shakaLastSeenAt =
        0;

    let shakaMouseTriggered =
        false;


    let fistMode =
        null;

    let fistTarget =
        null;

    let fistX =
        innerWidth * 0.5;

    let fistY =
        innerHeight * 0.5;

    let fistLastPoint =
        null;

    let fistLastAnchor =
        null;

    let fistLastSeenAt =
        0;

    let fistOpenFrames =
        0;


    let directPanPointerId =
        null;

    let directPanLastPoint =
        null;


    let mouseEnabled =
        false;

    let lastMouseTip =
        null;

    let lastTrackedMouseTip =
        null;

    let mouseCursorX =
        innerWidth * 0.5;

    let mouseCursorY =
        innerHeight * 0.5;

    let mouseCursorInitialized =
        false;

    let leftPinchActive =
        false;

    let pinchCloseFrames =
        0;

    let pinchOpenFrames =
        0;

    let pinchStartTime =
        0;

    let pinchStartTarget =
        null;

    let pinchStartPos = {
        x: 0,
        y: 0
    };

    let pinchLockPoint = {
        x: 0,
        y: 0
    };

    let pinchInputAnchor = {
        x: 0,
        y: 0
    };

    let isDragging =
        false;

    let dragTarget =
        null;

    let dragMouseDownSent =
        false;

    let airMouseViewportPan =
        false;

    let airMousePanLastInput =
        null;

    let clickFiredForCurrentPinch =
        false;

    let lastLeftPinchTime =
        0;

    let lastClickTarget =
        null;

    let lastClickPos = {
        x: 0,
        y: 0
    };

    let nextLeftClickAllowedAt =
        0;

    let wasRightClickGesture =
        false;

    let rightClickStartedAt =
        0;

    let rightClickCooldownUntil =
        0;

    let lastHoverTarget =
        null;

    let lastHoverPoint = {
        x: innerWidth * 0.5,
        y: innerHeight * 0.5
    };

    let hitCache =
        null;

    let hitCacheTime =
        0;

    let cachedTargetLookup =
        null;

    let cachedTargetLookupAt =
        0;


    let autoPlay =
        false;

    let autoTimer =
        null;

    let toastTimer =
        null;

    let sessionStartedAt =
        Date.now();

    let autoHidePanels =
        false;

    let clockTimer =
        null;

    let resizeObserver =
        null;

    let resizeTimer =
        null;


    // ============================================================
    // GENERIC UTILITIES
    // ============================================================

    function applyCursorAcceleration(value) {

    // convert 0-1 around center
    const centered = value - 0.5;

    const sign = Math.sign(centered);

    const magnitude = Math.abs(centered);


    // acceleration curve
    const accelerated =
        Math.pow(magnitude, 0.65);


    return (
        sign * accelerated
    ) + 0.5;
}

    const clamp =
        (value, min, max) =>
            Math.max(
                min,
                Math.min(
                    max,
                    value
                )
            );


    const clamp01 =
        (value) =>
            clamp(
                value,
                0,
                1
            );


    function mapRange01(
        value,
        min,
        max
    ) {
        if (
            max <=
            min
        ) {
            return 0.5;
        }


        return clamp01(
            (
                value -
                min
            ) /
            (
                max -
                min
            )
        );
    }


    function pointDistance(
        a,
        b
    ) {
        if (
            !a ||
            !b
        ) {
            return Infinity;
        }


        return Math.hypot(
            a.x -
                b.x,

            a.y -
                b.y
        );
    }


    function safeText(
        el,
        value
    ) {
        if (
            el &&
            el.textContent !==
                String(value)
        ) {
            el.textContent =
                String(value);
        }
    }


    function showToast(
        message,
        duration = 1200
    ) {
        if (
            !E.toast
        ) {
            return;
        }


        if (
            toastTimer
        ) {
            clearTimeout(
                toastTimer
            );
        }


        E.toast.textContent =
            message;


        E.toast.classList.add(
            "show"
        );


        toastTimer =
            setTimeout(
                () => {
                    E.toast?.classList.remove(
                        "show"
                    );


                    toastTimer =
                        null;
                },
                duration
            );
    }


    function showError(
        message
    ) {
        if (
            E.errorBox
        ) {
            E.errorBox.style.display =
                "block";


            E.errorBox.textContent =
                message;


            setTimeout(
                () => {
                    if (
                        E.errorBox
                    ) {
                        E.errorBox.style.display =
                            "none";
                    }
                },
                5000
            );
        }


        console.error(
            message
        );
    }


    function logFrameError(
        error
    ) {
        const now =
            performance.now();


        if (
            now -
                lastErrorLogAt >=
            CONFIG.performance
                .errorLogCooldownMs
        ) {
            console.error(
                "Velos frame error:",
                error
            );


            lastErrorLogAt =
                now;
        }
    }


    function invalidateHitCache() {
        hitCache =
            null;

        hitCacheTime =
            0;

        cachedTargetLookup =
            null;

        cachedTargetLookupAt =
            0;
    }


    // ============================================================
    // CANVASES
    // ============================================================

    function resizeDrawCanvas() {
        if (
            !E.drawCanvas ||
            !drawCtx ||
            !E.slideContent
        ) {
            return;
        }


        const width =
            Math.max(
                1,
                E.slideContent.clientWidth ||
                    E.slideCard?.clientWidth ||
                    1
            );


        const height =
            Math.max(
                1,
                E.slideContent.clientHeight ||
                    E.slideCard?.clientHeight ||
                    1
            );


        const dpr =
            Math.min(
                devicePixelRatio ||
                    1,

                CONFIG.performance
                    .maxCanvasDpr
            );


        const pxWidth =
            Math.max(
                1,
                Math.round(
                    width *
                    dpr
                )
            );


        const pxHeight =
            Math.max(
                1,
                Math.round(
                    height *
                    dpr
                )
            );


        if (
            E.drawCanvas.width ===
                pxWidth &&

            E.drawCanvas.height ===
                pxHeight
        ) {
            return;
        }


        E.drawCanvas.width =
            pxWidth;

        E.drawCanvas.height =
            pxHeight;


        E.drawCanvas.style.width =
            `${width}px`;

        E.drawCanvas.style.height =
            `${height}px`;


        drawCtx.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0
        );


        isDrawing =
            false;
    }


    function clearDrawCanvas() {
        if (
            !E.drawCanvas ||
            !drawCtx
        ) {
            return;
        }


        drawCtx.save();


        drawCtx.setTransform(
            1,
            0,
            0,
            1,
            0,
            0
        );


        drawCtx.clearRect(
            0,
            0,
            E.drawCanvas.width,
            E.drawCanvas.height
        );


        drawCtx.restore();


        isDrawing =
            false;
    }


    function resizePipOverlay() {
        if (
            !E.pipOverlay ||
            !pipCtx ||
            !E.pipWrapper
        ) {
            return;
        }


        const rect =
            E.pipWrapper
                .getBoundingClientRect();


        if (
            !rect.width ||
            !rect.height
        ) {
            return;
        }


        const dpr =
            Math.min(
                devicePixelRatio ||
                    1,

                CONFIG.performance
                    .maxCanvasDpr
            );


        const width =
            Math.max(
                1,
                Math.round(
                    rect.width *
                    dpr
                )
            );


        const height =
            Math.max(
                1,
                Math.round(
                    rect.height *
                    dpr
                )
            );


        if (
            E.pipOverlay.width !==
                width ||

            E.pipOverlay.height !==
                height
        ) {
            E.pipOverlay.width =
                width;

            E.pipOverlay.height =
                height;


            E.pipOverlay.style.width =
                `${rect.width}px`;

            E.pipOverlay.style.height =
                `${rect.height}px`;


            pipCtx.setTransform(
                dpr,
                0,
                0,
                dpr,
                0,
                0
            );
        }
    }


    function getPipVideoBox() {
        const rect =
            E.pipOverlay
                ?.getBoundingClientRect?.();


        if (
            !rect?.width ||
            !rect?.height
        ) {
            return null;
        }


        const vw =
            E.pipVideo?.videoWidth ||
            E.video?.videoWidth ||
            16;


        const vh =
            E.pipVideo?.videoHeight ||
            E.video?.videoHeight ||
            9;


        const scale =
            Math.min(
                rect.width /
                    vw,

                rect.height /
                    vh
            );


        const width =
            vw *
            scale;


        const height =
            vh *
            scale;


        return {
            x:
                (
                    rect.width -
                    width
                ) /
                2,

            y:
                (
                    rect.height -
                    height
                ) /
                2,

            width,
            height
        };
    }


    // ============================================================
    // PDF
    // ============================================================

    function configurePdfJs() {
        if (
            globalThis.pdfjsLib
                ?.GlobalWorkerOptions
        ) {
            globalThis
                .pdfjsLib
                .GlobalWorkerOptions
                .workerSrc =
                PDF_WORKER_URL;
        }
    }


    function touchPdfCache(
        index,
        canvas
    ) {
        if (
            pdfCache.has(
                index
            )
        ) {
            pdfCache.delete(
                index
            );
        }


        pdfCache.set(
            index,
            canvas
        );


        while (
            pdfCache.size >
            CONFIG.pdf.maxCachePages
        ) {
            const oldestKey =
                pdfCache
                    .keys()
                    .next()
                    .value;


            const oldCanvas =
                pdfCache.get(
                    oldestKey
                );


            pdfCache.delete(
                oldestKey
            );


            if (
                oldCanvas &&
                oldCanvas !==
                    canvas
            ) {
                oldCanvas.width =
                    1;

                oldCanvas.height =
                    1;
            }
        }
    }


    function computePdfRenderScale(
        page
    ) {
        const base =
            page.getViewport({
                scale: 1
            });


        const stageRect =
            stageCanvas
                ?.getBoundingClientRect?.() ||
            {
                width: 1280,
                height: 720
            };


        const desiredWidth =
            Math.max(
                800,
                stageRect.width *
                    1.35
            );


        const desiredHeight =
            Math.max(
                500,
                stageRect.height *
                    1.35
            );


        let scale =
            Math.min(
                desiredWidth /
                    base.width,

                desiredHeight /
                    base.height,

                2.0
            );


        scale =
            Math.max(
                0.75,
                scale
            );


        const pixels =
            base.width *
            scale *
            base.height *
            scale;


        if (
            pixels >
            CONFIG.pdf
                .maxPixelsPerPage
        ) {
            scale *=
                Math.sqrt(
                    CONFIG.pdf
                        .maxPixelsPerPage /
                    pixels
                );
        }


        return scale;
    }


    async function renderPdfPage(
        index
    ) {
        if (
            !pdfDoc ||
            index < 0 ||
            index >= totalPages
        ) {
            return null;
        }


        if (
            pdfCache.has(
                index
            )
        ) {
            const cached =
                pdfCache.get(
                    index
                );


            touchPdfCache(
                index,
                cached
            );


            return cached;
        }


        if (
            pdfRenderPromises.has(
                index
            )
        ) {
            return pdfRenderPromises.get(
                index
            );
        }


        const promise =
            (
                async () => {
                    const page =
                        await pdfDoc.getPage(
                            index +
                            1
                        );


                    const scale =
                        computePdfRenderScale(
                            page
                        );


                    const viewport =
                        page.getViewport({
                            scale
                        });


                    const canvas =
                        document.createElement(
                            "canvas"
                        );


                    const context =
                        canvas.getContext(
                            "2d",
                            {
                                alpha: false
                            }
                        );


                    canvas.width =
                        Math.max(
                            1,
                            Math.floor(
                                viewport.width
                            )
                        );


                    canvas.height =
                        Math.max(
                            1,
                            Math.floor(
                                viewport.height
                            )
                        );


                    canvas.style.maxWidth =
                        "100%";

                    canvas.style.maxHeight =
                        "100%";

                    canvas.style.width =
                        "auto";

                    canvas.style.height =
                        "auto";

                    canvas.style.display =
                        "block";

                    canvas.style.margin =
                        "auto";


                    await page
                        .render({
                            canvasContext:
                                context,

                            viewport
                        })
                        .promise;


                    touchPdfCache(
                        index,
                        canvas
                    );


                    return canvas;
                }
            )();


        pdfRenderPromises.set(
            index,
            promise
        );


        try {
            return await promise;

        } finally {
            pdfRenderPromises.delete(
                index
            );
        }
    }


    function prefetchPdfNeighbors(
        index
    ) {
        if (
            !pdfDoc
        ) {
            return;
        }


        setTimeout(
            () => {
                for (
                    const neighbor
                    of [
                        index + 1,
                        index - 1
                    ]
                ) {
                    if (
                        neighbor >= 0 &&
                        neighbor < totalPages &&
                        !pdfCache.has(
                            neighbor
                        )
                    ) {
                        renderPdfPage(
                            neighbor
                        ).catch(
                            () => {}
                        );
                    }
                }
            },
            CONFIG.pdf
                .prefetchDelayMs
        );
    }


    async function loadPDF(
        file
    ) {
        if (
            !file
        ) {
            return;
        }


        if (
            screenShareActive
        ) {
            stopScreenShare();
        }


        configurePdfJs();


        if (
            !globalThis.pdfjsLib
        ) {
            throw new Error(
                "PDF.js is not loaded on this page."
            );
        }


        const data =
            await file.arrayBuffer();


        const newDoc =
            await globalThis
                .pdfjsLib
                .getDocument({
                    data
                })
                .promise;


        try {
            await pdfDoc?.destroy?.();

        } catch (_) {}


        pdfDoc =
            newDoc;

        pdfFileName =
            file.name ||
            "Presentation.pdf";

        totalPages =
            newDoc.numPages;

        currentPage =
            0;

        isPdfLoaded =
            true;


        pdfCache.clear();

        pdfRenderPromises.clear();


        resetPan({
            silent: true
        });


        await showSlide(
            0
        );


        showToast(
            `Loaded ${totalPages} PDF pages`,
            1500
        );
    }


    // ============================================================
    // SLIDES
    // ============================================================

    function appendDrawCanvas() {
        if (
            !E.slideContent ||
            !E.drawCanvas
        ) {
            return;
        }


        if (
            E.drawCanvas.parentElement !==
            E.slideContent
        ) {
            E.slideContent.appendChild(
                E.drawCanvas
            );
        }


        resizeDrawCanvas();
    }


    function renderDefaultSlide(
        index
    ) {
        const slide =
            defaultSlides[
                index
            ];


        if (
            !slide ||
            !E.slideContent
        ) {
            return;
        }


        const wrapper =
            document.createElement(
                "div"
            );


        wrapper.style.width =
            "100%";

        wrapper.style.padding =
            "20px";


        const h1 =
            document.createElement(
                "h1"
            );


        h1.textContent =
            slide.title;


        h1.style.fontSize =
            "clamp(2.2rem,6vw,4.2rem)";

        h1.style.fontWeight =
            "700";

        h1.style.background =
            "linear-gradient(135deg,#f0f8ff,#7bc9ff)";

        h1.style.webkitBackgroundClip =
            "text";

        h1.style.webkitTextFillColor =
            "transparent";

        h1.style.marginBottom =
            "24px";


        const ul =
            document.createElement(
                "ul"
            );


        ul.style.listStyle =
            "none";

        ul.style.padding =
            "0";


        for (
            const item
            of slide.content
        ) {
            const li =
                document.createElement(
                    "li"
                );


            li.textContent =
                `◆ ${item}`;


            li.style.fontSize =
                "clamp(1.2rem,2.5vw,2rem)";

            li.style.color =
                "#c8d8e8";

            li.style.padding =
                "8px 0 8px 28px";

            li.style.borderBottom =
                "1px solid rgba(255,255,255,0.04)";

            li.style.position =
                "relative";


            ul.appendChild(
                li
            );
        }


        wrapper.append(
            h1,
            ul
        );


        E.slideContent.replaceChildren(
            wrapper,
            E.drawCanvas
        );


        appendDrawCanvas();
    }


   async function showSlide(index) {
    if (screenShareActive) {
        return;
    }

    clearDrawCanvas();

    resetPan({
        silent: true
    });

    const token = ++slideRenderToken;

    if (isPdfLoaded && pdfDoc) {
        if (index < 0 || index >= totalPages) {
            return;
        }

        currentPage = index;

        safeText(
            E.slideNum,
            `${currentPage + 1} / ${totalPages}`
        );

        E.slideContent?.replaceChildren();

        const placeholder = document.createElement("div");
        placeholder.className = "placeholder";
        placeholder.textContent = "Rendering page...";

        E.slideContent?.appendChild(placeholder);

        appendDrawCanvas();

        try {
            const canvas = await renderPdfPage(index);

            if (
                token !== slideRenderToken ||
                screenShareActive ||
                currentPage !== index
            ) {
                return;
            }

            if (canvas && E.slideContent) {
                E.slideContent.replaceChildren(
                    canvas,
                    E.drawCanvas
                );

                appendDrawCanvas();
                prefetchPdfNeighbors(index);
            }
        } catch (error) {
            if (token === slideRenderToken) {
                showError(
                    `PDF render error: ${error.message}`
                );
            }
        }
    } else {
        if (
            index < 0 ||
            index >= defaultSlides.length
        ) {
            return;
        }

        defaultIndex = index;

        safeText(
            E.slideNum,
            `${index + 1} / ${defaultSlides.length}`
        );

        renderDefaultSlide(index);
    }

    applyViewportTransform();
    updateDeckUI();
    invalidateHitCache();

    window.dispatchEvent(
        new CustomEvent("velosSlideChanged", {
            detail: {
                slideIndex:
                    isPdfLoaded && pdfDoc
                        ? currentPage
                        : defaultIndex,

                totalSlides:
                    isPdfLoaded && pdfDoc
                        ? totalPages
                        : defaultSlides.length
            }
        })
    );
}

    


    function nextSlide() {
        if (
            screenShareActive
        ) {
            showToast(
                "Live Screen mode · stop sharing before changing slides",
                900
            );

            return;
        }


        if (
            isPdfLoaded &&
            pdfDoc
        ) {
            void showSlide(
                (
                    currentPage +
                    1
                ) %
                totalPages
            );

        } else {
            void showSlide(
                (
                    defaultIndex +
                    1
                ) %
                defaultSlides.length
            );
        }
    }


    function prevSlide() {
        if (
            screenShareActive
        ) {
            showToast(
                "Live Screen mode · stop sharing before changing slides",
                900
            );

            return;
        }


        if (
            isPdfLoaded &&
            pdfDoc
        ) {
            void showSlide(
                (
                    currentPage -
                    1 +
                    totalPages
                ) %
                totalPages
            );

        } else {
            void showSlide(
                (
                    defaultIndex -
                    1 +
                    defaultSlides.length
                ) %
                defaultSlides.length
            );
        }
    }


    // ============================================================
    // ZOOM / PAN
    // ============================================================

    function canPanViewport() {
        return (
            currentZoom >
            CONFIG.pan.minZoom
        );
    }


    function getViewportPanLimits(
        scale = currentZoom
    ) {
        if (
            !E.slideCard ||
            !stageCanvas
        ) {
            return {
                x: 0,
                y: 0
            };
        }


        const viewport =
            stageCanvas
                .getBoundingClientRect();


        const baseWidth =
            Math.max(
                1,
                E.slideCard.offsetWidth ||
                    viewport.width
            );


        const baseHeight =
            Math.max(
                1,
                E.slideCard.offsetHeight ||
                    viewport.height
            );


        const overflowX =
            Math.max(
                0,
                (
                    baseWidth *
                    scale -
                    viewport.width
                ) /
                2
            );


        const overflowY =
            Math.max(
                0,
                (
                    baseHeight *
                    scale -
                    viewport.height
                ) /
                2
            );


        return {
            x:
                overflowX +
                (
                    overflowX
                        ? CONFIG.pan.edgeGuardPx
                        : 0
                ),

            y:
                overflowY +
                (
                    overflowY
                        ? CONFIG.pan.edgeGuardPx
                        : 0
                )
        };
    }


    function clampPan() {
        if (
            !canPanViewport()
        ) {
            panX =
                0;

            panY =
                0;

            return;
        }


        const limits =
            getViewportPanLimits();


        panX =
            clamp(
                panX,
                -limits.x,
                limits.x
            );


        panY =
            clamp(
                panY,
                -limits.y,
                limits.y
            );
    }


    function applyViewportTransform(
        {
            showIndicator = false
        } = {}
    ) {
        if (
            !E.slideCard
        ) {
            return;
        }


        clampPan();


        const transform =
            `translate3d(${panX.toFixed(2)}px, ${panY.toFixed(2)}px, 0) scale(${currentZoom.toFixed(4)})`;


        if (
            transform !==
            lastTransformString
        ) {
            E.slideCard.style.transform =
                transform;


            lastTransformString =
                transform;
        }


        E.slideCard.style.cursor =
            directPanPointerId !== null ||
            fistMode === "pan" ||
            airMouseViewportPan

                ? "grabbing"

                : canPanViewport()
                    ? "grab"
                    : "";


        safeText(
            E.zoomMetric,
            `${Math.round(currentZoom * 100)}%`
        );


        if (
            showIndicator &&
            E.zoomIndicator
        ) {
            E.zoomIndicator.textContent =
                `Zoom: ${Math.round(currentZoom * 100)}% · Pan ${Math.round(panX)}, ${Math.round(panY)}`;


            E.zoomIndicator.classList.add(
                "show"
            );


            clearTimeout(
                E.zoomIndicator._hideTimer
            );


            E.zoomIndicator._hideTimer =
                setTimeout(
                    () =>
                        E.zoomIndicator
                            ?.classList
                            .remove(
                                "show"
                            ),

                    1200
                );
        }
    }


    function setPan(
        x,
        y,
        options = {}
    ) {
        if (
            Number.isFinite(
                x
            )
        ) {
            panX =
                x;
        }


        if (
            Number.isFinite(
                y
            )
        ) {
            panY =
                y;
        }


        applyViewportTransform(
            options
        );
    }


    function panBy(
        dx,
        dy,
        options = {}
    ) {
        if (
            !canPanViewport()
        ) {
            return false;
        }


        setPan(
            panX +
            (
                Number.isFinite(
                    dx
                )
                    ? dx
                    : 0
            ),

            panY +
            (
                Number.isFinite(
                    dy
                )
                    ? dy
                    : 0
            ),

            options
        );


        return true;
    }


    function resetPan(
        {
            silent = false
        } = {}
    ) {
        panX =
            0;

        panY =
            0;


        applyViewportTransform({
            showIndicator:
                !silent
        });
    }


    function applyZoom(
        scale,
        focalClientX = null,
        focalClientY = null
    ) {
        const nextZoom =
            clamp(
                Number(scale) ||
                    1,

                CONFIG.zoom.min,
                CONFIG.zoom.max
            );


        const oldZoom =
            Math.max(
                0.0001,
                currentZoom
            );


        if (
            Number.isFinite(
                focalClientX
            ) &&

            Number.isFinite(
                focalClientY
            ) &&

            Math.abs(
                nextZoom -
                oldZoom
            ) >
                0.00001 &&

            stageCanvas
        ) {
            const stageRect =
                stageCanvas
                    .getBoundingClientRect();


            const centerX =
                stageRect.left +
                stageRect.width /
                2;


            const centerY =
                stageRect.top +
                stageRect.height /
                2;


            const localX =
                (
                    focalClientX -
                    centerX -
                    panX
                ) /
                oldZoom;


            const localY =
                (
                    focalClientY -
                    centerY -
                    panY
                ) /
                oldZoom;


            panX =
                focalClientX -
                centerX -
                localX *
                nextZoom;


            panY =
                focalClientY -
                centerY -
                localY *
                nextZoom;
        }


        currentZoom =
            nextZoom;


        if (
            !canPanViewport()
        ) {
            panX =
                0;

            panY =
                0;
        }


        applyViewportTransform({
            showIndicator: true
        });
    }


    function resetZoom() {
        currentZoom =
            1;

        baseZoom =
            1;

        baseDist =
            0;

        zoomActive =
            false;

        zoomStableCount =
            0;

        panX =
            0;

        panY =
            0;


        applyViewportTransform({
            showIndicator: true
        });
    }


    function isPointInsideSlideCard(
        x,
        y
    ) {
        const rect =
            E.slideCard
                ?.getBoundingClientRect?.();


        return (
            !!rect &&

            x >= rect.left &&
            x <= rect.right &&

            y >= rect.top &&
            y <= rect.bottom
        );
    }


    function getExplicitDraggableTarget(
        x,
        y
    ) {
        const stack =
            document.elementsFromPoint(
                x,
                y
            );


        const selector =
            '[draggable="true"],[data-draggable],.draggable';


        for (
            const raw
            of stack
        ) {
            if (
                !(
                    raw instanceof
                    Element
                ) ||

                isIgnoredMouseElement(
                    raw
                )
            ) {
                continue;
            }


            const target =
                raw.closest?.(
                    selector
                );


            if (
                target &&
                !isIgnoredMouseElement(
                    target
                )
            ) {
                return target;
            }
        }


        return null;
    }


    function shouldPanViewportAt(
        x,
        y
    ) {
        return (
            canPanViewport() &&
            isPointInsideSlideCard(
                x,
                y
            ) &&
            !getExplicitDraggableTarget(
                x,
                y
            )
        );
    }


    function installDirectPan() {
        if (
            !E.slideCard
        ) {
            return;
        }


        E.slideCard.addEventListener(
            "pointerdown",
            (event) => {

                if (
                    !event.isTrusted ||
                    !canPanViewport() ||
                    mouseEnabled ||
                    fistMode
                ) {
                    return;
                }


                if (
                    event.button !==
                    0
                ) {
                    return;
                }


                if (
                    event.target.closest?.(
                        'button,a,input,select,textarea,label,[data-draggable],.draggable,[draggable="true"]'
                    )
                ) {
                    return;
                }


                directPanPointerId =
                    event.pointerId;


                directPanLastPoint = {
                    x:
                        event.clientX,

                    y:
                        event.clientY
                };


                try {
                    E.slideCard.setPointerCapture(
                        event.pointerId
                    );

                } catch (_) {}


                applyViewportTransform();


                event.preventDefault();
            }
        );


        E.slideCard.addEventListener(
            "pointermove",
            (event) => {

                if (
                    !event.isTrusted ||

                    directPanPointerId !==
                        event.pointerId ||

                    !directPanLastPoint
                ) {
                    return;
                }


                const dx =
                    (
                        event.clientX -
                        directPanLastPoint.x
                    ) *
                    CONFIG.pan.pointerGain;


                const dy =
                    (
                        event.clientY -
                        directPanLastPoint.y
                    ) *
                    CONFIG.pan.pointerGain;


                directPanLastPoint = {
                    x:
                        event.clientX,

                    y:
                        event.clientY
                };


                panBy(
                    dx,
                    dy
                );


                safeText(
                    E.gestureValueEl,
                    "VIEWPORT PAN · mouse/touch"
                );


                event.preventDefault();
            }
        );


        const end =
            (event) => {

                if (
                    directPanPointerId !==
                    event.pointerId
                ) {
                    return;
                }


                try {
                    E.slideCard.releasePointerCapture(
                        event.pointerId
                    );

                } catch (_) {}


                directPanPointerId =
                    null;


                directPanLastPoint =
                    null;


                applyViewportTransform({
                    showIndicator: true
                });
            };


        E.slideCard.addEventListener(
            "pointerup",
            end
        );


        E.slideCard.addEventListener(
            "pointercancel",
            end
        );
    }


    // ============================================================
    // SCREEN SHARE
    // ============================================================

    function setScreenShareButtonState(
        active
    ) {
        const btn =
            E.screenShareBtn;


        if (
            !btn
        ) {
            return;
        }


        btn.classList.toggle(
            "active",
            !!active
        );


        btn.setAttribute(
            "aria-pressed",
            active
                ? "true"
                : "false"
        );


        btn.title =
            active
                ? "Stop live screen sharing"
                : "Share your screen live";


        const label =
            btn.querySelector?.(
                ".label-desktop"
            );


        if (
            label
        ) {
            label.textContent =
                active
                    ? "Stop"
                    : "Share";

        } else {
            btn.textContent =
                active
                    ? "⏹ Stop Sharing"
                    : "🖥 Share Screen";
        }
    }


    async function startScreenShare() {
        if (
            screenShareActive
        ) {
            return;
        }


        if (
            !navigator.mediaDevices
                ?.getDisplayMedia
        ) {
            showToast(
                "Screen sharing is not supported by this browser",
                2200
            );

            return;
        }


        try {
            const stream =
                await navigator
                    .mediaDevices
                    .getDisplayMedia({
                        video: {
                            frameRate: {
                                ideal: 24,
                                max: 30
                            }
                        },

                        audio:
                            false
                    });


            screenShareStream =
                stream;


            screenShareActive =
                true;


            if (
                !screenShareVideo
            ) {
                screenShareVideo =
                    document.createElement(
                        "video"
                    );


                screenShareVideo.id =
                    "live-screen-share";


                screenShareVideo.autoplay =
                    true;

                screenShareVideo.playsInline =
                    true;

                screenShareVideo.muted =
                    true;


                screenShareVideo.setAttribute(
                    "aria-label",
                    "Live shared screen"
                );


                Object.assign(
                    screenShareVideo.style,
                    {
                        width: "100%",
                        height: "100%",
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: "contain",
                        background: "#000",
                        display: "block",
                        pointerEvents: "none"
                    }
                );
            }


            screenShareVideo.srcObject =
                stream;


            await screenShareVideo.play();


            if (
                autoPlay
            ) {
                toggleAutoPlay(
                    false
                );
            }


            E.slideContent
                ?.replaceChildren(
                    screenShareVideo,
                    E.drawCanvas
                );


            appendDrawCanvas();


            resetPan({
                silent: true
            });


            applyZoom(
                currentZoom
            );


            setScreenShareButtonState(
                true
            );


            updateDeckUI();


            showToast(
                "🖥 Live screen sharing started",
                1500
            );


            const track =
                stream
                    .getVideoTracks()[0];


            track?.addEventListener(
                "ended",
                () =>
                    stopScreenShare(
                        false
                    ),
                {
                    once: true
                }
            );

        } catch (
            error
        ) {
            if (
                error?.name ===
                    "NotAllowedError" ||

                error?.name ===
                    "AbortError"
            ) {
                showToast(
                    "Screen sharing cancelled",
                    1000
                );

            } else {
                console.error(
                    "Screen sharing error:",
                    error
                );


                showToast(
                    `Could not start screen sharing: ${error?.message || "unknown error"}`,
                    2200
                );
            }
        }
    }


    function stopScreenShare(
        stopTracks = true
    ) {
        if (
            !screenShareActive &&
            !screenShareStream
        ) {
            return;
        }


        const stream =
            screenShareStream;


        screenShareStream =
            null;


        screenShareActive =
            false;


        if (
            stopTracks &&
            stream
        ) {
            for (
                const track
                of stream.getTracks()
            ) {
                try {
                    track.stop();

                } catch (_) {}
            }
        }


        if (
            screenShareVideo
        ) {
            screenShareVideo.srcObject =
                null;
        }


        setScreenShareButtonState(
            false
        );


        if (
            isPdfLoaded &&
            pdfDoc
        ) {
            void showSlide(
                currentPage
            );

        } else {
            void showSlide(
                defaultIndex
            );
        }


        updateDeckUI();

        syncToolStates();


        showToast(
            "Screen sharing stopped",
            1000
        );
    }


    // ============================================================
    // FULLSCREEN / AUTO / HIGHLIGHTER
    // ============================================================

    async function toggleFullscreen() {
        try {
            if (
                document.fullscreenElement
            ) {
                await document.exitFullscreen();

            } else {
                await document.body.requestFullscreen();
            }

        } catch (
            error
        ) {
            showToast(
                `Fullscreen unavailable: ${error.message}`,
                1500
            );
        }
    }


    function toggleAutoPlay(
        force = null
    ) {
        autoPlay =
            typeof force ===
                "boolean"
                ? force
                : !autoPlay;


        if (
            autoTimer
        ) {
            clearTimeout(
                autoTimer
            );


            autoTimer =
                null;
        }


        if (
            autoPlay
        ) {
            startAutoPlay();
        }


        showToast(
            autoPlay
                ? "Auto-play started ▶️"
                : "Auto-play stopped ⏹",
            900
        );


        syncToolStates();
    }


    function startAutoPlay() {
        if (
            !autoPlay
        ) {
            return;
        }


        autoTimer =
            setTimeout(
                () => {
                    if (
                        !autoPlay
                    ) {
                        return;
                    }


                    nextSlide();

                    startAutoPlay();
                },
                5000
            );
    }


    function toggleHighlighter(
        force = null
    ) {
        if (
            mouseEnabled &&
            force !== false
        ) {
            showToast(
                "Air mouse mode active – highlighter disabled",
                1000
            );

            return;
        }


        highlighterMode =
            typeof force ===
                "boolean"
                ? force
                : !highlighterMode;


        if (
            highlighterMode
        ) {
            laserActive =
                true;
        }


        E.laserDot
            ?.classList
            .toggle(
                "highlighter",
                highlighterMode
            );


        if (
            !highlighterMode
        ) {
            isDrawing =
                false;
        }


        showToast(
            highlighterMode
                ? "🖊️ Highlighter ON"
                : "🖊️ Highlighter OFF",
            900
        );


        syncToolStates();
    }


    function toggleLaser(
        force = null
    ) {
        if (
            mouseEnabled &&
            force !== false
        ) {
            showToast(
                "Air mouse mode active – laser disabled",
                1000
            );

            return;
        }


        laserActive =
            typeof force ===
                "boolean"
                ? force
                : !laserActive;


        if (
            !laserActive
        ) {
            highlighterMode =
                false;

            isDrawing =
                false;


            E.laserDot
                ?.classList
                .remove(
                    "active",
                    "highlighter"
                );
        }


        syncToolStates();


        showToast(
            laserActive
                ? "Laser on"
                : "Laser off",
            700
        );
    }


    // ============================================================
    // HAND GEOMETRY / GESTURES
    // ============================================================

    const HAND_CONNECTIONS = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],

        [0, 5],
        [5, 6],
        [6, 7],
        [7, 8],

        [0, 9],
        [9, 10],
        [10, 11],
        [11, 12],

        [0, 13],
        [13, 14],
        [14, 15],
        [15, 16],

        [0, 17],
        [17, 18],
        [18, 19],
        [19, 20],

        [5, 9],
        [9, 13],
        [13, 17],
        [0, 17]
    ];


    const FINGER_TIPS =
        new Set([
            4,
            8,
            12,
            16,
            20
        ]);


    function landmarkDistance3D(
        a,
        b
    ) {
        if (
            !a ||
            !b
        ) {
            return Infinity;
        }


        return Math.hypot(
            a.x -
                b.x,

            a.y -
                b.y,

            (a.z || 0) -
                (b.z || 0)
        );
    }


    function jointAngleDeg(
        a,
        b,
        c
    ) {
        if (
            !a ||
            !b ||
            !c
        ) {
            return 0;
        }


        const ab = {
            x:
                a.x -
                b.x,

            y:
                a.y -
                b.y,

            z:
                (a.z || 0) -
                (b.z || 0)
        };


        const cb = {
            x:
                c.x -
                b.x,

            y:
                c.y -
                b.y,

            z:
                (c.z || 0) -
                (b.z || 0)
        };


        const ma =
            Math.hypot(
                ab.x,
                ab.y,
                ab.z
            );


        const mc =
            Math.hypot(
                cb.x,
                cb.y,
                cb.z
            );


        if (
            ma <
                1e-6 ||

            mc <
                1e-6
        ) {
            return 0;
        }


        const cosine =
            clamp(
                (
                    ab.x *
                        cb.x +

                    ab.y *
                        cb.y +

                    ab.z *
                        cb.z
                ) /
                (
                    ma *
                    mc
                ),

                -1,
                1
            );


        return (
            Math.acos(
                cosine
            ) *
            180 /
            Math.PI
        );
    }


    function getFingerExtension(
        landmarks
    ) {
        if (
            !landmarks ||
            landmarks.length <
                21
        ) {
            return [
                false,
                false,
                false,
                false,
                false
            ];
        }


        const wrist =
            landmarks[0];


        const result =
            [];


        const thumbExtended =
            jointAngleDeg(
                landmarks[1],
                landmarks[2],
                landmarks[3]
            ) >
                135 &&

            jointAngleDeg(
                landmarks[2],
                landmarks[3],
                landmarks[4]
            ) >
                145 &&

            landmarkDistance3D(
                landmarks[4],
                wrist
            ) >
                landmarkDistance3D(
                    landmarks[3],
                    wrist
                ) *
                1.05;


        result.push(
            thumbExtended
        );


        for (
            const [
                mcp,
                pip,
                dip,
                tip
            ]
            of [
                [5, 6, 7, 8],
                [9, 10, 11, 12],
                [13, 14, 15, 16],
                [17, 18, 19, 20]
            ]
        ) {
            const extended =
                jointAngleDeg(
                    landmarks[mcp],
                    landmarks[pip],
                    landmarks[dip]
                ) >
                    150 &&

                jointAngleDeg(
                    landmarks[pip],
                    landmarks[dip],
                    landmarks[tip]
                ) >
                    145 &&

                landmarkDistance3D(
                    landmarks[tip],
                    wrist
                ) >
                    landmarkDistance3D(
                        landmarks[pip],
                        wrist
                    ) *
                    1.08;


            result.push(
                extended
            );
        }


        return result;
    }


    function recognizeGesture(
        landmarks
    ) {
        if (
            !landmarks ||
            landmarks.length <
                21
        ) {
            return "none";
        }


        const up =
            getFingerExtension(
                landmarks
            );


        const [
            thumb,
            index,
            middle,
            ring,
            pinky
        ] =
            up;


        const count =
            up.filter(
                Boolean
            ).length;


        if (
            count ===
            0
        ) {
            return "fist";
        }


        if (
            count >=
            4
        ) {
            return "open";
        }


        if (
            index &&
            middle &&
            !ring &&
            !pinky
        ) {
            return "peace";
        }


        if (
            index &&
            !middle &&
            !ring &&
            !pinky
        ) {
            return "point";
        }


        if (
            thumb &&
            pinky &&
            !index &&
            !middle &&
            !ring
        ) {
            return "shaka";
        }


        if (
            thumb &&
            !index &&
            !middle &&
            !ring &&
            !pinky
        ) {
            const wrist =
                landmarks[0];


            const tip =
                landmarks[4];


            if (
                tip.y <
                wrist.y -
                    0.03
            ) {
                return "thumbsup";
            }


            if (
                tip.y >
                wrist.y +
                    0.03
            ) {
                return "thumbsdown";
            }
        }


        return "none";
    }


    function getHandCenter(
        landmarks
    ) {
        let x =
            0;

        let y =
            0;


        for (
            const lm
            of landmarks
        ) {
            x +=
                lm.x;

            y +=
                lm.y;
        }


        return {
            x:
                x /
                landmarks.length,

            y:
                y /
                landmarks.length
        };
    }


    function detectSwipe(
        history
    ) {
        if (
            history.length <
            CONFIG.gesture
                .swipeHistory
        ) {
            return null;
        }


        const first =
            history[0];


        const last =
            history[
                history.length -
                1
            ];


        const dx =
            last.x -
            first.x;


        const dy =
            last.y -
            first.y;


        if (
            Math.hypot(
                dx,
                dy
            ) <
            CONFIG.gesture
                .swipeThreshold
        ) {
            return null;
        }


        if (
            Math.abs(
                dx
            ) >
            Math.abs(
                dy
            )
        ) {
            return (
                dx >
                0

                    ? "swipeRight"

                    : "swipeLeft"
            );
        }


        return (
            dy >
            0

                ? "swipeDown"

                : "swipeUp"
        );
    }


    // ============================================================
    // LASER / DRAWING
    // ============================================================

    function updateLaser(
        landmarks
    ) {
        if (
            !laserActive ||
            !landmarks?.[8] ||
            !E.slideContent ||
            !E.laserDot
        ) {
            E.laserDot
                ?.classList
                .remove(
                    "active"
                );


            isDrawing =
                false;


            return;
        }


        const idx =
            landmarks[8];


        smoothedIndexTip.x +=
            (
                idx.x -
                smoothedIndexTip.x
            ) *
            0.35;


        smoothedIndexTip.y +=
            (
                idx.y -
                smoothedIndexTip.y
            ) *
            0.35;


        const sx =
            (
                1 -
                smoothedIndexTip.x
            ) *
            innerWidth;


        const sy =
            smoothedIndexTip.y *
            innerHeight;


        const rect =
            E.slideContent
                .getBoundingClientRect();


        if (
            !rect.width ||
            !rect.height
        ) {
            return;
        }


        const relX =
            (
                sx -
                rect.left
            ) /
            rect.width;


        const relY =
            (
                sy -
                rect.top
            ) /
            rect.height;


        const inside =
            relX >= 0 &&
            relX <= 1 &&
            relY >= 0 &&
            relY <= 1;


        if (
            !inside
        ) {
            E.laserDot
                .classList
                .remove(
                    "active"
                );


            isDrawing =
                false;


            return;
        }


        E.laserDot
            .classList
            .add(
                "active"
            );


        E.laserDot.style.left =
            `${relX * 100}%`;


        E.laserDot.style.top =
            `${relY * 100}%`;


        if (
            highlighterMode &&
            E.drawCanvas &&
            drawCtx
        ) {
            const canvasRect =
                E.drawCanvas
                    .getBoundingClientRect();


            const cssWidth =
                E.drawCanvas.clientWidth ||
                1;


            const cssHeight =
                E.drawCanvas.clientHeight ||
                1;


            if (
                canvasRect.width &&
                canvasRect.height
            ) {
                const drawX =
                    (
                        sx -
                        canvasRect.left
                    ) *
                    cssWidth /
                    canvasRect.width;


                const drawY =
                    (
                        sy -
                        canvasRect.top
                    ) *
                    cssHeight /
                    canvasRect.height;


                if (
                    isDrawing
                ) {
                    drawCtx.beginPath();


                    drawCtx.moveTo(
                        lastDrawX,
                        lastDrawY
                    );


                    drawCtx.lineTo(
                        drawX,
                        drawY
                    );


                    drawCtx.strokeStyle =
                        "#00ff88";


                    drawCtx.lineWidth =
                        6;


                    drawCtx.lineCap =
                        "round";


                    drawCtx.lineJoin =
                        "round";


                    drawCtx.stroke();

                } else {
                    isDrawing =
                        true;
                }


                lastDrawX =
                    drawX;


                lastDrawY =
                    drawY;
            }

        } else {
            isDrawing =
                false;
        }
    }


    // ============================================================
    // PIP PREVIEW - LIGHTWEIGHT
    // ============================================================

    function drawHandSkeleton(
        lm,
        handIndex,
        box
    ) {
        if (
            !pipCtx ||
            !lm ||
            lm.length <
                21 ||
            !box
        ) {
            return 0;
        }


        const pts =
            lm.map(
                (p) => ({
                    x:
                        box.x +
                        (
                            1 -
                            p.x
                        ) *
                        box.width,

                    y:
                        box.y +
                        p.y *
                        box.height
                })
            );


        const count =
            getFingerExtension(
                lm
            )
            .filter(
                Boolean
            )
            .length;


        const line =
            handIndex % 2
                ? "rgba(168,147,255,.82)"
                : "rgba(101,230,189,.82)";


        const joint =
            handIndex % 2
                ? "#9acbff"
                : "#66ddff";


        const tip =
            handIndex % 2
                ? "#c1b3ff"
                : "#65e6bd";


        pipCtx.save();


        pipCtx.lineWidth =
            1.8;


        pipCtx.strokeStyle =
            line;


        for (
            const [
                a,
                b
            ]
            of HAND_CONNECTIONS
        ) {
            pipCtx.beginPath();


            pipCtx.moveTo(
                pts[a].x,
                pts[a].y
            );


            pipCtx.lineTo(
                pts[b].x,
                pts[b].y
            );


            pipCtx.stroke();
        }


        for (
            let i = 0;
            i <
            pts.length;
            i++
        ) {
            pipCtx.beginPath();


            pipCtx.arc(
                pts[i].x,
                pts[i].y,
                FINGER_TIPS.has(
                    i
                )
                    ? 4.2
                    : 2.6,
                0,
                Math.PI * 2
            );


            pipCtx.fillStyle =
                FINGER_TIPS.has(
                    i
                )
                    ? tip
                    : joint;


            pipCtx.fill();
        }


        pipCtx.restore();


        return count;
    }


    function drawPreview(
        hands
    ) {
        if (
            !pipCtx ||
            !E.pipOverlay ||
            !E.pipVideo
        ) {
            return;
        }


        resizePipOverlay();


        const rect =
            E.pipOverlay
                .getBoundingClientRect();


        if (
            !rect.width ||
            !rect.height
        ) {
            return;
        }


        pipCtx.clearRect(
            0,
            0,
            rect.width,
            rect.height
        );


        const box =
            getPipVideoBox();


        if (
            !box
        ) {
            return;
        }


        pipCtx.save();


        pipCtx.fillStyle =
            "#030507";


        pipCtx.fillRect(
            0,
            0,
            rect.width,
            rect.height
        );


        if (
            E.pipVideo.readyState >=
                2 &&

            E.pipVideo.videoWidth
        ) {
            pipCtx.translate(
                box.x +
                    box.width,
                box.y
            );


            pipCtx.scale(
                -1,
                1
            );


            pipCtx.drawImage(
                E.pipVideo,

                0,
                0,
                E.pipVideo.videoWidth,
                E.pipVideo.videoHeight,

                0,
                0,
                box.width,
                box.height
            );
        }


        pipCtx.restore();


        const counts =
            [];


        for (
            let i = 0;
            i <
            (
                hands?.length ||
                0
            );
            i++
        ) {
            counts.push(
                drawHandSkeleton(
                    hands[i],
                    i,
                    box
                )
            );
        }


        if (
            !counts.length
        ) {
            E.fingerCountEl
                ?.classList
                .add(
                    "hidden"
                );

        } else {
            E.fingerCountEl
                ?.classList
                .remove(
                    "hidden"
                );


            safeText(
                E.fingerCountNum,

                counts.length === 1

                    ? `1 hand · ${counts[0]} fingers`

                    : `${counts.length} hands · ${counts
                        .map(
                            (n, i) =>
                                `H${i + 1}:${n}`
                        )
                        .join(" · ")}`
            );
        }
    }


    // ============================================================
    // SYNTHETIC MOUSE EVENTS
    // ============================================================

    const INTERACTIVE_SELECTOR =
        [
            "button",
            "a[href]",
            "input",
            "select",
            "textarea",
            "label",
            '[role="button"]',
            '[role="link"]',
            '[role="menuitem"]',
            '[tabindex]:not([tabindex="-1"])',
            "[onclick]"
        ].join(",");


    function isIgnoredMouseElement(
        el
    ) {
        if (
            !el
        ) {
            return true;
        }


        return (
            el ===
                E.cursorEl ||

            el ===
                E.laserDot ||

            el ===
                E.pipOverlay ||

            el ===
                E.pipVideo ||

            el ===
                E.drawCanvas ||

            !!el.closest?.(
                "#pip-wrapper"
            )
        );
    }


    function isUsableInteractive(
        el
    ) {
        if (
            !(
                el instanceof
                Element
            ) ||

            isIgnoredMouseElement(
                el
            )
        ) {
            return false;
        }


        if (
            el.matches?.(
                ':disabled,[aria-disabled="true"]'
            )
        ) {
            return false;
        }


        const rect =
            el.getBoundingClientRect();


        if (
            !rect.width ||
            !rect.height
        ) {
            return false;
        }


        if (
            rect.right <
                -40 ||

            rect.left >
                innerWidth +
                    40 ||

            rect.bottom <
                -40 ||

            rect.top >
                innerHeight +
                    40
        ) {
            return false;
        }


        const style =
            getComputedStyle(
                el
            );


        return (
            style.pointerEvents !==
                "none" &&

            style.display !==
                "none" &&

            style.visibility !==
                "hidden" &&

            Number(
                style.opacity
            ) !==
                0
        );
    }


    function getInteractiveCenters() {
        const result =
            [];


        const nodes =
            document.querySelectorAll(
                INTERACTIVE_SELECTOR
            );


        let checked =
            0;


        for (
            const el
            of nodes
        ) {
            if (
                ++checked >
                450
            ) {
                break;
            }


            if (
                !isUsableInteractive(
                    el
                )
            ) {
                continue;
            }


            const r =
                el.getBoundingClientRect();


            result.push({
                el,
                r,

                cx:
                    r.left +
                    r.width /
                    2,

                cy:
                    r.top +
                    r.height /
                    2
            });
        }


        return result;
    }


    function refreshHitCache(
        force = false
    ) {
        const now =
            performance.now();


        if (
            force ||
            !hitCache ||
            now -
                hitCacheTime >
                CONFIG.mouse
                    .hitCacheMs
        ) {
            hitCache =
                getInteractiveCenters();


            hitCacheTime =
                now;
        }


        return hitCache;
    }


    function findNearestInteractive(
        x,
        y,
        maxDist =
            CONFIG.mouse
                .snapRadiusPx
    ) {
        let best =
            null;


        let bestScore =
            Infinity;


        for (
            const target
            of refreshHitCache(
                false
            )
        ) {
            const dx =
                x <
                    target.r.left

                    ? target.r.left -
                        x

                    : x >
                        target.r.right

                        ? x -
                            target.r.right

                        : 0;


            const dy =
                y <
                    target.r.top

                    ? target.r.top -
                        y

                    : y >
                        target.r.bottom

                        ? y -
                            target.r.bottom

                        : 0;


            const edgeDistance =
                Math.hypot(
                    dx,
                    dy
                );


            if (
                edgeDistance >
                maxDist
            ) {
                continue;
            }


            const centerDistance =
                Math.hypot(
                    target.cx -
                        x,

                    target.cy -
                        y
                );


            const score =
                edgeDistance *
                    4 +

                centerDistance *
                    0.10;


            if (
                score <
                bestScore
            ) {
                bestScore =
                    score;

                best =
                    target;
            }
        }


        return best;
    }


    function getTargetElement(
        x,
        y,
        {
            force = false
        } = {}
    ) {
        const now =
            performance.now();


        /*
         * Cache null results too.
         * Otherwise empty-space cursor movement can perform
         * an expensive elementsFromPoint search every frame.
         */
        if (
            !force &&
            now -
                cachedTargetLookupAt <
                CONFIG.mouse
                    .targetLookupMs
        ) {
            return cachedTargetLookup;
        }


        let found =
            null;


        for (
            const raw
            of document.elementsFromPoint(
                x,
                y
            )
        ) {
            if (
                !(
                    raw instanceof
                    Element
                ) ||

                isIgnoredMouseElement(
                    raw
                )
            ) {
                continue;
            }


            const actionable =
                raw.closest?.(
                    INTERACTIVE_SELECTOR
                );


            if (
                actionable &&
                isUsableInteractive(
                    actionable
                )
            ) {
                found =
                    actionable;

                break;
            }
        }


        if (
            !found
        ) {
            found =
                findNearestInteractive(
                    x,
                    y
                )?.el ||
                null;
        }


        cachedTargetLookup =
            found;


        cachedTargetLookupAt =
            now;


        return found;
    }


    function snapPoint(
        x,
        y
    ) {
        const near =
            findNearestInteractive(
                x,
                y,
                CONFIG.mouse
                    .snapRadiusPx
            );


        if (
            !near
        ) {
            return {
                x,
                y,
                snapped: false,
                target: null
            };
        }


        const pad =
            CONFIG.mouse
                .snapInsidePadPx;


        const inside =
            x >=
                near.r.left -
                    pad &&

            x <=
                near.r.right +
                    pad &&

            y >=
                near.r.top -
                    pad &&

            y <=
                near.r.bottom +
                    pad;


        return (
            inside

                ? {
                    x:
                        near.cx,

                    y:
                        near.cy,

                    snapped:
                        true,

                    target:
                        near.el
                }

                : {
                    x,
                    y,
                    snapped:
                        false,

                    target:
                        null
                }
        );
    }


    function makeMouseOptions(
        x,
        y,
        button,
        buttons,
        detail = 1
    ) {
        return {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,

            clientX:
                x,

            clientY:
                y,

            screenX:
                x,

            screenY:
                y,

            button,
            buttons,
            detail
        };
    }


    function dispatchMouseDown(
        el,
        x,
        y,
        button = 0
    ) {
        if (
            !el
        ) {
            return;
        }


        const buttons =
            button ===
                0
                ? 1
                : 2;


        const opts =
            makeMouseOptions(
                x,
                y,
                button,
                buttons,
                1
            );


        if (
            window.PointerEvent
        ) {
            el.dispatchEvent(
                new PointerEvent(
                    "pointerdown",
                    {
                        ...opts,

                        pointerId:
                            1,

                        pointerType:
                            "mouse",

                        isPrimary:
                            true,

                        pressure:
                            0.5
                    }
                )
            );
        }


        el.dispatchEvent(
            new MouseEvent(
                "mousedown",
                opts
            )
        );
    }


    function dispatchMouseMove(
        el,
        x,
        y,
        buttons = 1
    ) {
        if (
            !el
        ) {
            return;
        }


        const opts =
            makeMouseOptions(
                x,
                y,
                0,
                buttons,
                0
            );


        if (
            window.PointerEvent
        ) {
            el.dispatchEvent(
                new PointerEvent(
                    "pointermove",
                    {
                        ...opts,

                        pointerId:
                            1,

                        pointerType:
                            "mouse",

                        isPrimary:
                            true,

                        pressure:
                            buttons
                                ? 0.5
                                : 0
                    }
                )
            );
        }


        el.dispatchEvent(
            new MouseEvent(
                "mousemove",
                opts
            )
        );
    }


    function dispatchMouseUp(
        el,
        x,
        y,
        button = 0
    ) {
        if (
            !el
        ) {
            return;
        }


        const opts =
            makeMouseOptions(
                x,
                y,
                button,
                0,
                1
            );


        if (
            window.PointerEvent
        ) {
            el.dispatchEvent(
                new PointerEvent(
                    "pointerup",
                    {
                        ...opts,

                        pointerId:
                            1,

                        pointerType:
                            "mouse",

                        isPrimary:
                            true,

                        pressure:
                            0
                    }
                )
            );
        }


        el.dispatchEvent(
            new MouseEvent(
                "mouseup",
                opts
            )
        );
    }


    function dispatchContextMenu(
        el,
        x,
        y
    ) {
        if (
            !el
        ) {
            return;
        }


        el.dispatchEvent(
            new MouseEvent(
                "contextmenu",
                makeMouseOptions(
                    x,
                    y,
                    2,
                    0,
                    1
                )
            )
        );


        E.cursorEl
            ?.classList
            .add(
                "right-click"
            );


        setTimeout(
            () =>
                E.cursorEl
                    ?.classList
                    .remove(
                        "right-click"
                    ),

            200
        );
    }


    function flashCursor() {
        E.cursorEl
            ?.classList
            .add(
                "flash"
            );


        setTimeout(
            () =>
                E.cursorEl
                    ?.classList
                    .remove(
                        "flash"
                    ),

            130
        );
    }


    function activateMouseTarget(
        el,
        x,
        y,
        isDouble = false
    ) {
        if (
            !el ||
            !isUsableInteractive(
                el
            )
        ) {
            return false;
        }


        try {
            el.focus?.({
                preventScroll:
                    true
            });

        } catch (_) {}


        try {
            if (
                typeof el.click ===
                "function"
            ) {
                el.click();


                if (
                    isDouble
                ) {
                    el.dispatchEvent(
                        new MouseEvent(
                            "dblclick",
                            makeMouseOptions(
                                x,
                                y,
                                0,
                                0,
                                2
                            )
                        )
                    );
                }


                flashCursor();


                return true;
            }

        } catch (_) {}


        try {
            el.dispatchEvent(
                new MouseEvent(
                    "click",
                    makeMouseOptions(
                        x,
                        y,
                        0,
                        0,
                        isDouble
                            ? 2
                            : 1
                    )
                )
            );


            if (
                isDouble
            ) {
                el.dispatchEvent(
                    new MouseEvent(
                        "dblclick",
                        makeMouseOptions(
                            x,
                            y,
                            0,
                            0,
                            2
                        )
                    )
                );
            }


            flashCursor();


            return true;

        } catch (
            error
        ) {
            console.warn(
                "Air-mouse click failed:",
                error
            );


            return false;
        }
    }


    // ============================================================
    // AIR MOUSE
    // ============================================================

    function getHandScale(
        lm
    ) {
        if (
            !lm ||
            lm.length <
                21
        ) {
            return 0.1;
        }


        return Math.max(
            pointDistance(
                lm[5],
                lm[17]
            ),

            pointDistance(
                lm[0],
                lm[9]
            ),

            0.035
        );
    }


    function getPinchRatio(
        lm,
        fingerTipIndex
    ) {
        if (
            !lm?.[4] ||
            !lm?.[
                fingerTipIndex
            ]
        ) {
            return Infinity;
        }


        return (
            pointDistance(
                lm[4],
                lm[
                    fingerTipIndex
                ]
            ) /
            getHandScale(
                lm
            )
        );
    }


    function chooseMouseHand(
        hands
    ) {
        if (
            !hands?.length
        ) {
            return null;
        }


        if (
            hands.length ===
                1 ||

            !lastTrackedMouseTip
        ) {
            return hands[0];
        }


        let best =
            hands[0];


        let bestDistance =
            Infinity;


        for (
            const hand
            of hands
        ) {
            const tip =
                hand?.[8];


            if (
                !tip
            ) {
                continue;
            }


            const normalized = {
                x:
                    1 -
                    tip.x,

                y:
                    tip.y
            };


            const d =
                pointDistance(
                    normalized,
                    lastTrackedMouseTip
                );


            if (
                d <
                bestDistance
            ) {
                bestDistance =
                    d;

                best =
                    hand;
            }
        }


        return best;
    }


    function resetMousePressState(
        {
            release = false
        } = {}
    ) {
        if (
            release &&
            leftPinchActive &&
            isDragging &&
            dragMouseDownSent
        ) {
            const target =
                getTargetElement(
                    mouseCursorX,
                    mouseCursorY,
                    {
                        force: true
                    }
                ) ||
                dragTarget ||
                pinchStartTarget;


            try {
                dispatchMouseUp(
                    target,
                    mouseCursorX,
                    mouseCursorY,
                    0
                );

            } catch (_) {}
        }


        leftPinchActive =
            false;

        isDragging =
            false;

        clickFiredForCurrentPinch =
            false;

        dragMouseDownSent =
            false;

        airMouseViewportPan =
            false;

        airMousePanLastInput =
            null;

        pinchStartTarget =
            null;

        dragTarget =
            null;

        pinchStartTime =
            0;


        pinchLockPoint = {
            x:
                mouseCursorX,

            y:
                mouseCursorY
        };


        pinchInputAnchor = {
            x:
                mouseCursorX,

            y:
                mouseCursorY
        };


        pinchCloseFrames =
            0;

        pinchOpenFrames =
            0;


        E.cursorEl
            ?.classList
            .remove(
                "pinching",
                "dragging"
            );
    }


    function resetAirMouseTracking(
        {
            hideCursor = false,
            release = false
        } = {}
    ) {
        resetMousePressState({
            release
        });


        wasRightClickGesture =
            false;

        rightClickStartedAt =
            0;

        lastMouseTip =
            null;

        lastTrackedMouseTip =
            null;

        mouseCursorInitialized =
            false;

        lastHoverTarget =
            null;


        lastHoverPoint = {
            x:
                innerWidth *
                0.5,

            y:
                innerHeight *
                0.5
        };


        invalidateHitCache();


        if (
            hideCursor
        ) {
            E.cursorEl
                ?.classList
                .remove(
                    "active",
                    "right-click"
                );


            if (
                E.cursorEl
            ) {
                E.cursorEl.style.opacity =
                    "0";
            }
        }
    }


    function fireLeftClick(
        clickTarget,
        x,
        y,
        now
    ) {
        if (
            !clickTarget ||
            clickFiredForCurrentPinch ||
            now <
                nextLeftClickAllowedAt
        ) {
            return false;
        }


        const sinceLast =
            now -
            lastLeftPinchTime;


        const isDouble =
            lastClickTarget ===
                clickTarget &&

            Math.hypot(
                x -
                    lastClickPos.x,

                y -
                    lastClickPos.y
            ) <=
                CONFIG.mouse
                    .doubleClickDistancePx &&

            sinceLast >
                90 &&

            sinceLast <=
                CONFIG.mouse
                    .doubleClickInterval;


        if (
            !activateMouseTarget(
                clickTarget,
                x,
                y,
                isDouble
            )
        ) {
            return false;
        }


        clickFiredForCurrentPinch =
            true;


        lastLeftPinchTime =
            now;


        lastClickTarget =
            clickTarget;


        lastClickPos = {
            x,
            y
        };


        nextLeftClickAllowedAt =
            now +
            CONFIG.mouse
                .clickCooldownMs;


        showToast(
            isDouble
                ? "Double click"
                : "Left click",
            420
        );


        return true;
    }


    function updateMouse(
        hands,
        now
    ) {
        const lm =
            chooseMouseHand(
                hands
            );


        if (
            !lm?.[8]
        ) {
            if (
                E.cursorEl
            ) {
                E.cursorEl.style.opacity =
                    "0.25";
            }


            resetMousePressState({
                release: true
            });


            wasRightClickGesture =
                false;


            return;
        }


        let nx =
            1 -
            lm[8].x;


        let ny =
            lm[8].y;


        if (
            lastMouseTip &&

            Math.hypot(
                nx -
                    lastMouseTip.x,

                ny -
                    lastMouseTip.y
            ) <
                CONFIG.mouse
                    .deadzone
        ) {
            nx =
                lastMouseTip.x;

            ny =
                lastMouseTip.y;
        }


        const rawSpeed =
            lastMouseTip

                ? Math.hypot(
                    nx -
                        lastMouseTip.x,

                    ny -
                        lastMouseTip.y
                )

                : 0;


        lastMouseTip = {
            x: nx,
            y: ny
        };


        lastTrackedMouseTip = {
            x: nx,
            y: ny
        };


        let mappedX =
    mapRange01(
        nx,
        CONFIG.mouse.xMin,
        CONFIG.mouse.xMax
    );


let mappedY =
    mapRange01(
        ny,
        CONFIG.mouse.yMin,
        CONFIG.mouse.yMax
    );


mappedX =
    applyCursorAcceleration(mappedX);


mappedY =
    applyCursorAcceleration(mappedY);



const inputX =
    mappedX * innerWidth;


const inputY =
    mappedY * innerHeight;


        const speedT =
            clamp01(
                rawSpeed /
                CONFIG.mouse
                    .speedForMaxSmoothing
            );


        const alpha =
            CONFIG.mouse
                .smoothingMin +

            (
                CONFIG.mouse
                    .smoothingMax -

                CONFIG.mouse
                    .smoothingMin
            ) *
            speedT;


        if (
            !mouseCursorInitialized
        ) {
            mouseCursorX =
                inputX;

            mouseCursorY =
                inputY;

            mouseCursorInitialized =
                true;

        } else if (
            !leftPinchActive ||
            isDragging
        ) {
            mouseCursorX +=
                (
                    inputX -
                    mouseCursorX
                ) *
                alpha;


            mouseCursorY +=
                (
                    inputY -
                    mouseCursorY
                ) *
                alpha;
        }


        let freeX =
            clamp(
                mouseCursorX,
                0,
                innerWidth -
                    1
            );


        let freeY =
            clamp(
                mouseCursorY,
                0,
                innerHeight -
                    1
            );


        const pinchRatio =
            getPinchRatio(
                lm,
                8
            );


        const closeCandidate =
            pinchRatio <=
            CONFIG.mouse
                .pinchCloseRatio;


        const openCandidate =
            pinchRatio >=
            CONFIG.mouse
                .pinchOpenRatio;


        if (
            !leftPinchActive
        ) {
            const snap =
                snapPoint(
                    freeX,
                    freeY
                );


            if (
                snap.snapped
            ) {
                mouseCursorX +=
                    (
                        snap.x -
                        mouseCursorX
                    ) *
                    0.52;


                mouseCursorY +=
                    (
                        snap.y -
                        mouseCursorY
                    ) *
                    0.52;


                freeX =
                    clamp(
                        mouseCursorX,
                        0,
                        innerWidth -
                            1
                    );


                freeY =
                    clamp(
                        mouseCursorY,
                        0,
                        innerHeight -
                            1
                    );
            }


            const target =
                snap.target ||
                getTargetElement(
                    freeX,
                    freeY
                );


            if (
                target
            ) {
                lastHoverTarget =
                    target;


                const r =
                    target
                        .getBoundingClientRect();


                lastHoverPoint =
                    snap.snapped

                        ? {
                            x:
                                snap.x,

                            y:
                                snap.y
                        }

                        : {
                            x:
                                clamp(
                                    freeX,
                                    r.left +
                                        1,
                                    r.right -
                                        1
                                ),

                            y:
                                clamp(
                                    freeY,
                                    r.top +
                                        1,
                                    r.bottom -
                                        1
                                )
                        };

            } else if (
                !closeCandidate
            ) {
                lastHoverTarget =
                    null;


                lastHoverPoint = {
                    x:
                        freeX,

                    y:
                        freeY
                };
            }


            pinchOpenFrames =
                0;


            pinchCloseFrames =
                closeCandidate

                    ? pinchCloseFrames +
                        1

                    : 0;


            if (
                pinchCloseFrames >=
                CONFIG.mouse
                    .pinchStableFrames
            ) {
                leftPinchActive =
                    true;


                pinchCloseFrames =
                    0;


                pinchOpenFrames =
                    0;


                pinchStartTime =
                    now;


                clickFiredForCurrentPinch =
                    false;


                dragMouseDownSent =
                    false;


                const currentSnap =
                    snapPoint(
                        freeX,
                        freeY
                    );


                pinchStartTarget =
                    currentSnap.target ||

                    getTargetElement(
                        freeX,
                        freeY,
                        {
                            force: true
                        }
                    ) ||

                    lastHoverTarget;


                airMouseViewportPan =
                    !pinchStartTarget &&
                    shouldPanViewportAt(
                        freeX,
                        freeY
                    );


                airMousePanLastInput =
                    airMouseViewportPan

                        ? {
                            x:
                                inputX,

                            y:
                                inputY
                        }

                        : null;


                if (
                    pinchStartTarget
                ) {
                    const r =
                        pinchStartTarget
                            .getBoundingClientRect();


                    pinchStartPos = {
                        x:
                            r.left +
                            r.width /
                                2,

                        y:
                            r.top +
                            r.height /
                                2
                    };

                } else {
                    pinchStartPos = {
                        ...lastHoverPoint
                    };
                }


                pinchLockPoint = {
                    ...pinchStartPos
                };


                pinchInputAnchor = {
                    x:
                        inputX,

                    y:
                        inputY
                };


                dragTarget =
                    pinchStartTarget;


                isDragging =
                    false;


                mouseCursorX =
                    pinchLockPoint.x;


                mouseCursorY =
                    pinchLockPoint.y;


                E.cursorEl
                    ?.classList
                    .add(
                        "pinching"
                    );
            }

        } else {
            pinchCloseFrames =
                0;


            pinchOpenFrames =
                openCandidate

                    ? pinchOpenFrames +
                        1

                    : 0;


            const movedPx =
                Math.hypot(
                    inputX -
                        pinchInputAnchor.x,

                    inputY -
                        pinchInputAnchor.y
                );


            const heldMs =
                now -
                pinchStartTime;


            if (
                !isDragging &&

                !clickFiredForCurrentPinch &&

                heldMs >=
                    CONFIG.mouse
                        .dragArmMs &&

                movedPx >=
                    CONFIG.mouse
                        .dragThresholdPx &&

                (
                    pinchStartTarget ||
                    airMouseViewportPan
                )
            ) {
                isDragging =
                    true;


                E.cursorEl
                    ?.classList
                    .add(
                        "dragging"
                    );


                if (
                    airMouseViewportPan
                ) {
                    dragMouseDownSent =
                        false;


                    airMousePanLastInput = {
                        x:
                            inputX,

                        y:
                            inputY
                    };


                    applyViewportTransform();

                } else {
                    dragMouseDownSent =
                        true;


                    dispatchMouseDown(
                        pinchStartTarget,
                        pinchStartPos.x,
                        pinchStartPos.y,
                        0
                    );
                }


                mouseCursorX =
                    inputX;


                mouseCursorY =
                    inputY;
            }


            if (
                !isDragging &&

                !clickFiredForCurrentPinch &&

                heldMs >=
                    CONFIG.mouse
                        .clickTriggerMs &&

                pinchStartTarget
            ) {
                fireLeftClick(
                    pinchStartTarget,
                    pinchStartPos.x,
                    pinchStartPos.y,
                    now
                );
            }


            if (
                isDragging
            ) {
                mouseCursorX +=
                    (
                        inputX -
                        mouseCursorX
                    ) *
                    Math.max(
                        alpha,
                        0.62
                    );


                mouseCursorY +=
                    (
                        inputY -
                        mouseCursorY
                    ) *
                    Math.max(
                        alpha,
                        0.62
                    );


                const dragX =
                    clamp(
                        mouseCursorX,
                        0,
                        innerWidth -
                            1
                    );


                const dragY =
                    clamp(
                        mouseCursorY,
                        0,
                        innerHeight -
                            1
                    );


                if (
                    airMouseViewportPan
                ) {
                    const last =
                        airMousePanLastInput ||
                        {
                            x:
                                inputX,

                            y:
                                inputY
                        };


                    panBy(
                        (
                            inputX -
                            last.x
                        ) *
                        CONFIG.pan.handGain,

                        (
                            inputY -
                            last.y
                        ) *
                        CONFIG.pan.handGain
                    );


                    airMousePanLastInput = {
                        x:
                            inputX,

                        y:
                            inputY
                    };

                } else {
                    const moveTarget =
                        getTargetElement(
                            dragX,
                            dragY
                        ) ||

                        dragTarget ||

                        pinchStartTarget;


                    dispatchMouseMove(
                        moveTarget,
                        dragX,
                        dragY,
                        1
                    );
                }

            } else {
                mouseCursorX =
                    pinchLockPoint.x;


                mouseCursorY =
                    pinchLockPoint.y;
            }


            if (
                pinchOpenFrames >=
                CONFIG.mouse
                    .releaseStableFrames
            ) {
                if (
                    isDragging &&
                    airMouseViewportPan
                ) {
                    applyViewportTransform({
                        showIndicator: true
                    });

                } else if (
                    isDragging &&
                    dragMouseDownSent
                ) {
                    const upX =
                        clamp(
                            mouseCursorX,
                            0,
                            innerWidth -
                                1
                        );


                    const upY =
                        clamp(
                            mouseCursorY,
                            0,
                            innerHeight -
                                1
                        );


                    const upTarget =
                        getTargetElement(
                            upX,
                            upY,
                            {
                                force: true
                            }
                        ) ||

                        dragTarget ||

                        pinchStartTarget;


                    dispatchMouseUp(
                        upTarget,
                        upX,
                        upY,
                        0
                    );

                } else if (
                    !clickFiredForCurrentPinch &&
                    pinchStartTarget
                ) {
                    fireLeftClick(
                        pinchStartTarget,
                        pinchStartPos.x,
                        pinchStartPos.y,
                        now
                    );
                }


                resetMousePressState({
                    release: false
                });

            } else if (
                !isDragging &&
                heldMs >
                    CONFIG.mouse
                        .maxClickHoldMs
            ) {
                if (
                    !clickFiredForCurrentPinch &&
                    pinchStartTarget
                ) {
                    fireLeftClick(
                        pinchStartTarget,
                        pinchStartPos.x,
                        pinchStartPos.y,
                        now
                    );
                }


                resetMousePressState({
                    release: false
                });
            }
        }


        const drawX =
            clamp(
                mouseCursorX,
                0,
                innerWidth -
                    1
            );


        const drawY =
            clamp(
                mouseCursorY,
                0,
                innerHeight -
                    1
            );


        if (
            E.cursorEl
        ) {
            E.cursorEl.style.transform =
                `translate3d(${drawX}px, ${drawY}px, 0) translate(-50%, -50%)`;


            E.cursorEl.style.opacity =
                "1";


            E.cursorEl.classList.add(
                "active"
            );
        }


        safeText(
            E.gestureValueEl,

            leftPinchActive &&
            isDragging &&
            airMouseViewportPan

                ? `Mouse · VIEWPORT PAN · ${pinchRatio.toFixed(2)}`

                : leftPinchActive &&
                    isDragging

                    ? `Mouse · DRAG ${pinchRatio.toFixed(2)}`

                    : leftPinchActive &&
                        clickFiredForCurrentPinch

                        ? `Mouse · CLICKED ${pinchRatio.toFixed(2)}`

                        : leftPinchActive

                            ? `Mouse · PINCH ${pinchRatio.toFixed(2)}`

                            : `Mouse · MOVE ${pinchRatio.toFixed(2)}`
        );


        const ext =
            getFingerExtension(
                lm
            );


        const [
            ,
            idxExt,
            midExt,
            ringExt,
            pinkyExt
        ] =
            ext;


        const strictPeace =
            idxExt &&
            midExt &&
            !ringExt &&
            !pinkyExt &&
            !leftPinchActive;


        const middlePinch =
            getPinchRatio(
                lm,
                12
            ) <
                CONFIG.mouse
                    .pinchCloseRatio *
                1.08 &&

            !leftPinchActive;


        const nearEdge =
            drawY <
                CONFIG.mouse
                    .edgeMargin ||

            drawY >
                innerHeight -
                CONFIG.mouse
                    .edgeMargin ||

            drawX <
                CONFIG.mouse
                    .edgeMargin ||

            drawX >
                innerWidth -
                CONFIG.mouse
                    .edgeMargin;


        const rightGesture =
            strictPeace ||
            middlePinch;


        if (
            rightGesture &&
            !nearEdge &&
            now >=
                rightClickCooldownUntil
        ) {
            if (
                !wasRightClickGesture
            ) {
                wasRightClickGesture =
                    true;


                rightClickStartedAt =
                    now;

            } else if (
                now -
                    rightClickStartedAt >=
                CONFIG.mouse
                    .rightClickHoldMs
            ) {
                const snap =
                    snapPoint(
                        drawX,
                        drawY
                    );


                const rx =
                    snap.snapped
                        ? snap.x
                        : drawX;


                const ry =
                    snap.snapped
                        ? snap.y
                        : drawY;


                const target =
                    snap.target ||

                    getTargetElement(
                        rx,
                        ry,
                        {
                            force: true
                        }
                    );


                if (
                    target
                ) {
                    dispatchContextMenu(
                        target,
                        rx,
                        ry
                    );


                    showToast(
                        "Right click",
                        420
                    );
                }


                rightClickCooldownUntil =
                    now +
                    CONFIG.mouse
                        .rightClickCooldownMs;


                wasRightClickGesture =
                    false;


                rightClickStartedAt =
                    0;
            }

        } else if (
            !rightGesture
        ) {
            wasRightClickGesture =
                false;


            rightClickStartedAt =
                0;
        }
    }


    function setMouseEnabled(
        enabled
    ) {
        mouseEnabled =
            !!enabled;


        if (
            !mouseEnabled
        ) {
            resetAirMouseTracking({
                hideCursor: true,
                release: true
            });


            document.body.classList.remove(
                "hand-cursor-active"
            );

        } else {
            finishFistManipulation(
                "mode-change"
            );


            resetAirMouseTracking({
                hideCursor: false,
                release: false
            });


            document.body.classList.add(
                "hand-cursor-active"
            );


            isDrawing =
                false;

            laserActive =
                false;

            highlighterMode =
                false;


            E.laserDot
                ?.classList
                .remove(
                    "active",
                    "highlighter"
                );


            gestureBuffer =
                [];

            handHistory =
                [];

            lastStableGesture =
                "none";

            zoomActive =
                false;

            zoomStableCount =
                0;
        }


        syncToolStates();


        showToast(
            mouseEnabled

                ? "Air mouse ON · pinch to click · pinch-drag to drag/pan"

                : "Air mouse OFF · presentation gestures available",

            1100
        );
    }


    // ============================================================
    // FIST MANIPULATION
    // ============================================================

    function mapFistPoint(
        landmarks
    ) {
        const anchor =
            landmarks?.[9] ||

            (
                landmarks
                    ? getHandCenter(
                        landmarks
                    )
                    : null
            );


        if (
            !anchor
        ) {
            return {
                x:
                    fistX,

                y:
                    fistY,

                anchor:
                    fistLastAnchor
            };
        }


        const nx =
            1 -
            anchor.x;


        const ny =
            anchor.y;


        return {
            x:
                mapRange01(
                    nx,
                    CONFIG.mouse.xMin,
                    CONFIG.mouse.xMax
                ) *
                Math.max(
                    1,
                    innerWidth -
                        1
                ),

            y:
                mapRange01(
                    ny,
                    CONFIG.mouse.yMin,
                    CONFIG.mouse.yMax
                ) *
                Math.max(
                    1,
                    innerHeight -
                        1
                ),

            anchor: {
                x:
                    nx,

                y:
                    ny
            }
        };
    }


    function chooseFistHand(
        hands
    ) {
        if (
            !hands?.length
        ) {
            return null;
        }


        if (
            hands.length ===
                1 ||

            !fistLastAnchor
        ) {
            return hands[0];
        }


        let best =
            hands[0];


        let bestDistance =
            Infinity;


        for (
            const hand
            of hands
        ) {
            const a =
                hand?.[9];


            if (
                !a
            ) {
                continue;
            }


            const p = {
                x:
                    1 -
                    a.x,

                y:
                    a.y
            };


            const d =
                pointDistance(
                    p,
                    fistLastAnchor
                );


            if (
                d <
                bestDistance
            ) {
                bestDistance =
                    d;

                best =
                    hand;
            }
        }


        return best;
    }


    function getFistDragTarget(
        x,
        y
    ) {
        const selector =
            [
                '[draggable="true"]',
                "[data-draggable]",
                ".draggable",
                "button",
                "a[href]",
                "input",
                "select",
                "textarea",
                '[role="button"]',
                '[role="slider"]'
            ].join(",");


        for (
            const raw
            of document.elementsFromPoint(
                x,
                y
            )
        ) {
            if (
                !(
                    raw instanceof
                    Element
                ) ||

                isIgnoredMouseElement(
                    raw
                )
            ) {
                continue;
            }


            const target =
                raw.closest?.(
                    selector
                );


            if (
                target &&
                !isIgnoredMouseElement(
                    target
                )
            ) {
                return target;
            }
        }


        return null;
    }


    function paintFistCursor() {
        if (
            !E.cursorEl
        ) {
            return;
        }


        E.cursorEl.style.transform =
            `translate3d(${fistX}px, ${fistY}px, 0) translate(-50%, -50%)`;


        E.cursorEl.style.opacity =
            "1";


        E.cursorEl.classList.add(
            "active",
            "dragging"
        );
    }


    function beginFistManipulation(
        landmarks
    ) {
        if (
            fistMode ||
            !landmarks
        ) {
            return false;
        }


        const p =
            mapFistPoint(
                landmarks
            );


        fistX =
            clamp(
                p.x,
                0,
                innerWidth -
                    1
            );


        fistY =
            clamp(
                p.y,
                0,
                innerHeight -
                    1
            );


        fistLastAnchor =
            p.anchor;


        fistLastPoint = {
            x:
                fistX,

            y:
                fistY
        };


        fistLastSeenAt =
            performance.now();


        fistOpenFrames =
            0;


        if (
            shouldPanViewportAt(
                fistX,
                fistY
            )
        ) {
            fistMode =
                "pan";


            fistTarget =
                null;


            paintFistCursor();


            applyViewportTransform();


            showToast(
                "✊ Viewport grabbed · move fist to pan",
                750
            );


            return true;
        }


        fistTarget =
            getFistDragTarget(
                fistX,
                fistY
            );


        if (
            !fistTarget
        ) {
            return false;
        }


        fistMode =
            "drag";


        try {
            fistTarget.focus?.({
                preventScroll:
                    true
            });

        } catch (_) {}


        dispatchMouseDown(
            fistTarget,
            fistX,
            fistY,
            0
        );


        paintFistCursor();


        showToast(
            "✊ Grabbed · move hand to drag",
            650
        );


        return true;
    }


    function updateFistManipulation(
        landmarks,
        now
    ) {
        if (
            !fistMode ||
            !landmarks
        ) {
            return;
        }


        const p =
            mapFistPoint(
                landmarks
            );


        const nextX =
            clamp(
                p.x,
                0,
                innerWidth -
                    1
            );


        const nextY =
            clamp(
                p.y,
                0,
                innerHeight -
                    1
            );


        fistLastSeenAt =
            now;


        fistLastAnchor =
            p.anchor;


        if (
            fistMode ===
            "pan"
        ) {
            const last =
                fistLastPoint ||
                {
                    x:
                        nextX,

                    y:
                        nextY
                };


            panBy(
                (
                    nextX -
                    last.x
                ) *
                CONFIG.pan.handGain,

                (
                    nextY -
                    last.y
                ) *
                CONFIG.pan.handGain
            );


            fistX =
                nextX;

            fistY =
                nextY;


            fistLastPoint = {
                x:
                    nextX,

                y:
                    nextY
            };


            safeText(
                E.gestureValueEl,
                `VIEWPORT PAN · X ${Math.round(panX)} · Y ${Math.round(panY)} · open to release`
            );

        } else {
            fistX +=
                (
                    nextX -
                    fistX
                ) *
                0.68;


            fistY +=
                (
                    nextY -
                    fistY
                ) *
                0.68;


            fistLastPoint = {
                x:
                    nextX,

                y:
                    nextY
            };


            const moveTarget =
                getFistDragTarget(
                    fistX,
                    fistY
                ) ||
                fistTarget;


            dispatchMouseMove(
                moveTarget,
                fistX,
                fistY,
                1
            );


            safeText(
                E.gestureValueEl,
                "FIST DRAG · open hand to release"
            );
        }


        paintFistCursor();
    }


    function finishFistManipulation(
        reason = "open"
    ) {
        if (
            !fistMode
        ) {
            return false;
        }


        if (
            fistMode ===
            "drag"
        ) {
            const upTarget =
                getFistDragTarget(
                    fistX,
                    fistY
                ) ||
                fistTarget;


            try {
                dispatchMouseUp(
                    upTarget,
                    fistX,
                    fistY,
                    0
                );

            } catch (_) {}
        }


        fistMode =
            null;


        fistTarget =
            null;


        fistLastPoint =
            null;


        fistLastAnchor =
            null;


        fistOpenFrames =
            0;


        E.cursorEl
            ?.classList
            .remove(
                "dragging",
                "pinching"
            );


        if (
            E.cursorEl
        ) {
            E.cursorEl.style.opacity =
                "0";
        }


        applyViewportTransform({
            showIndicator: true
        });


        openNavigationLockedUntil =
            performance.now() +
            CONFIG.gesture
                .postManipulationLockMs;


        openNavigationArmed =
            false;


        gestureBuffer =
            [];


        handHistory =
            [];


        lastStableGesture =
            "open";


        showToast(
            reason ===
                "open"

                ? "✋ Released · next-slide gesture briefly locked"

                : "Manipulation safely released",

            900
        );


        return true;
    }


    function handleFistHandLoss(
        now
    ) {
        if (
            fistMode &&

            now -
                fistLastSeenAt >=
                CONFIG.pan
                    .lostHandReleaseMs
        ) {
            finishFistManipulation(
                "tracking-lost"
            );
        }
    }


    // ============================================================
    // GESTURE ACTIONS
    // ============================================================

    function updateConfidence(
        value
    ) {
        const clamped =
            clamp(
                Number(value) ||
                    0,
                0,
                100
            );


        if (
            E.confidenceBar
        ) {
            E.confidenceBar.style.width =
                `${clamped}%`;
        }


        safeText(
            E.confidenceValue,
            `${Math.round(clamped)}%`
        );
    }


    function showGestureBadge(
        gesture
    ) {
        if (
            !E.gestureStatus
        ) {
            return;
        }


        const emojis = {
            open:
                "✋",

            fist:
                "✊",

            shaka:
                "🤙",

            peace:
                "✌️",

            point:
                "👆",

            thumbsup:
                "👍",

            thumbsdown:
                "👎",

            swipeLeft:
                "⬅️",

            swipeRight:
                "➡️",

            swipeUp:
                "⬆️",

            swipeDown:
                "⬇️"
        };


        E.gestureStatus.textContent =
            emojis[
                gesture
            ] ||
            "✋";


        E.gestureStatus
            .classList
            .add(
                "show"
            );


        clearTimeout(
            E.gestureStatus
                ._hideTimer
        );


        E.gestureStatus._hideTimer =
            setTimeout(
                () =>
                    E.gestureStatus
                        ?.classList
                        .remove(
                            "show"
                        ),

                650
            );
    }


    function handleShakaMouseActivation(
        gesture,
        now
    ) {
        if (
            fistMode ||
            mouseEnabled
        ) {
            return false;
        }


        if (
            gesture ===
            "shaka"
        ) {
            shakaLastSeenAt =
                now;


            if (
                !shakaHoldStartedAt
            ) {
                shakaHoldStartedAt =
                    now;
            }


            const elapsed =
                now -
                shakaHoldStartedAt;


            const remaining =
                Math.max(
                    0,

                    CONFIG.gesture
                        .shakaHoldMs -
                        elapsed
                );


            safeText(
                E.gestureValueEl,
                `🤙 Hold for Air Mouse · ${(remaining / 1000).toFixed(1)}s`
            );


            safeText(
                E.gestureMetric,
                "shaka-hold"
            );


            updateConfidence(
                Math.min(
                    100,

                    elapsed /
                    CONFIG.gesture
                        .shakaHoldMs *
                    100
                )
            );


            if (
                elapsed >=
                    CONFIG.gesture
                        .shakaHoldMs &&

                !shakaMouseTriggered
            ) {
                shakaMouseTriggered =
                    true;


                gestureBuffer =
                    [];


                handHistory =
                    [];


                lastStableGesture =
                    "none";


                setMouseEnabled(
                    true
                );
            }


            return true;
        }


        if (
            shakaHoldStartedAt &&

            now -
                shakaLastSeenAt <=
                CONFIG.gesture
                    .shakaBreakGraceMs
        ) {
            return true;
        }


        shakaHoldStartedAt =
            0;


        shakaLastSeenAt =
            0;


        shakaMouseTriggered =
            false;


        return false;
    }


    function dispatchAction(
        gesture,
        landmarks,
        now
    ) {
        if (
            !gestureNavigationEnabled ||
            mouseEnabled ||
            gesture === "none"
        ) {
            return;
        }


        if (
            gesture ===
                "open" &&

            fistMode
        ) {
            finishFistManipulation(
                "open"
            );

            return;
        }


        if (
            now <
            gestureActionBlockedUntil
        ) {
            return;
        }


        if (
            highlighterMode &&

            [
                "open",
                "fist",
                "swipeLeft",
                "swipeRight"
            ].includes(
                gesture
            )
        ) {
            return;
        }


        showGestureBadge(
            gesture
        );


        safeText(
            E.gestureValueEl,
            gesture
        );


        safeText(
            E.gestureMetric,
            gesture
        );


        updateConfidence(
            100
        );


        switch (
            gesture
        ) {
            case "open":

                if (
                    now <
                        openNavigationLockedUntil ||

                    !openNavigationArmed
                ) {
                    return;
                }


                nextSlide();


                openNavigationArmed =
                    false;


                break;


            case "fist":

                beginFistManipulation(
                    landmarks
                );


                break;


            case "swipeRight":

                nextSlide();


                handHistory =
                    [];


                break;


            case "swipeLeft":

                prevSlide();


                handHistory =
                    [];


                break;


            case "peace":

                void toggleFullscreen();


                break;


            case "point":

                toggleLaser();


                break;


            case "thumbsup":

                if (
                    !autoPlay
                ) {
                    toggleAutoPlay(
                        true
                    );
                }


                break;


            case "thumbsdown":

                if (
                    autoPlay
                ) {
                    toggleAutoPlay(
                        false
                    );
                }


                break;


            default:

                return;
        }


        gestureActionBlockedUntil =
            now +
            CONFIG.gesture
                .actionCooldownMs;
    }


    function resolveStableGesture(
        gesture
    ) {
        gestureBuffer.push(
            gesture
        );


        while (
            gestureBuffer.length >
            CONFIG.gesture
                .bufferSize
        ) {
            gestureBuffer.shift();
        }


        const counts =
            new Map();


        for (
            const item
            of gestureBuffer
        ) {
            if (
                item ===
                "none"
            ) {
                continue;
            }


            counts.set(
                item,
                (
                    counts.get(
                        item
                    ) ||
                    0
                ) +
                1
            );
        }


        let best =
            "none";


        let bestCount =
            0;


        for (
            const [
                name,
                count
            ]
            of counts
        ) {
            if (
                count >
                bestCount
            ) {
                best =
                    name;

                bestCount =
                    count;
            }
        }


        return (
            bestCount >=
                CONFIG.gesture
                    .confidenceFrames

                ? best

                : "none"
        );
    }


    function processPresentationHands(
        hands,
        now
    ) {
        const handCount =
            hands.length;


        E.cursorEl
            ?.classList
            .remove(
                "active",
                "pinching",
                "dragging",
                "right-click"
            );


        if (
            E.cursorEl &&
            !fistMode
        ) {
            E.cursorEl.style.opacity =
                "0";
        }


        if (
            fistMode
        ) {
            const hand =
                chooseFistHand(
                    hands
                );


            if (
                hand
            ) {
                updateFistManipulation(
                    hand,
                    now
                );


                if (
                    recognizeGesture(
                        hand
                    ) ===
                    "open"
                ) {
                    fistOpenFrames++;


                    if (
                        fistOpenFrames >=
                        CONFIG.pan
                            .releaseStableFrames
                    ) {
                        finishFistManipulation(
                            "open"
                        );
                    }

                } else {
                    fistOpenFrames =
                        0;
                }

            } else {
                handleFistHandLoss(
                    now
                );
            }
        }


        const zoomAllowed =
            !highlighterMode &&
            !fistMode;


        if (
            zoomAllowed &&
            handCount ===
                2
        ) {
            zoomStableCount =
                Math.min(
                    CONFIG.zoom
                        .stableFrames +
                        1,

                    zoomStableCount +
                        1
                );

        } else {
            zoomStableCount =
                Math.max(
                    0,
                    zoomStableCount -
                        1
                );
        }


        if (
            zoomAllowed &&
            handCount ===
                2 &&

            zoomStableCount >=
                CONFIG.zoom
                    .stableFrames
        ) {
            const c1 =
                getHandCenter(
                    hands[0]
                );


            const c2 =
                getHandCenter(
                    hands[1]
                );


            const dist =
                Math.hypot(
                    c1.x -
                        c2.x,

                    c1.y -
                        c2.y
                );


            if (
                !zoomActive
            ) {
                zoomActive =
                    true;


                baseDist =
                    dist;


                baseZoom =
                    currentZoom;

            } else if (
                baseDist >
                1e-6
            ) {
                const nextZoom =
                    clamp(
                        baseZoom *
                        (
                            dist /
                            baseDist
                        ),

                        CONFIG.zoom.min,
                        CONFIG.zoom.max
                    );


                const midX =
                    1 -
                    (
                        c1.x +
                        c2.x
                    ) /
                    2;


                const midY =
                    (
                        c1.y +
                        c2.y
                    ) /
                    2;


                applyZoom(
                    nextZoom,
                    midX *
                        innerWidth,
                    midY *
                        innerHeight
                );
            }


            gestureBuffer =
                [];


            handHistory =
                [];


            lastStableGesture =
                "none";


            if (
                laserActive
            ) {
                updateLaser(
                    hands[0]
                );
            }


            return;
        }


        zoomActive =
            false;


        if (
            handCount !==
            1
        ) {
            if (
                !handCount
            ) {
                gestureBuffer =
                    [];


                handHistory =
                    [];


                lastStableGesture =
                    "none";


                openNavigationArmed =
                    true;


                handleShakaMouseActivation(
                    "none",
                    now
                );


                handleFistHandLoss(
                    now
                );


                updateLaser(
                    null
                );


                updateConfidence(
                    0
                );
            }


            return;
        }


        const hand =
            hands[0];


        const rawGesture =
            recognizeGesture(
                hand
            );


        const shakaConsumed =
            handleShakaMouseActivation(
                rawGesture,
                now
            );


        const effectiveGesture =
            shakaConsumed
                ? "none"
                : rawGesture;


        if (
            !fistMode &&
            effectiveGesture !==
                "open"
        ) {
            openNavigationArmed =
                true;
        }


        const center =
            getHandCenter(
                hand
            );


        handHistory.push(
            center
        );


        while (
            handHistory.length >
            CONFIG.gesture
                .swipeHistory
        ) {
            handHistory.shift();
        }


        let swipe =
            null;


        if (
            !fistMode &&

            effectiveGesture !==
                "fist" &&

            effectiveGesture !==
                "open" &&

            !highlighterMode &&

            handHistory.length >=
                CONFIG.gesture
                    .swipeHistory
        ) {
            swipe =
                detectSwipe(
                    handHistory
                );
        }


        const candidate =
            effectiveGesture ===
                "fist" ||

            effectiveGesture ===
                "open"

                ? effectiveGesture

                : (
                    swipe ||
                    effectiveGesture
                );


        const stable =
            resolveStableGesture(
                candidate
            );


        if (
            stable !==
            lastStableGesture
        ) {
            lastStableGesture =
                stable;


            if (
                stable !==
                "none"
            ) {
                dispatchAction(
                    stable,
                    hand,
                    now
                );
            }
        }


        if (
            laserActive
        ) {
            updateLaser(
                hand
            );

        } else {
            updateLaser(
                null
            );
        }
    }


function processHands(
    hands,
    now
) {
    safeText(
        E.handCountValue,
        hands.length
    );

    window.dispatchEvent(
        new CustomEvent("velosHandsDetected", {
            detail: {
                hands,
                landmarks: hands?.[0] || null,
                timestamp: now
            }
        })
    );

    if (
        mouseEnabled
    ) {
        updateMouse(
            hands,
            now
        );

        zoomActive =
            false;

        zoomStableCount =
            0;

        gestureBuffer =
            [];

        handHistory =
            [];

        lastStableGesture =
            "none";

        isDrawing =
            false;

        E.laserDot
            ?.classList
            .remove(
                "active",
                "highlighter"
            );

    } else {
        processPresentationHands(
            hands,
            now
        );
    }
}



    // ============================================================
    // CAMERA / MODEL
    // ============================================================

    function setCameraState(
        label,
        state = "busy"
    ) {
        safeText(
            E.cameraState,
            `Camera ${label.toLowerCase()}`
        );


        safeText(
            E.cameraFooterState,
            label === "Ready"
                ? "Tracking available"
                : label
        );


        safeText(
            E.cameraLiveText,
            label === "Ready"
                ? "LIVE"
                : label.toUpperCase()
        );


        safeText(
            E.cameraBadgeText,
            label === "Ready"
                ? "Camera ready"
                : `Camera ${label.toLowerCase()}`
        );


        [
            E.cameraStateDot,
            E.cameraLiveDot,
            E.cameraBadgeDot
        ].forEach(
            (dot) => {
                if (
                    !dot
                ) {
                    return;
                }


                dot.classList.remove(
                    "online",
                    "busy",
                    "offline"
                );


                dot.classList.add(
                    state
                );
            }
        );
    }


    function setModelState(
        label
    ) {
        safeText(
            E.modelState,
            label
        );


        safeText(
            E.modelStateMini,
            label
        );


        safeText(
            E.settingsModelState,
            label
        );
    }


    async function createHandLandmarker(
        delegate
    ) {
        const fileset =
            await FilesetResolver.forVisionTasks(
                MEDIAPIPE_WASM_URL
            );


        return HandLandmarker.createFromOptions(
            fileset,
            {
                baseOptions: {
                    modelAssetPath:
                        HAND_MODEL_URL,

                    ...(
                        delegate
                            ? {
                                delegate
                            }
                            : {}
                    )
                },

                numHands:
                    2,

                minHandDetectionConfidence:
                    0.55,

                minHandPresenceConfidence:
                    0.55,

                minTrackingConfidence:
                    0.55,

                runningMode:
                    "VIDEO"
            }
        );
    }


    async function initModel() {
        setModelState(
            "Loading"
        );


        try {
            landmarker =
                await createHandLandmarker(
                    "GPU"
                );

        } catch (
            gpuError
        ) {
            console.warn(
                "GPU MediaPipe init failed; retrying without GPU delegate.",
                gpuError
            );


            landmarker =
                await createHandLandmarker(
                    null
                );
        }


        setModelState(
            "Ready"
        );
    }


    async function initCam() {
        if (
            !navigator.mediaDevices
                ?.getUserMedia
        ) {
            throw new Error(
                "Camera API is not available in this browser."
            );
        }


        cameraStream =
            await navigator
                .mediaDevices
                .getUserMedia({
                    video: {
                        width: {
                            ideal:
                                CONFIG.camera.width
                        },

                        height: {
                            ideal:
                                CONFIG.camera.height
                        },

                        aspectRatio: {
                            ideal:
                                16 /
                                9
                        },

                        frameRate: {
                            ideal:
                                CONFIG.camera.fps,

                            max:
                                CONFIG.camera.fps
                        },

                        facingMode:
                            "user"
                    },

                    audio:
                        false
                });


        const track =
            cameraStream
                .getVideoTracks()[0];


        E.video.srcObject =
            cameraStream;


        E.pipVideo.srcObject =
            cameraStream;


        await Promise.all([
            E.video.play(),
            E.pipVideo.play()
        ]);


        const settings =
            track.getSettings?.() ||
            {};


        const actualW =
            settings.width ||
            E.video.videoWidth ||
            CONFIG.camera.width;


        const actualH =
            settings.height ||
            E.video.videoHeight ||
            CONFIG.camera.height;


        safeText(
            E.cameraResolutionLabel,
            `${actualW} × ${actualH}`
        );


        if (
            track.label
        ) {
            safeText(
                E.cameraDeviceLabel,
                track.label
            );
        }


        safeText(
            E.cameraFooterState,
            "Full-frame camera preview · optimized tracking"
        );


        resizePipOverlay();


        setCameraState(
            "Ready",
            "online"
        );
    }


    // ============================================================
    // MAIN DETECTION LOOP - PERFORMANCE SAFE
    // ============================================================

    function updateFps(
        now
    ) {
        inferenceFrameCount++;


        if (
            now -
                lastFpsTime <
            600
        ) {
            return;
        }


        const fps =
            Math.round(
                inferenceFrameCount /
                (
                    (
                        now -
                        lastFpsTime
                    ) /
                    1000
                )
            );


        inferenceFrameCount =
            0;


        lastFpsTime =
            now;


        safeText(
            E.fpsEl,
            `FPS: ${fps}`
        );


        safeText(
            E.fpsMetric,
            `${fps} fps`
        );
    }


    function processFrame(
        now
    ) {
        if (
            !running
        ) {
            return;
        }


        /*
         * Schedule the next frame first.
         * Even if a gesture/UI operation throws, the animation loop survives.
         */
        rafId =
            requestAnimationFrame(
                processFrame
            );


        try {
            if (
                document.hidden ||
                !E.video ||
                E.video.readyState <
                    2
            ) {
                return;
            }


            const previewInterval =
                1000 /
                CONFIG.performance
                    .previewFps;


            const inferenceInterval =
                1000 /
                CONFIG.performance
                    .inferenceFps;


            const previewDue =
                now -
                    lastPreviewAt >=
                previewInterval;


            const inferenceDue =
                !!landmarker &&

                !inferenceBusy &&

                now -
                    lastInferenceAt >=
                    inferenceInterval &&

                E.video.currentTime !==
                    lastVideoTime;


            if (
                inferenceDue
            ) {
                /*
                 * One and only one MediaPipe detectForVideo() call
                 * can be active here.
                 */
                inferenceBusy =
                    true;


                lastInferenceAt =
                    now;


                lastVideoTime =
                    E.video.currentTime;


                try {
                    const result =
                        landmarker.detectForVideo(
                            E.video,
                            now
                        );


                    lastHands =
                        result?.landmarks ||
                        [];


                    processHands(
                        lastHands,
                        now
                    );


                    updateFps(
                        now
                    );

                } catch (
                    error
                ) {
                    logFrameError(
                        error
                    );

                } finally {
                    /*
                     * CRITICAL:
                     * Never leave this true.
                     *
                     * This prevents the permanent
                     * "tracking froze after one frame"
                     * condition.
                     */
                    inferenceBusy =
                        false;
                }
            }


            if (
                previewDue
            ) {
                lastPreviewAt =
                    now;


                drawPreview(
                    lastHands
                );
            }

        } catch (
            error
        ) {
            /*
             * A single UI/gesture exception must never
             * stop hand tracking.
             */
            inferenceBusy =
                false;


            logFrameError(
                error
            );
        }
    }


    function startLoop() {
        if (
            running
        ) {
            return;
        }


        running =
            true;


        lastInferenceAt =
            0;


        lastPreviewAt =
            0;


        lastVideoTime =
            -1;


        lastFpsTime =
            performance.now();


        rafId =
            requestAnimationFrame(
                processFrame
            );
    }


    function stopLoop() {
        running =
            false;


        if (
            rafId
        ) {
            cancelAnimationFrame(
                rafId
            );
        }


        rafId =
            0;


        inferenceBusy =
            false;
    }


    // ============================================================
    // WORKSPACE UI
    // ============================================================

    function currentSlidePosition() {
        return (
            isPdfLoaded &&
            pdfDoc

                ? {
                    index:
                        currentPage,

                    total:
                        totalPages,

                    label:
                        "Page"
                }

                : {
                    index:
                        defaultIndex,

                    total:
                        defaultSlides.length,

                    label:
                        "Slide"
                }
        );
    }


    function updateDeckUI(
        sourceName = null
    ) {
        const position =
            currentSlidePosition();


        const page =
            position.index +
            1;


        const total =
            Math.max(
                1,
                position.total
            );


        const progress =
            clamp(
                Math.round(
                    page /
                    total *
                    100
                ),

                0,
                100
            );


        const isPdf =
            !!(
                isPdfLoaded &&
                pdfDoc
            );


        if (
            sourceName
        ) {
            pdfFileName =
                sourceName;
        }


        const deckName =
            isPdf
                ? pdfFileName
                : "Velos";


        safeText(
            E.deckTitleTop,
            deckName
        );


        safeText(
            E.deckTitleSide,
            deckName
        );


        safeText(
            E.footerDeckName,
            deckName
        );


        safeText(
            E.deckMetaTop,

            isPdf
                ? `${total} PDF pages · local file`
                : `${total} built-in slides · ready to present`
        );


        safeText(
            E.deckMetaSide,

            isPdf
                ? "Local PDF presentation"
                : "Built-in presentation"
        );


        safeText(
            E.deckTypeLabel,

            isPdf
                ? "PDF"
                : "Demo"
        );


        safeText(
            E.leftPanelMeta,

            `${total} ${
                isPdf
                    ? "pages"
                    : "slides"
            }`
        );


        safeText(
            E.settingsDeckPages,
            total
        );


        safeText(
            E.settingsDeckSource,

            isPdf
                ? "Local PDF loaded from this device."
                : "Built-in demonstration slides."
        );


        if (
            E.deckProgress
        ) {
            E.deckProgress.style.width =
                `${progress}%`;
        }


        safeText(
            E.deckProgressText,
            `${progress}%`
        );


        safeText(
            E.footerPage,
            `${position.label} ${page} of ${total}`
        );


        if (
            screenShareActive
        ) {
            safeText(
                E.stageTitle,
                "Live Screen"
            );


            safeText(
                E.stageMeta,
                "Live screen sharing · camera hand tracking remains active"
            );

        } else {
            safeText(
                E.stageTitle,
                deckName
            );


            safeText(
                E.stageMeta,
                `${position.label} ${page} of ${total} · gesture input ${
                    gestureNavigationEnabled
                        ? "enabled"
                        : "paused"
                }`
            );
        }
    }


    function syncToolStates() {
        E.laserBtn
            ?.classList
            .toggle(
                "active",
                laserActive
            );


        E.highlightBtn
            ?.classList
            .toggle(
                "active",
                highlighterMode
            );


        E.mouseToggleBtn
            ?.classList
            .toggle(
                "active",
                mouseEnabled
            );


        E.mouseToggleBtn
            ?.classList
            .toggle(
                "mouse-on",
                mouseEnabled
            );


        E.autoBtn
            ?.classList
            .toggle(
                "active",
                autoPlay
            );


        E.laserToolBtn
            ?.classList
            .toggle(
                "active",
                laserActive
            );


        E.highlightToolBtn
            ?.classList
            .toggle(
                "active",
                highlighterMode
            );


        E.mouseToolBtn
            ?.classList
            .toggle(
                "active",
                mouseEnabled
            );


        E.mouseToolBtn
            ?.classList
            .toggle(
                "mouse-on",
                mouseEnabled
            );


        E.autoToolBtn
            ?.classList
            .toggle(
                "active",
                autoPlay
            );


        safeText(
            E.laserToolState,
            laserActive
                ? "On"
                : "Off"
        );


        safeText(
            E.highlightToolState,
            highlighterMode
                ? "On"
                : "Off"
        );


        safeText(
            E.mouseToolState,
            mouseEnabled
                ? "On"
                : "Off"
        );


        safeText(
            E.autoToolState,
            autoPlay
                ? "On"
                : "Off"
        );


        safeText(
            E.workspaceMode,

            mouseEnabled
                ? "Air mouse"

                : screenShareActive
                    ? "Live screen"

                    : highlighterMode
                        ? "Highlight"

                        : laserActive
                            ? "Laser"

                            : "Gesture"
        );


        safeText(
            E.modeBadge,

            mouseEnabled
                ? "Air mouse mode"

                : screenShareActive
                    ? "Live screen mode"

                    : highlighterMode
                        ? "Highlight mode"

                        : laserActive
                            ? "Laser mode"

                            : gestureNavigationEnabled
                                ? "Gesture mode"

                                : "Manual mode"
        );
    }


    // ============================================================
    // SETTINGS / THEME / CLOCK
    // ============================================================

    function openSettings() {
        E.settingsDrawer
            ?.classList
            .add(
                "show"
            );


        E.backdrop
            ?.classList
            .add(
                "show"
            );
    }


    function closeSettings() {
        E.settingsDrawer
            ?.classList
            .remove(
                "show"
            );


        if (
            !E.shortcutsModal
                ?.classList
                .contains(
                    "show"
                )
        ) {
            E.backdrop
                ?.classList
                .remove(
                    "show"
                );
        }
    }


    function openShortcuts() {
        E.shortcutsModal
            ?.classList
            .add(
                "show"
            );


        E.backdrop
            ?.classList
            .add(
                "show"
            );
    }


    function closeShortcuts() {
        E.shortcutsModal
            ?.classList
            .remove(
                "show"
            );


        if (
            !E.settingsDrawer
                ?.classList
                .contains(
                    "show"
                )
        ) {
            E.backdrop
                ?.classList
                .remove(
                    "show"
                );
        }
    }


    function toggleShortcuts() {
        if (
            E.shortcutsModal
                ?.classList
                .contains(
                    "show"
                )
        ) {
            closeShortcuts();

        } else {
            openShortcuts();
        }
    }


    function closeOverlays() {
        closeSettings();

        closeShortcuts();
    }


    function setTheme(
        theme
    ) {
        const next =
            theme ===
                "light"
                ? "light"
                : "dark";


        document.body.dataset.theme =
            next;


        if (
            E.themeSelect
        ) {
            E.themeSelect.value =
                next;
        }


        try {
            localStorage.setItem(
                "velos-theme",
                next
            );

        } catch (_) {}
    }


    function toggleTheme() {
        setTheme(
            document.body.dataset.theme ===
                "light"

                ? "dark"

                : "light"
        );
    }


    function loadSavedPreferences() {
        try {
            const saved =
                localStorage.getItem(
                    "velos-theme"
                ) ||

                localStorage.getItem(
                    "gestureflow-theme"
                );


            if (
                saved ===
                    "light" ||

                saved ===
                    "dark"
            ) {
                setTheme(
                    saved
                );
            }

        } catch (_) {}
    }


    function setCameraPreviewVisible(
        visible
    ) {
        document.body.classList.toggle(
            "pip-hidden",
            !visible
        );


        if (
            E.cameraPreviewSwitch
        ) {
            E.cameraPreviewSwitch.checked =
                visible;
        }


        if (
            E.drawerCameraSwitch
        ) {
            E.drawerCameraSwitch.checked =
                visible;
        }
    }


    function setAutoHidePanels(
        enabled
    ) {
        autoHidePanels =
            !!enabled;


        if (
            E.autoHideSwitch
        ) {
            E.autoHideSwitch.checked =
                autoHidePanels;
        }


        if (
            E.drawerAutoHideSwitch
        ) {
            E.drawerAutoHideSwitch.checked =
                autoHidePanels;
        }
    }


    function updateClockAndSession() {
        const now =
            new Date();


        const elapsed =
            Math.max(
                0,
                Math.floor(
                    (
                        Date.now() -
                        sessionStartedAt
                    ) /
                    1000
                )
            );


        const minutes =
            Math.floor(
                elapsed /
                60
            );


        const seconds =
            elapsed %
            60;


        safeText(
            E.sessionElapsed,

            `${String(minutes).padStart(
                2,
                "0"
            )}:${String(seconds).padStart(
                2,
                "0"
            )}`
        );


        safeText(
            E.liveClock,

            now.toLocaleTimeString(
                [],
                {
                    hour:
                        "2-digit",

                    minute:
                        "2-digit"
                }
            )
        );
    }


    function handleFullscreenChange() {
        if (
            !document.fullscreenElement ||
            !autoHidePanels
        ) {
            return;
        }


        document.body.classList.add(
            "panel-collapsed-left",
            "panel-collapsed-right"
        );


        E.sidebarToggle
            ?.classList
            .remove(
                "active"
            );


        E.inspectorToggle
            ?.classList
            .remove(
                "active"
            );
    }


    // ============================================================
    // EVENTS
    // ============================================================

    function installEvents() {
        E.prevBtn
            ?.addEventListener(
                "click",
                prevSlide
            );


        E.nextBtn
            ?.addEventListener(
                "click",
                nextSlide
            );


        E.fullscreenBtn
            ?.addEventListener(
                "click",
                () =>
                    void toggleFullscreen()
            );


        E.autoBtn
            ?.addEventListener(
                "click",
                () =>
                    toggleAutoPlay()
            );


        E.highlightBtn
            ?.addEventListener(
                "click",
                () =>
                    toggleHighlighter()
            );


        E.resetZoomBtn
            ?.addEventListener(
                "click",
                resetZoom
            );


        E.fitBtn
            ?.addEventListener(
                "click",
                resetZoom
            );


        E.clearInkBtn
            ?.addEventListener(
                "click",
                () => {
                    clearDrawCanvas();


                    showToast(
                        "Annotations cleared"
                    );
                }
            );


        E.laserToolBtn
            ?.addEventListener(
                "click",
                () =>
                    E.laserBtn?.click()
            );


        E.highlightToolBtn
            ?.addEventListener(
                "click",
                () =>
                    E.highlightBtn?.click()
            );


        E.mouseToolBtn
            ?.addEventListener(
                "click",
                () =>
                    E.mouseToggleBtn?.click()
            );


        E.autoToolBtn
            ?.addEventListener(
                "click",
                () =>
                    E.autoBtn?.click()
            );


        E.sidebarToggle
            ?.addEventListener(
                "click",
                () => {
                    const collapsed =
                        document.body
                            .classList
                            .toggle(
                                "panel-collapsed-left"
                            );


                    E.sidebarToggle
                        .classList
                        .toggle(
                            "active",
                            !collapsed
                        );


                    scheduleResizeWork(
                        220
                    );
                }
            );


        E.inspectorToggle
            ?.addEventListener(
                "click",
                () => {
                    const collapsed =
                        document.body
                            .classList
                            .toggle(
                                "panel-collapsed-right"
                            );


                    E.inspectorToggle
                        .classList
                        .toggle(
                            "active",
                            !collapsed
                        );


                    scheduleResizeWork(
                        220
                    );
                }
            );


        E.settingsBtn
            ?.addEventListener(
                "click",
                openSettings
            );


        E.shortcutsBtn
            ?.addEventListener(
                "click",
                openShortcuts
            );


        E.closeSettingsBtn
            ?.addEventListener(
                "click",
                closeSettings
            );


        E.closeShortcutsBtn
            ?.addEventListener(
                "click",
                closeShortcuts
            );


        E.backdrop
            ?.addEventListener(
                "click",
                closeOverlays
            );


        E.themeBtn
            ?.addEventListener(
                "click",
                toggleTheme
            );


        E.themeSelect
            ?.addEventListener(
                "change",
                (event) =>
                    setTheme(
                        event.target.value
                    )
            );


        E.compactSwitch
            ?.addEventListener(
                "change",
                (event) => {
                    document.body.classList.toggle(
                        "compact-mode",
                        event.target.checked
                    );


                    scheduleResizeWork(
                        100
                    );
                }
            );


        E.reducedMotionSwitch
            ?.addEventListener(
                "change",
                (event) => {
                    document.body.classList.toggle(
                        "reduced-motion",
                        event.target.checked
                    );
                }
            );


        E.gestureModeSwitch
            ?.addEventListener(
                "change",
                (event) => {
                    gestureNavigationEnabled =
                        event.target.checked;


                    if (
                        !gestureNavigationEnabled
                    ) {
                        gestureBuffer =
                            [];


                        handHistory =
                            [];


                        lastStableGesture =
                            "none";


                        finishFistManipulation(
                            "mode-change"
                        );
                    }


                    updateDeckUI();

                    syncToolStates();


                    showToast(
                        gestureNavigationEnabled
                            ? "Gesture navigation enabled"
                            : "Gesture navigation paused"
                    );
                }
            );


        E.cameraPreviewSwitch
            ?.addEventListener(
                "change",
                (event) =>
                    setCameraPreviewVisible(
                        event.target.checked
                    )
            );


        E.drawerCameraSwitch
            ?.addEventListener(
                "change",
                (event) =>
                    setCameraPreviewVisible(
                        event.target.checked
                    )
            );


        E.autoHideSwitch
            ?.addEventListener(
                "change",
                (event) =>
                    setAutoHidePanels(
                        event.target.checked
                    )
            );


        E.drawerAutoHideSwitch
            ?.addEventListener(
                "change",
                (event) =>
                    setAutoHidePanels(
                        event.target.checked
                    )
            );


        E.pipToggleBtn
            ?.addEventListener(
                "click",
                () => {
                    setCameraPreviewVisible(
                        false
                    );


                    showToast(
                        "Camera preview hidden"
                    );
                }
            );


        E.screenShareBtn
            ?.addEventListener(
                "click",
                async () => {
                    if (
                        screenShareActive
                    ) {
                        stopScreenShare();

                    } else {
                        await startScreenShare();
                    }
                }
            );


        E.mouseToggleBtn
            ?.addEventListener(
                "click",
                () =>
                    setMouseEnabled(
                        !mouseEnabled
                    )
            );


        E.laserBtn
            ?.addEventListener(
                "click",
                () =>
                    toggleLaser()
            );


        E.fileInput
            ?.addEventListener(
                "change",
                async (event) => {
                    const file =
                        event.target
                            .files?.[0];


                    if (
                        !file
                    ) {
                        return;
                    }


                    try {
                        await loadPDF(
                            file
                        );

                    } catch (
                        error
                    ) {
                        showToast(
                            `❌ Error loading PDF: ${error.message}`,
                            2200
                        );


                        console.error(
                            error
                        );

                    } finally {
                        E.fileInput.value =
                            "";
                    }
                }
            );


        document.addEventListener(
            "fullscreenchange",
            () => {
                handleFullscreenChange();


                scheduleResizeWork(
                    80
                );
            }
        );


        document.addEventListener(
            "keydown",
            handleKeydown
        );


        window.addEventListener(
            "resize",
            () =>
                scheduleResizeWork(
                    80
                ),
            {
                passive: true
            }
        );


        window.addEventListener(
            "beforeunload",
            cleanup,
            {
                once: true
            }
        );


        document.addEventListener(
            "visibilitychange",
            () => {
                if (
                    document.hidden
                ) {
                    resetMousePressState({
                        release: true
                    });


                    finishFistManipulation(
                        "visibility-change"
                    );

                } else {
                    lastVideoTime =
                        -1;


                    lastInferenceAt =
                        0;
                }
            }
        );
    }


    function handleKeydown(
        event
    ) {
        const tag =
            event.target
                ?.tagName
                ?.toLowerCase?.();


        if (
            [
                "input",
                "textarea",
                "select"
            ].includes(
                tag
            ) ||

            event.target
                ?.isContentEditable
        ) {
            return;
        }


        const key =
            event.key.length ===
                1

                ? event.key
                    .toLowerCase()

                : event.key;


        if (
            event.altKey &&
            canPanViewport()
        ) {
            const step =
                CONFIG.pan
                    .keyboardStepPx;


            if (
                key ===
                "ArrowRight"
            ) {
                panBy(
                    step,
                    0,
                    {
                        showIndicator:
                            true
                    }
                );

            } else if (
                key ===
                "ArrowLeft"
            ) {
                panBy(
                    -step,
                    0,
                    {
                        showIndicator:
                            true
                    }
                );

            } else if (
                key ===
                "ArrowDown"
            ) {
                panBy(
                    0,
                    step,
                    {
                        showIndicator:
                            true
                    }
                );

            } else if (
                key ===
                "ArrowUp"
            ) {
                panBy(
                    0,
                    -step,
                    {
                        showIndicator:
                            true
                    }
                );

            } else {
                return;
            }


            event.preventDefault();


            return;
        }


        if (
            key ===
            "ArrowRight"
        ) {
            nextSlide();

        } else if (
            key ===
            "ArrowLeft"
        ) {
            prevSlide();

        } else if (
            key ===
            "f"
        ) {
            void toggleFullscreen();

        } else if (
            key ===
            "a"
        ) {
            toggleAutoPlay();

        } else if (
            key ===
            "h"
        ) {
            toggleHighlighter();

        } else if (
            key ===
            "m"
        ) {
            setMouseEnabled(
                !mouseEnabled
            );

        } else if (
            key ===
            "l"
        ) {
            toggleLaser();

        } else if (
            key ===
            "r"
        ) {
            resetZoom();

        } else if (
            key ===
            "c"
        ) {
            clearDrawCanvas();

        } else if (
            key ===
            "s"
        ) {
            screenShareActive
                ? stopScreenShare()
                : void startScreenShare();

        } else if (
            key ===
            "?"
        ) {
            toggleShortcuts();

        } else if (
            key ===
            "Escape"
        ) {
            closeOverlays();
        }
    }


    function scheduleResizeWork(
        delay = 80
    ) {
        if (
            resizeTimer
        ) {
            clearTimeout(
                resizeTimer
            );
        }


        resizeTimer =
            setTimeout(
                () => {
                    resizeTimer =
                        null;


                    resizePipOverlay();

                    resizeDrawCanvas();

                    applyViewportTransform();

                    invalidateHitCache();
                },
                delay
            );
    }


    function installResizeObserver() {
        if (
            !window.ResizeObserver
        ) {
            return;
        }


        resizeObserver =
            new ResizeObserver(
                () =>
                    scheduleResizeWork(
                        80
                    )
            );


        if (
            E.pipWrapper
        ) {
            resizeObserver.observe(
                E.pipWrapper
            );
        }


        if (
            stageCanvas
        ) {
            resizeObserver.observe(
                stageCanvas
            );
        }
    }


    // ============================================================
    // CLEANUP
    // ============================================================

    function cleanup() {
        stopLoop();


        if (
            autoTimer
        ) {
            clearTimeout(
                autoTimer
            );
        }


        if (
            clockTimer
        ) {
            clearInterval(
                clockTimer
            );
        }


        if (
            resizeTimer
        ) {
            clearTimeout(
                resizeTimer
            );
        }


        resizeObserver
            ?.disconnect?.();


        hostObserver
            ?.disconnect?.();


        bodyAttrObserver
            ?.disconnect?.();


        resetMousePressState({
            release: true
        });


        finishFistManipulation(
            "cleanup"
        );


        if (
            cameraStream
        ) {
            for (
                const track
                of cameraStream.getTracks()
            ) {
                try {
                    track.stop();

                } catch (_) {}
            }


            cameraStream =
                null;
        }


        if (
            screenShareStream
        ) {
            for (
                const track
                of screenShareStream.getTracks()
            ) {
                try {
                    track.stop();

                } catch (_) {}
            }


            screenShareStream =
                null;
        }


        try {
            landmarker?.close?.();

        } catch (_) {}


        landmarker =
            null;


        try {
            pdfDoc?.destroy?.();

        } catch (_) {}
    }

window.velosApp = {
    currentSlideIndex() {
        return isPdfLoaded && pdfDoc ? currentPage : defaultIndex;
    },

    totalSlides() {
        return isPdfLoaded && pdfDoc ? totalPages : defaultSlides.length;
    },

    getDrawContext() {
        return drawCtx || null;
    },

    getDrawCanvas() {
        return E.drawCanvas || null;
    },

    getSlideCard() {
        return E.slideCard || null;
    },

    getSlideContent() {
        return E.slideContent || null;
    },

    ready() {
        window.dispatchEvent(new CustomEvent("velosReady"));
    }
};

window.showToast = showToast;

    // ============================================================
    // BOOT
    // ============================================================

    async function boot() {
        cacheDom();

        ensureScreenShareButton();

        configurePdfJs();

        installHostGuards();

        installDirectPan();

        installEvents();

        installResizeObserver();

        loadSavedPreferences();


        setCameraPreviewVisible(
            true
        );


        setAutoHidePanels(
            false
        );


        setCameraState(
            "Starting",
            "busy"
        );


        setModelState(
            "Loading"
        );


        updateDeckUI();

        syncToolStates();

        updateClockAndSession();


        clockTimer =
            setInterval(
                updateClockAndSession,
                1000
            );


        if (
            !E.video ||
            !E.pipVideo ||
            !E.slideContent ||
            !E.slideCard ||
            !E.drawCanvas
        ) {
            showError(
                "Required Velos HTML elements are missing. Check cam, pip-video, slideContent, slideCard and drawCanvas IDs."
            );

            return;
        }


        await showSlide(
            0
        );
        window.velosApp?.ready();



        scheduleResizeWork(
            50
        );


        try {
            await initCam();


            showToast(
                "Camera ready",
                900
            );

        } catch (
            cameraError
        ) {
            setCameraState(
                "Unavailable",
                "offline"
            );


            showError(
                `Camera error: ${cameraError.message}`
            );


            return;
        }


        /*
         * Start preview immediately.
         *
         * MediaPipe/model initialization can continue separately,
         * so the page stays interactive while the model loads.
         */
        startLoop();


        try {
            await initModel();


            showToast(
                "Hand tracking ready",
                900
            );

        } catch (
            modelError
        ) {
            setModelState(
                "Unavailable"
            );


            showError(
                "Hand model failed; camera preview is still available."
            );


            console.error(
                modelError
            );
        }


        showToast(
            landmarker

                ? "Ready · 2 hands zoom · ✊ pan/drag · ✋ release · 🤙 1s Air Mouse"

                : "Camera ready · hand tracking unavailable",

            3000
        );
    }


    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            () =>
                void boot(),
            {
                once: true
            }
        );

    } else {
        void boot();
    }

})();