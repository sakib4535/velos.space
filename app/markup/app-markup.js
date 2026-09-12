(() => {

    "use strict";


    /* =========================================================
       PREVENT DOUBLE INITIALIZATION
    ========================================================= */

    if (
        window.__velosMarkupIntegrationV2
    ) {

        return;

    }


    window.__velosMarkupIntegrationV2 =
        true;


    let markupButton =
        null;


    let markupSwitch =
        null;


    /* =========================================================
       TOAST
    ========================================================= */

    function toast(message) {

        if (
            typeof window.showToast
            ===
            "function"
        ) {

            window.showToast(
                message,
                1200
            );

        } else {

            console.log(
                "[Velos]",
                message
            );

        }

    }


    /* =========================================================
       WAIT FOR MARKUP ENGINE
    ========================================================= */

    function waitForMarkup(
        timeoutMs = 8000
    ) {

        return new Promise(

            resolve => {

                if (
                    window.velosMarkup
                ) {

                    resolve(
                        window.velosMarkup
                    );

                    return;

                }


                const started =
                    Date.now();


                const timer =
                    setInterval(

                        () => {

                            if (
                                window.velosMarkup
                            ) {

                                clearInterval(
                                    timer
                                );


                                resolve(
                                    window.velosMarkup
                                );


                                return;

                            }


                            if (

                                Date.now()
                                -
                                started
                                >=
                                timeoutMs

                            ) {

                                clearInterval(
                                    timer
                                );


                                resolve(
                                    null
                                );

                            }

                        },

                        80

                    );

            }

        );

    }


    /* =========================================================
       SEND HANDS TO MARKUP ENGINE
    ========================================================= */

    function dispatchHands(
        hands,
        timestamp =
            performance.now()
    ) {

        if (
            !hands
            ||
            !hands.length
        ) {

            return;

        }


        /*
         * Supports:
         *
         * hands[0]
         *
         * OR
         *
         * hands[0].landmarks
         */

        const first =
            hands[0]?.landmarks
            ||
            hands[0];


        if (
            !Array.isArray(first)
        ) {

            return;

        }


        window.dispatchEvent(

            new CustomEvent(

                "velosHandsDetected",

                {

                    detail: {

                        landmarks:
                            first,

                        hands,

                        timestamp

                    }

                }

            )

        );

    }


    /* =========================================================
       INSTALL HAND BRIDGE
    ========================================================= */

    function installHandBridge() {

        /*
         * Provides a stable public bridge.
         *
         * You can call these functions
         * directly from app.js if needed:
         *
         * window.velosMarkupBridge.feedHands(hands);
         *
         * or:
         *
         * window.velosMarkupBridge.feedLandmarks(landmarks);
         */

        window.velosMarkupBridge =
            Object.freeze({

                feedHands:
                    dispatchHands,


                feedLandmarks(
                    landmarks,
                    timestamp =
                        performance.now()
                ) {

                    if (
                        !Array.isArray(
                            landmarks
                        )
                    ) {

                        return;

                    }


                    window.dispatchEvent(

                        new CustomEvent(

                            "velosHandsDetected",

                            {

                                detail: {

                                    landmarks,

                                    timestamp

                                }

                            }

                        )

                    );

                }

            });


        /*
         * Backward compatibility.
         */

        window.processHandsWithMarkup =
            function (
                hands,
                now
            ) {

                const original =
                    window
                        .__velosOriginalProcessHands;


                if (
                    typeof original
                    ===
                    "function"
                ) {

                    original.call(
                        this,
                        hands,
                        now
                    );

                }


                dispatchHands(
                    hands,
                    now
                );

            };


        /*
         * Automatically wrap processHands
         * if app.js exposes it globally.
         */

        if (

            typeof window.processHands
            ===
            "function"

            &&

            !window.processHands
                .__velosMarkupWrapped

        ) {

            const original =
                window.processHands;


            window.__velosOriginalProcessHands =
                original;


            const wrapped =
                function (...args) {

                    const result =
                        original.apply(
                            this,
                            args
                        );


                    try {

                        dispatchHands(
                            args[0],
                            args[1]
                        );

                    } catch (error) {

                        console.warn(
                            "Velos hand bridge error:",
                            error
                        );

                    }


                    return result;

                };


            wrapped.__velosMarkupWrapped =
                true;


            window.processHands =
                wrapped;

        }

    }


    /* =========================================================
       ENABLE/DISABLE STATE
    ========================================================= */

    function setEnabledState(on) {

        if (
            !window.velosMarkup
        ) {

            return;

        }


        if (on) {

            window.velosMarkup
                .enableMarkup();

        } else {

            window.velosMarkup
                .disableMarkup();

        }


        if (markupButton) {

            markupButton
                .classList
                .toggle(
                    "active",
                    on
                );

        }


        if (markupSwitch) {

            markupSwitch.checked =
                on;

        }

    }


    /* =========================================================
       CREATE MARKUP BUTTON
    ========================================================= */

    function createMarkupControls() {

        /*
         * Avoid duplicate button.
         */

        const existing =
            document.getElementById(
                "markupToggleBtn"
            );


        if (existing) {

            markupButton =
                existing;

            return;

        }


        const btn =
            document.createElement(
                "button"
            );


        btn.id =
            "markupToggleBtn";


        btn.type =
            "button";


        btn.className =
            "control-btn";


        btn.title =
            "Gesture Markup: draw, select and drag objects";


        btn.setAttribute(
            "aria-label",
            "Toggle Gesture Markup Object Mode"
        );


        btn.innerHTML = `
            <span class="label-desktop">
                Markup
            </span>

            <span class="label-mobile">
                ✍️
            </span>
        `;


        btn.addEventListener(

            "click",

            () => {

                const on =
                    !window.velosMarkup
                        ?.isEnabled
                        ?.();


                setEnabledState(
                    on
                );


                toast(

                    on

                    ?

                    "Markup enabled — draw, then drag any object"

                    :

                    "Markup disabled"

                );

            }

        );


        /*
         * Place next to laser button.
         */

        const laser =
            document.getElementById(
                "laserBtn"
            );


        if (
            laser
            &&
            laser.parentElement
        ) {

            laser.parentElement
                .insertBefore(
                    btn,
                    laser.nextSibling
                );

        } else {

            document.body
                .appendChild(
                    btn
                );

        }


        markupButton =
            btn;


        /* =====================================================
           UNDO BUTTON
        ===================================================== */

        if (
            !document.getElementById(
                "markupUndoBtn"
            )
        ) {

            const undo =
                document.createElement(
                    "button"
                );


            undo.id =
                "markupUndoBtn";


            undo.type =
                "button";


            undo.className =
                "control-btn";


            undo.title =
                "Undo last markup object";


            undo.setAttribute(
                "aria-label",
                "Undo last markup object"
            );


            undo.textContent =
                "↶";


            undo.addEventListener(

                "click",

                () => {

                    const removed =
                        window.velosMarkup
                            ?.undoLast
                            ?.();


                    toast(

                        removed

                        ?

                        "Last markup removed"

                        :

                        "Nothing to undo"

                    );

                }

            );


            btn.parentElement
                ?.insertBefore(
                    undo,
                    btn.nextSibling
                );

        }

    }


    /* =========================================================
       SETTINGS
    ========================================================= */

    function addSettings() {

        const drawer =
            document.getElementById(
                "settingsDrawer"
            );


        if (!drawer) {

            return;

        }


        /*
         * Prevent duplicate settings.
         */

        if (
            document.getElementById(
                "velosMarkupSettingsV2"
            )
        ) {

            return;

        }


        const box =
            document.createElement(
                "div"
            );


        box.id =
            "velosMarkupSettingsV2";


        box.className =
            "settings-section";


        box.innerHTML = `

            <h3>
                ✍️ Gesture Markup Objects
            </h3>


            <div class="settings-item">

                <label>

                    <input
                        type="checkbox"
                        id="markupEnabledSwitchV2"
                    >

                    Enable markup object mode

                </label>


                <p class="hint">

                    Draw a circle, arrow, rectangle,
                    underline, check, slash or any
                    freehand stroke.

                    Click/touch an existing object
                    and drag it anywhere.

                </p>

            </div>


            <div
                class="settings-item"
                style="
                    display:flex;
                    gap:8px;
                    flex-wrap:wrap;
                "
            >

                <button
                    type="button"
                    id="markupUndoSettingsBtn"
                    class="secondary-btn"
                >
                    Undo Last
                </button>


                <button
                    type="button"
                    id="exportMarkupBtnV2"
                    class="secondary-btn"
                >
                    Export Markup JSON
                </button>

            </div>

        `;


        drawer.appendChild(
            box
        );


        markupSwitch =
            document.getElementById(
                "markupEnabledSwitchV2"
            );


        markupSwitch
            ?.addEventListener(

                "change",

                e => {

                    setEnabledState(
                        e.target.checked
                    );

                }

            );


        /* =====================================================
           SETTINGS UNDO
        ===================================================== */

        document
            .getElementById(
                "markupUndoSettingsBtn"
            )
            ?.addEventListener(

                "click",

                () => {

                    const removed =
                        window.velosMarkup
                            ?.undoLast
                            ?.();


                    toast(

                        removed

                        ?

                        "Last markup removed"

                        :

                        "Nothing to undo"

                    );

                }

            );


        /* =====================================================
           EXPORT JSON
        ===================================================== */

        document
            .getElementById(
                "exportMarkupBtnV2"
            )
            ?.addEventListener(

                "click",

                () => {

                    const data =
                        window.velosMarkup
                            ?.exportTranscript
                            ?.();


                    if (!data) {

                        return;

                    }


                    const blob =
                        new Blob(

                            [
                                JSON.stringify(
                                    data,
                                    null,
                                    2
                                )
                            ],

                            {
                                type:
                                    "application/json"
                            }

                        );


                    const url =
                        URL.createObjectURL(
                            blob
                        );


                    const a =
                        document.createElement(
                            "a"
                        );


                    a.href =
                        url;


                    a.download =
                        `velos-markup-${Date.now()}.json`;


                    a.click();


                    setTimeout(

                        () => {

                            URL.revokeObjectURL(
                                url
                            );

                        },

                        0

                    );

                }

            );

    }


    /* =========================================================
       CLEAR INK INTEGRATION
    ========================================================= */

    function installClearIntegration() {

        const btn =
            document.getElementById(
                "clearInkBtn"
            );


        if (!btn) {

            return;

        }


        /*
         * Prevent double hooking.
         */

        if (
            btn.__velosMarkupClearHook
        ) {

            return;

        }


        btn.__velosMarkupClearHook =
            true;


        btn.addEventListener(

            "click",

            () => {

                /*
                 * Clear markup belonging
                 * only to current slide.
                 */

                window.velosMarkup
                    ?.clearAnnotations
                    ?.();

            }

        );

    }


    /* =========================================================
       DEBUG API
    ========================================================= */

    function exposeDebug() {

        window.velosMarkupDebug = {


            enable() {

                setEnabledState(
                    true
                );

            },


            disable() {

                setEnabledState(
                    false
                );

            },


            list() {

                return (
                    window.velosMarkup
                        ?.getAnnotations
                        ?.()
                    ||
                    []
                );

            },


            selected() {

                return (
                    window.velosMarkup
                        ?.getSelected
                        ?.()
                    ||
                    null
                );

            },


            undo() {

                return window
                    .velosMarkup
                    ?.undoLast
                    ?.();

            },


            clearSlide() {

                window.velosMarkup
                    ?.clearAnnotations
                    ?.();

            },


            clearAll() {

                window.velosMarkup
                    ?.clearAllAnnotations
                    ?.();

            }

        };

    }


    /* =========================================================
       INITIALIZE
    ========================================================= */

    async function init() {

        const api =
            await waitForMarkup();


        if (!api) {

            console.error(
                "❌ Velos markup engine did not load. Check script order."
            );


            return;

        }


        /*
         * Hand landmark connection
         */

        installHandBridge();


        /*
         * Clear ink integration
         */

        installClearIntegration();


        /*
         * Toolbar controls
         */

        createMarkupControls();


        /*
         * Settings
         */

        addSettings();


        /*
         * Debug commands
         */

        exposeDebug();


        /*
         * Redraw objects whenever
         * presentation slide changes.
         */

        window.addEventListener(

            "velosSlideChanged",

            () => {

                api.redrawAll?.();

            }

        );


        /*
         * Tell app that integration
         * is ready.
         */

        window.dispatchEvent(

            new CustomEvent(
                "velosMarkupIntegrationReady"
            )

        );


        console.log(
            "✅ Velos markup optimized integration ready"
        );

    }


    /* =========================================================
       START
    ========================================================= */

    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(

            "DOMContentLoaded",

            init,

            {
                once: true
            }

        );

    } else {

        init();

    }

})();