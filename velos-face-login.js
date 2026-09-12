/*
==============================================================
 VELOS - AUTOMATIC FACE LOGIN
==============================================================

FIRST TIME
--------------------------------------------------------------
Presentation - Live
      ↓
Camera Opens
      ↓
Human Face Detected
      ↓
Blink Captured
      ↓
Face Samples Captured
      ↓
Face Automatically Registered
      ↓
HUMAN DETECTED
      ↓
../frontend/interface.html


RETURNING USER
--------------------------------------------------------------
Presentation - Live
      ↓
Camera Opens
      ↓
Human Face Detected
      ↓
Blink Captured
      ↓
Current Face Captured
      ↓
Compare With Saved Face
      ↓
MATCH
      ↓
HUMAN DETECTED
      ↓
../frontend/interface.html


IMPORTANT
--------------------------------------------------------------
This is a browser-only prototype.

Face descriptors are stored in IndexedDB.

For real production authentication, move face-template storage
and session authorization to your backend/server.
==============================================================
*/

(() => {

    "use strict";


    // ============================================================
    // CONFIGURATION
    // ============================================================

    const CONFIG = {

        // Must open after successful registration / verification
        SUCCESS_URL: "./app/index.html",

        LOGIN_HASH: "#face-login",


        // --------------------------------------------------------
        // LOCAL DATABASE
        // --------------------------------------------------------

        DB_NAME: "VelosFaceDB",

        DB_VERSION: 1,

        STORE_NAME: "faceTemplates",

        TEMPLATE_KEY: "velos-primary-user",


        // --------------------------------------------------------
        // FACE MATCH
        // --------------------------------------------------------

        /*
          Smaller number = stricter matching.

          Typical testing range:
          0.45 - 0.55

          You MUST calibrate this using your real users/cameras.
        */

        MATCH_THRESHOLD: 0.50,


        // --------------------------------------------------------
        // FACE SAMPLES
        // --------------------------------------------------------

        ENROLL_SAMPLES: 5,

        VERIFY_SAMPLES: 3,


        // --------------------------------------------------------
        // SUCCESS SCREEN DELAY
        // --------------------------------------------------------

        SUCCESS_DELAY: 1400,


        // --------------------------------------------------------
        // BLINK TIME LIMIT
        // --------------------------------------------------------

        BLINK_TIMEOUT: 30000,


        // --------------------------------------------------------
        // CDN
        // --------------------------------------------------------

        FACE_API_SCRIPT:
            "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js",


        FACE_API_MODELS:
            "https://cdn.jsdelivr.net/gh/vladmandic/face-api@1.7.12/model",


        FACE_MESH_SCRIPT:
            "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js",


        FACE_MESH_BASE:
            "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/"

    };



    // ============================================================
    // APPLICATION STATE
    // ============================================================

    let root = null;

    let landingPage = null;


    let video = null;

    let canvas = null;

    let ctx = null;


    let cameraStream = null;


    let faceMesh = null;

    let meshRunning = false;

    let animationFrame = 0;


    let currentLandmarks = null;


    let cameraReady = false;

    let modelsReady = false;


    let authenticationStarted = false;

    let authenticationFinished = false;


    let faceVisibleSince = 0;


    let blinkState = {

        closed: false,

        detected: false

    };


    // ------------------------------------------------------------
    // UI REFERENCES
    // ------------------------------------------------------------

    let statusTitle = null;

    let statusText = null;

    let modeBadge = null;

    let progressFill = null;

    let faceChip = null;

    let blinkChip = null;

    let backButton = null;

    let resetButton = null;



    // ============================================================
    // UTILITIES
    // ============================================================

    function sleep(ms) {

        return new Promise(

            resolve => setTimeout(resolve, ms)

        );

    }



    function setStatus(title, text = "") {

        if (statusTitle) {

            statusTitle.textContent = title;

        }


        if (statusText) {

            statusText.textContent = text;

        }

    }



    function setProgress(value) {

        if (!progressFill) {

            return;

        }


        const safeValue = Math.max(

            0,

            Math.min(

                1,

                value

            )

        );


        progressFill.style.width =

            `${safeValue * 100}%`;

    }



    // ============================================================
    // LOAD EXTERNAL JAVASCRIPT
    // ============================================================

    function loadScript(src, globalName) {

        return new Promise(

            (resolve, reject) => {


                if (

                    globalName &&

                    window[globalName]

                ) {

                    resolve(

                        window[globalName]

                    );

                    return;

                }


                const existingScript =

                    [...document.scripts].find(

                        script =>

                            script.src === src

                    );


                if (existingScript) {


                    if (

                        !globalName ||

                        window[globalName]

                    ) {

                        resolve(

                            globalName

                                ? window[globalName]

                                : true

                        );

                        return;

                    }


                    existingScript.addEventListener(

                        "load",

                        () => {

                            resolve(

                                globalName

                                    ? window[globalName]

                                    : true

                            );

                        },

                        {

                            once: true

                        }

                    );


                    existingScript.addEventListener(

                        "error",

                        () => {

                            reject(

                                new Error(

                                    "Required face library failed to load."

                                )

                            );

                        },

                        {

                            once: true

                        }

                    );


                    return;

                }



                const script =

                    document.createElement(

                        "script"

                    );


                script.src = src;

                script.async = true;

                script.crossOrigin = "anonymous";


                script.onload = () => {

                    resolve(

                        globalName

                            ? window[globalName]

                            : true

                    );

                };


                script.onerror = () => {

                    reject(

                        new Error(

                            "Unable to load required face library."

                        )

                    );

                };


                document.head.appendChild(

                    script

                );

            }

        );

    }



    // ============================================================
    // INDEXED DB
    // ============================================================

    function openDatabase() {

        return new Promise(

            (resolve, reject) => {


                const request =

                    indexedDB.open(

                        CONFIG.DB_NAME,

                        CONFIG.DB_VERSION

                    );


                request.onupgradeneeded = () => {


                    const database =

                        request.result;


                    if (

                        !database
                            .objectStoreNames
                            .contains(

                                CONFIG.STORE_NAME

                            )

                    ) {

                        database.createObjectStore(

                            CONFIG.STORE_NAME

                        );

                    }

                };


                request.onsuccess = () => {

                    resolve(

                        request.result

                    );

                };


                request.onerror = () => {

                    reject(

                        request.error

                    );

                };

            }

        );

    }



    // ============================================================
    // GET REGISTERED FACE
    // ============================================================

    async function getSavedFace() {

        const database =

            await openDatabase();


        return new Promise(

            (resolve, reject) => {


                const transaction =

                    database.transaction(

                        CONFIG.STORE_NAME,

                        "readonly"

                    );


                const store =

                    transaction.objectStore(

                        CONFIG.STORE_NAME

                    );


                const request =

                    store.get(

                        CONFIG.TEMPLATE_KEY

                    );


                request.onsuccess = () => {


                    const result =

                        request.result || null;


                    database.close();


                    resolve(result);

                };


                request.onerror = () => {


                    database.close();


                    reject(

                        request.error

                    );

                };

            }

        );

    }



    // ============================================================
    // SAVE REGISTERED FACE
    // ============================================================

    async function saveFace(descriptor) {

        const database =

            await openDatabase();


        return new Promise(

            (resolve, reject) => {


                const transaction =

                    database.transaction(

                        CONFIG.STORE_NAME,

                        "readwrite"

                    );


                const store =

                    transaction.objectStore(

                        CONFIG.STORE_NAME

                    );


                store.put(

                    {

                        descriptor: descriptor,

                        registeredAt:
                            new Date().toISOString(),

                        version: 1

                    },

                    CONFIG.TEMPLATE_KEY

                );


                transaction.oncomplete = () => {


                    database.close();


                    resolve();

                };


                transaction.onerror = () => {


                    database.close();


                    reject(

                        transaction.error

                    );

                };

            }

        );

    }



    // ============================================================
    // DELETE REGISTERED FACE
    // ============================================================

    async function deleteSavedFace() {

        const database =

            await openDatabase();


        return new Promise(

            (resolve, reject) => {


                const transaction =

                    database.transaction(

                        CONFIG.STORE_NAME,

                        "readwrite"

                    );


                const store =

                    transaction.objectStore(

                        CONFIG.STORE_NAME

                    );


                store.delete(

                    CONFIG.TEMPLATE_KEY

                );


                transaction.oncomplete = () => {


                    database.close();


                    resolve();

                };


                transaction.onerror = () => {


                    database.close();


                    reject(

                        transaction.error

                    );

                };

            }

        );

    }



    // ============================================================
    // FACE DISTANCE
    // ============================================================

    function euclideanDistance(a, b) {

        if (

            !a ||

            !b ||

            a.length !== b.length

        ) {

            return Infinity;

        }


        let sum = 0;


        for (

            let i = 0;

            i < a.length;

            i++

        ) {


            const difference =

                a[i] - b[i];


            sum +=

                difference * difference;

        }


        return Math.sqrt(sum);

    }



    // ============================================================
    // AVERAGE FACE DESCRIPTORS
    // ============================================================

    function averageDescriptors(descriptors) {

        if (

            !descriptors ||

            descriptors.length === 0

        ) {

            return null;

        }


        const descriptorLength =

            descriptors[0].length;


        const average =

            new Float32Array(

                descriptorLength

            );


        for (

            const descriptor

            of descriptors

        ) {


            for (

                let i = 0;

                i < descriptorLength;

                i++

            ) {

                average[i] +=

                    descriptor[i];

            }

        }



        for (

            let i = 0;

            i < descriptorLength;

            i++

        ) {


            average[i] /=

                descriptors.length;

        }



        return Array.from(

            average

        );

    }



    // ============================================================
    // POINT DISTANCE
    // ============================================================

    function landmarkDistance(a, b) {

        const x =

            a.x - b.x;


        const y =

            a.y - b.y;


        return Math.sqrt(

            x * x +

            y * y

        );

    }



    // ============================================================
    // EYE ASPECT RATIO
    // ============================================================

    function calculateEyeRatio(landmarks) {

        if (

            !landmarks ||

            landmarks.length < 468

        ) {

            return null;

        }



        // --------------------------------------------------------
        // LEFT EYE
        // --------------------------------------------------------

        const leftWidth =

            landmarkDistance(

                landmarks[33],

                landmarks[133]

            );


        const leftHeight =

            (

                landmarkDistance(

                    landmarks[159],

                    landmarks[145]

                )

                +

                landmarkDistance(

                    landmarks[158],

                    landmarks[144]

                )

            )

            / 2;



        // --------------------------------------------------------
        // RIGHT EYE
        // --------------------------------------------------------

        const rightWidth =

            landmarkDistance(

                landmarks[362],

                landmarks[263]

            );


        const rightHeight =

            (

                landmarkDistance(

                    landmarks[386],

                    landmarks[374]

                )

                +

                landmarkDistance(

                    landmarks[385],

                    landmarks[380]

                )

            )

            / 2;



        if (

            leftWidth === 0 ||

            rightWidth === 0

        ) {

            return null;

        }



        const leftRatio =

            leftHeight /

            leftWidth;


        const rightRatio =

            rightHeight /

            rightWidth;



        return (

            leftRatio +

            rightRatio

        ) / 2;

    }



    // ============================================================
    // BLINK DETECTION
    // ============================================================

    function processBlink(landmarks) {

        if (

            authenticationStarted ||

            authenticationFinished

        ) {

            return;

        }


        const eyeRatio =

            calculateEyeRatio(

                landmarks

            );


        if (

            eyeRatio === null

        ) {

            return;

        }



        /*
        Eyes closed
        */

        if (

            !blinkState.closed &&

            eyeRatio < 0.16

        ) {


            blinkState.closed = true;


            if (blinkChip) {


                blinkChip.textContent =

                    "EYES CLOSED";

            }

        }



        /*
        Eyes open after being closed = blink
        */

        if (

            blinkState.closed &&

            eyeRatio > 0.21

        ) {


            blinkState.closed = false;


            blinkState.detected = true;



            if (blinkChip) {


                blinkChip.textContent =

                    "BLINK CAPTURED";


                blinkChip.classList.add(

                    "success"

                );

            }



            setStatus(

                "Blink Captured",

                "Starting automatic identity processing..."

            );



            startAutomaticAuthentication();

        }

    }



    // ============================================================
    // STYLE
    // ============================================================

    function injectStyles() {

        if (

            document.getElementById(

                "velos-auto-face-style"

            )

        ) {

            return;

        }


        const style =

            document.createElement(

                "style"

            );


        style.id =

            "velos-auto-face-style";


        style.textContent = `

        #velos-face-auth{

            width:100%;

            min-height:100vh;

            position:relative;

            z-index:999999;

            color:#f5f5f7;

            background:

                radial-gradient(
                    circle at 72% 25%,
                    rgba(255,255,255,.075),
                    transparent 28%
                ),

                radial-gradient(
                    circle at 20% 85%,
                    rgba(255,255,255,.035),
                    transparent 30%
                ),

                #030303;

            font-family:
                Inter,
                ui-sans-serif,
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                sans-serif;

        }



        #velos-face-auth *{

            box-sizing:border-box;

        }



        #velos-face-auth::before{

            content:"";

            position:absolute;

            inset:0;

            pointer-events:none;

            background:

                linear-gradient(
                    rgba(220,220,230,.08)
                    1px,
                    transparent 1px
                ),

                linear-gradient(
                    90deg,
                    rgba(220,220,230,.08)
                    1px,
                    transparent 1px
                );

            background-size:
                34px 34px;

            -webkit-mask-image:
                linear-gradient(
                    to bottom,
                    rgba(0,0,0,.95),
                    rgba(0,0,0,.55)
                    60%,
                    transparent
                );

            mask-image:
                linear-gradient(
                    to bottom,
                    rgba(0,0,0,.95),
                    rgba(0,0,0,.55)
                    60%,
                    transparent
                );

        }



        .vface-container{

            width:
                min(
                    1300px,
                    calc(100% - 48px)
                );

            margin:
                0 auto;

            position:
                relative;

            z-index:
                2;

            padding-bottom:
                60px;

        }



        .vface-nav{

            min-height:
                90px;

            display:
                flex;

            align-items:
                center;

            justify-content:
                space-between;

            gap:
                20px;

            border-bottom:
                1px solid
                rgba(
                    255,
                    255,
                    255,
                    .10
                );

        }



        .vface-brand{

            display:
                flex;

            align-items:
                center;

            gap:
                12px;

            font-size:
                28px;

            font-weight:
                900;

            letter-spacing:
                -.045em;

        }



        .vface-brand-icon{

            width:
                38px;

            height:
                38px;

            display:
                grid;

            place-items:
                center;

            border-radius:
                10px;

            border:
                1px solid
                rgba(
                    255,
                    255,
                    255,
                    .35
                );

            background:
                rgba(
                    255,
                    255,
                    255,
                    .025
                );

        }



        .vface-mode{

            padding:
                8px 12px;

            border-radius:
                999px;

            border:
                1px solid
                rgba(
                    255,
                    255,
                    255,
                    .12
                );

            color:
                #9d9da4;

            font-size:
                10px;

            letter-spacing:
                .15em;

            text-transform:
                uppercase;

        }



        .vface-layout{

            display:
                grid;

            grid-template-columns:

                minmax(
                    0,
                    .85fr
                )

                minmax(
                    450px,
                    1.15fr
                );

            align-items:
                center;

            gap:
                55px;

            padding-top:
                62px;

        }



        .vface-copy h1{

            margin:
                0;

            font-size:
                clamp(
                    58px,
                    7vw,
                    104px
                );

            line-height:
                .91;

            letter-spacing:
                -.065em;

            font-weight:
                850;

        }



        .vface-copy p{

            max-width:
                530px;

            margin:
                26px 0 0;

            color:
                #9999a0;

            font-size:
                17px;

            line-height:
                1.58;

        }



        .vface-status{

            margin-top:
                30px;

            padding:
                18px 0;

            border-top:
                1px solid
                rgba(
                    255,
                    255,
                    255,
                    .10
                );

            border-bottom:
                1px solid
                rgba(
                    255,
                    255,
                    255,
                    .10
                );

        }



        .vface-status-title{

            font-size:
                18px;

            font-weight:
                850;

        }



        .vface-status-text{

            margin-top:
                7px;

            color:
                #808087;

            font-size:
                13px;

            line-height:
                1.5;

        }



        .vface-progress{

            width:
                100%;

            height:
                3px;

            margin-top:
                15px;

            overflow:
                hidden;

            background:
                rgba(
                    255,
                    255,
                    255,
                    .08
                );

        }



        .vface-progress-fill{

            width:
                0%;

            height:
                100%;

            background:
                #e7e7ea;

            transition:
                width .25s ease;

        }



        .vface-actions{

            display:
                flex;

            flex-wrap:
                wrap;

            gap:
                10px;

            margin-top:
                22px;

        }



        .vface-button{

            min-height:
                48px;

            border-radius:
                10px;

            padding:
                0 18px;

            cursor:
                pointer;

            color:
                #c7c7cd;

            background:
                rgba(
                    255,
                    255,
                    255,
                    .025
                );

            border:
                1px solid
                rgba(
                    255,
                    255,
                    255,
                    .17
                );

            font:
                inherit;

            font-size:
                12px;

            font-weight:
                800;

        }



        .vface-instruction{

            margin-top:
                20px;

            color:
                #67676e;

            font-size:
                11px;

            line-height:
                1.5;

        }



        .vface-camera{

            overflow:
                hidden;

            background:
                #050505;

            border:
                1px solid
                rgba(
                    255,
                    255,
                    255,
                    .22
                );

            box-shadow:
                0 35px 100px
                rgba(
                    0,
                    0,
                    0,
                    .65
                );

        }



        .vface-camera-header{

            height:
                52px;

            padding:
                0 16px;

            display:
                flex;

            align-items:
                center;

            justify-content:
                space-between;

            gap:
                15px;

            border-bottom:
                1px solid
                rgba(
                    255,
                    255,
                    255,
                    .10
                );

            color:
                #898990;

            font-size:
                10px;

            letter-spacing:
                .14em;

            text-transform:
                uppercase;

        }



        .vface-camera-stage{

            position:
                relative;

            aspect-ratio:
                4 / 3;

            overflow:
                hidden;

            background:
                #050505;

        }



        #velos-auto-video,

        #velos-auto-canvas{

            position:
                absolute;

            inset:
                0;

            width:
                100%;

            height:
                100%;

            object-fit:
                cover;

            transform:
                scaleX(-1);

        }



        #velos-auto-canvas{

            pointer-events:
                none;

        }



        .vface-guide{

            position:
                absolute;

            left:
                50%;

            top:
                50%;

            transform:
                translate(
                    -50%,
                    -50%
                );

            width:
                54%;

            height:
                72%;

            border:
                1px solid
                rgba(
                    255,
                    255,
                    255,
                    .55
                );

            border-radius:
                48%
                48%
                44%
                44%;

            pointer-events:
                none;

        }



        .vface-guide::before{

            content:"";

            position:absolute;

            left:50%;

            top:-10px;

            transform:
                translateX(-50%);

            width:
                30px;

            height:
                1px;

            background:
                rgba(
                    255,
                    255,
                    255,
                    .85
                );

        }



        .vface-chips{

            position:
                absolute;

            left:
                13px;

            right:
                13px;

            bottom:
                13px;

            display:
                flex;

            flex-wrap:
                wrap;

            gap:
                8px;

        }



        .vface-chip{

            padding:
                7px 10px;

            border-radius:
                999px;

            color:
                #9999a0;

            background:
                rgba(
                    0,
                    0,
                    0,
                    .72
                );

            border:
                1px solid
                rgba(
                    255,
                    255,
                    255,
                    .15
                );

            font-size:
                10px;

            letter-spacing:
                .08em;

            text-transform:
                uppercase;

            backdrop-filter:
                blur(7px);

        }



        .vface-chip.success{

            color:
                #ffffff;

            border-color:
                rgba(
                    255,
                    255,
                    255,
                    .55
                );

        }



        .vface-camera-footer{

            min-height:
                48px;

            display:
                flex;

            align-items:
                center;

            gap:
                9px;

            padding:
                0 15px;

            color:
                #727279;

            font-size:
                11px;

        }



        .vface-live-dot{

            width:
                7px;

            height:
                7px;

            border-radius:
                50%;

            background:
                #e0e0e3;

            box-shadow:
                0 0 12px
                rgba(
                    255,
                    255,
                    255,
                    .7
                );

        }



        /* ======================================================
           SUCCESS OVERLAY
        ====================================================== */

        .vface-success{

            position:
                absolute;

            inset:
                0;

            display:
                flex;

            flex-direction:
                column;

            align-items:
                center;

            justify-content:
                center;

            text-align:
                center;

            background:
                rgba(
                    2,
                    2,
                    2,
                    .93
                );

            backdrop-filter:
                blur(13px);

            opacity:
                0;

            visibility:
                hidden;

            pointer-events:
                none;

            z-index:
                100;

            transition:
                opacity .3s ease;

        }



        .vface-success.visible{

            opacity:
                1;

            visibility:
                visible;

        }



        .vface-success-icon{

            width:
                96px;

            height:
                96px;

            border-radius:
                50%;

            display:
                grid;

            place-items:
                center;

            border:
                1px solid
                rgba(
                    255,
                    255,
                    255,
                    .6
                );

            font-size:
                37px;

            margin-bottom:
                25px;

            box-shadow:
                0 0 60px
                rgba(
                    255,
                    255,
                    255,
                    .08
                );

        }



        .vface-success h2{

            margin:
                0;

            font-size:
                clamp(
                    34px,
                    5vw,
                    60px
                );

            letter-spacing:
                -.055em;

        }



        .vface-success p{

            margin:
                11px 0 0;

            color:
                #929299;

            font-size:
                11px;

            letter-spacing:
                .13em;

            text-transform:
                uppercase;

        }



        @media(max-width:950px){

            .vface-layout{

                grid-template-columns:
                    1fr;

            }


            .vface-camera{

                width:
                    min(
                        100%,
                        700px
                    );

            }

        }



        @media(max-width:600px){

            .vface-container{

                width:
                    calc(
                        100% - 24px
                    );

            }


            .vface-nav{

                min-height:
                    76px;

            }


            .vface-layout{

                padding-top:
                    38px;

            }


            .vface-copy h1{

                font-size:
                    clamp(
                        48px,
                        15vw,
                        74px
                    );

            }


            .vface-copy p{

                font-size:
                    15px;

            }


            .vface-camera-stage{

                aspect-ratio:
                    3 / 4;

            }

        }

        `;


        document.head.appendChild(

            style

        );

    }



    // ============================================================
    // BUILD FACE LOGIN PAGE
    // ============================================================

    function buildFaceLogin() {

        injectStyles();


        landingPage =

            document.querySelector(

                ".page"

            );


        if (landingPage) {

            landingPage.style.display =

                "none";

        }



        root =

            document.createElement(

                "section"

            );


        root.id =

            "velos-face-auth";


        root.innerHTML = `

        <div class="vface-container">


            <div class="vface-nav">


                <div class="vface-brand">

                    <span class="vface-brand-icon">

                        V

                    </span>

                    <span>

                        Velos

                    </span>

                </div>


                <div
                    class="vface-mode"
                    id="velos-auto-mode"
                >

                    INITIALIZING

                </div>


            </div>



            <div class="vface-layout">


                <div class="vface-copy">


                    <h1>

                        Human

                        <br>

                        Access.

                    </h1>


                    <p>

                        Look directly at the camera.

                        When Velos detects your face,

                        blink naturally once.

                        Registration or identity verification

                        will happen automatically.

                    </p>



                    <div class="vface-status">


                        <div
                            class="vface-status-title"
                            id="velos-auto-status-title"
                        >

                            Starting biometric engine...

                        </div>


                        <div
                            class="vface-status-text"
                            id="velos-auto-status-text"
                        >

                            Camera permission is required.

                        </div>


                        <div class="vface-progress">

                            <div
                                class="vface-progress-fill"
                                id="velos-auto-progress"
                            >
                            </div>

                        </div>


                    </div>



                    <div class="vface-actions">


                        <button
                            type="button"
                            class="vface-button"
                            id="velos-auto-back"
                        >

                            Back

                        </button>


                        <button
                            type="button"
                            class="vface-button"
                            id="velos-auto-reset"
                        >

                            Reset Registered Face

                        </button>


                    </div>



                    <div class="vface-instruction">

                        No Register or Verify button is required.

                        Human detection + blink automatically

                        starts the authentication process.

                    </div>


                </div>



                <div class="vface-camera">


                    <div class="vface-camera-header">


                        <span>

                            FACE MESH /
                            HUMAN AUTHENTICATION

                        </span>


                        <span>

                            LIVE

                        </span>


                    </div>



                    <div class="vface-camera-stage">


                        <video
                            id="velos-auto-video"
                            autoplay
                            muted
                            playsinline
                        >
                        </video>


                        <canvas
                            id="velos-auto-canvas"
                        >
                        </canvas>


                        <div
                            class="vface-guide"
                        >
                        </div>



                        <div class="vface-chips">


                            <div
                                class="vface-chip"
                                id="velos-auto-face-chip"
                            >

                                SEARCHING FOR HUMAN

                            </div>


                            <div
                                class="vface-chip"
                                id="velos-auto-blink-chip"
                            >

                                WAITING FOR BLINK

                            </div>


                        </div>



                        <div
                            class="vface-success"
                            id="velos-auto-success"
                        >


                            <div
                                class="vface-success-icon"
                            >

                                ✓

                            </div>


                            <h2>

                                HUMAN DETECTED

                            </h2>


                            <p
                                id="velos-auto-success-text"
                            >

                                Identity confirmed •
                                Opening Velos Interface

                            </p>


                        </div>


                    </div>



                    <div class="vface-camera-footer">


                        <span
                            class="vface-live-dot"
                        >
                        </span>


                        <span>

                            Velos biometric engine online

                        </span>


                    </div>


                </div>


            </div>


        </div>

        `;



        document.body.appendChild(

            root

        );



        // --------------------------------------------------------
        // GET UI REFERENCES
        // --------------------------------------------------------

        video =

            document.getElementById(

                "velos-auto-video"

            );


        canvas =

            document.getElementById(

                "velos-auto-canvas"

            );


        ctx =

            canvas.getContext(

                "2d"

            );


        statusTitle =

            document.getElementById(

                "velos-auto-status-title"

            );


        statusText =

            document.getElementById(

                "velos-auto-status-text"

            );


        modeBadge =

            document.getElementById(

                "velos-auto-mode"

            );


        progressFill =

            document.getElementById(

                "velos-auto-progress"

            );


        faceChip =

            document.getElementById(

                "velos-auto-face-chip"

            );


        blinkChip =

            document.getElementById(

                "velos-auto-blink-chip"

            );


        backButton =

            document.getElementById(

                "velos-auto-back"

            );


        resetButton =

            document.getElementById(

                "velos-auto-reset"

            );



        // --------------------------------------------------------
        // BACK BUTTON
        // --------------------------------------------------------

        backButton.addEventListener(

            "click",

            closeFaceLogin

        );



        // --------------------------------------------------------
        // RESET REGISTERED FACE
        // --------------------------------------------------------

        resetButton.addEventListener(

            "click",

            async () => {


                if (

                    authenticationStarted

                ) {

                    return;

                }


                const confirmed =

                    window.confirm(

                        "Remove the registered Velos face from this browser?"

                    );


                if (!confirmed) {

                    return;

                }



                try {


                    await deleteSavedFace();


                    blinkState = {

                        closed: false,

                        detected: false

                    };


                    authenticationStarted =

                        false;


                    authenticationFinished =

                        false;


                    setProgress(0);


                    modeBadge.textContent =

                        "FIRST TIME USER";


                    setStatus(

                        "Registration Reset",

                        "Look at the camera and blink to register a new face."

                    );


                    if (blinkChip) {


                        blinkChip.textContent =

                            "WAITING FOR BLINK";


                        blinkChip.classList.remove(

                            "success"

                        );

                    }

                }


                catch (error) {


                    console.error(error);


                    setStatus(

                        "Reset Failed",

                        error.message

                    );

                }

            }

        );

    }



    // ============================================================
    // START CAMERA
    // ============================================================

    async function startCamera() {

        if (

            !navigator.mediaDevices ||

            !navigator.mediaDevices.getUserMedia

        ) {

            throw new Error(

                "Camera API is not available in this browser."

            );

        }



        setStatus(

            "Requesting Camera Access",

            "Allow Velos to use your webcam."

        );



        cameraStream =

            await navigator
                .mediaDevices
                .getUserMedia({

                    video: {

                        facingMode: "user",

                        width: {

                            ideal: 960

                        },

                        height: {

                            ideal: 720

                        }

                    },

                    audio: false

                });



        video.srcObject =

            cameraStream;



        await new Promise(

            resolve => {


                video.onloadedmetadata =

                    () => resolve();

            }

        );



        await video.play();



        canvas.width =

            video.videoWidth ||

            960;


        canvas.height =

            video.videoHeight ||

            720;



        cameraReady = true;

    }



    // ============================================================
    // STOP CAMERA
    // ============================================================

    function stopCamera() {

        cancelAnimationFrame(

            animationFrame

        );


        animationFrame = 0;



        if (

            cameraStream

        ) {


            cameraStream
                .getTracks()
                .forEach(

                    track =>

                        track.stop()

                );


            cameraStream = null;

        }



        if (video) {


            video.srcObject =

                null;

        }



        cameraReady = false;


        currentLandmarks = null;

    }



    // ============================================================
    // DRAW FACE MESH
    // ============================================================

    function drawFaceMesh(landmarks) {

        if (

            !ctx ||

            !canvas

        ) {

            return;

        }



        ctx.clearRect(

            0,

            0,

            canvas.width,

            canvas.height

        );



        if (!landmarks) {

            return;

        }



        const connections =

            window.FACEMESH_TESSELATION ||

            [];


        const width =

            canvas.width;


        const height =

            canvas.height;



        if (

            connections.length

        ) {


            ctx.beginPath();


            ctx.lineWidth =

                0.6;


            ctx.strokeStyle =

                "rgba(235,235,240,.30)";



            for (

                const connection

                of connections

            ) {


                const first =

                    landmarks[

                        connection[0]

                    ];


                const second =

                    landmarks[

                        connection[1]

                    ];


                if (

                    !first ||

                    !second

                ) {

                    continue;

                }



                ctx.moveTo(

                    first.x * width,

                    first.y * height

                );


                ctx.lineTo(

                    second.x * width,

                    second.y * height

                );

            }


            ctx.stroke();

        }

    }



    // ============================================================
    // INITIALIZE FACE MESH
    // ============================================================

    async function initializeFaceMesh() {

        faceMesh =

            new window.FaceMesh({

                locateFile: file =>

                    `${CONFIG.FACE_MESH_BASE}${file}`

            });



        faceMesh.setOptions({

            maxNumFaces: 1,

            refineLandmarks: true,

            minDetectionConfidence: 0.65,

            minTrackingConfidence: 0.65

        });



        faceMesh.onResults(

            results => {


                const landmarks =

                    results.multiFaceLandmarks &&

                    results.multiFaceLandmarks[0]

                        ?

                        results.multiFaceLandmarks[0]

                        :

                        null;



                currentLandmarks =

                    landmarks;



                drawFaceMesh(

                    landmarks

                );



                // ------------------------------------------------
                // HUMAN DETECTED
                // ------------------------------------------------

                if (landmarks) {


                    if (

                        faceVisibleSince === 0

                    ) {


                        faceVisibleSince =

                            Date.now();

                    }



                    if (faceChip) {


                        faceChip.textContent =

                            "HUMAN DETECTED";


                        faceChip.classList.add(

                            "success"

                        );

                    }



                    if (

                        !authenticationStarted &&

                        !authenticationFinished

                    ) {


                        setStatus(

                            "Human Detected",

                            "Blink naturally once to continue automatically."

                        );



                        if (blinkChip) {


                            if (

                                !blinkState.detected

                            ) {


                                blinkChip.textContent =

                                    "BLINK ONCE";

                            }

                        }



                        /*
                        Require the face to remain visible briefly
                        before accepting blink detection.
                        */

                        if (

                            Date.now() -

                            faceVisibleSince >

                            500

                        ) {


                            processBlink(

                                landmarks

                            );

                        }

                    }

                }



                // ------------------------------------------------
                // NO HUMAN
                // ------------------------------------------------

                else {


                    faceVisibleSince = 0;


                    if (

                        !authenticationStarted &&

                        !authenticationFinished

                    ) {


                        if (faceChip) {


                            faceChip.textContent =

                                "SEARCHING FOR HUMAN";


                            faceChip.classList.remove(

                                "success"

                            );

                        }


                        setStatus(

                            "Waiting For Human",

                            "Place your complete face inside the camera frame."

                        );

                    }

                }

            }

        );



        // --------------------------------------------------------
        // FACE MESH LOOP
        // --------------------------------------------------------

        const detectionLoop =

            async () => {


                if (

                    cameraReady &&

                    video &&

                    video.readyState >= 2 &&

                    faceMesh &&

                    !meshRunning

                ) {


                    meshRunning = true;


                    try {


                        await faceMesh.send({

                            image: video

                        });

                    }


                    catch (error) {


                        console.warn(

                            "Velos Face Mesh:",

                            error

                        );

                    }


                    finally {


                        meshRunning = false;

                    }

                }



                animationFrame =

                    requestAnimationFrame(

                        detectionLoop

                    );

            };



        detectionLoop();

    }



    // ============================================================
    // LOAD FACE RECOGNITION MODELS
    // ============================================================

    async function loadFaceRecognitionModels() {

        await Promise.all([


            window.faceapi
                .nets
                .tinyFaceDetector
                .loadFromUri(

                    CONFIG.FACE_API_MODELS

                ),


            window.faceapi
                .nets
                .faceLandmark68Net
                .loadFromUri(

                    CONFIG.FACE_API_MODELS

                ),


            window.faceapi
                .nets
                .faceRecognitionNet
                .loadFromUri(

                    CONFIG.FACE_API_MODELS

                )

        ]);

    }



    // ============================================================
    // CAPTURE FACE DESCRIPTOR
    // ============================================================

    async function captureFaceDescriptor() {

        const options =

            new window.faceapi
                .TinyFaceDetectorOptions({

                    inputSize: 224,

                    scoreThreshold: 0.55

                });



        const detection =

            await window.faceapi

                .detectSingleFace(

                    video,

                    options

                )

                .withFaceLandmarks()

                .withFaceDescriptor();



        if (

            !detection ||

            !detection.descriptor

        ) {

            return null;

        }



        return Array.from(

            detection.descriptor

        );

    }



    // ============================================================
    // CAPTURE MULTIPLE FACE SAMPLES
    // ============================================================

    async function captureSamples(requiredSamples) {

        const samples = [];


        let attempts = 0;


        const maximumAttempts =

            requiredSamples * 8;



        while (

            samples.length < requiredSamples &&

            attempts < maximumAttempts

        ) {


            attempts++;



            if (

                !currentLandmarks

            ) {


                setStatus(

                    "Face Lost",

                    "Return your face to the center of the camera."

                );


                await sleep(

                    350

                );


                continue;

            }



            const descriptor =

                await captureFaceDescriptor();



            if (descriptor) {


                samples.push(

                    descriptor

                );



                setProgress(

                    samples.length /

                    requiredSamples

                );



                setStatus(

                    `Capturing Identity ${samples.length}/${requiredSamples}`,

                    "Keep looking directly at the camera."

                );

            }



            await sleep(

                350

            );

        }



        if (

            samples.length <

            requiredSamples

        ) {


            throw new Error(

                "Unable to capture enough clear face samples."

            );

        }



        return samples;

    }



    // ============================================================
    // AUTOMATIC AUTHENTICATION
    // ============================================================

    async function startAutomaticAuthentication() {

        if (

            authenticationStarted ||

            authenticationFinished

        ) {

            return;

        }



        if (

            !modelsReady ||

            !cameraReady ||

            !currentLandmarks ||

            !blinkState.detected

        ) {

            return;

        }



        authenticationStarted =

            true;



        if (backButton) {

            backButton.disabled =

                true;

        }



        if (resetButton) {

            resetButton.disabled =

                true;

        }



        try {


            setStatus(

                "Blink Captured",

                "Checking Velos identity database..."

            );



            const savedFace =

                await getSavedFace();



            // ====================================================
            // FIRST-TIME USER
            // ====================================================

            if (

                !savedFace ||

                !Array.isArray(

                    savedFace.descriptor

                )

            ) {


                modeBadge.textContent =

                    "REGISTERING USER";



                setStatus(

                    "Human Detected",

                    "First-time user. Registering face automatically..."

                );



                setProgress(0);



                const enrollmentSamples =

                    await captureSamples(

                        CONFIG.ENROLL_SAMPLES

                    );



                const registeredDescriptor =

                    averageDescriptors(

                        enrollmentSamples

                    );



                if (

                    !registeredDescriptor

                ) {


                    throw new Error(

                        "Unable to create face registration."

                    );

                }



                // ------------------------------------------------
                // AUTO REGISTER
                // ------------------------------------------------

                await saveFace(

                    registeredDescriptor

                );



                setProgress(1);



                modeBadge.textContent =

                    "REGISTERED";



                setStatus(

                    "Face Registered",

                    "Registration successful. Opening Velos..."

                );



                await sleep(

                    350

                );



                // ------------------------------------------------
                // GO TO INTERFACE
                // ------------------------------------------------

                await showHumanDetectedSuccess(

                    "FACE REGISTERED"

                );


                return;

            }



            // ====================================================
            // RETURNING USER
            // ====================================================

            modeBadge.textContent =

                "VERIFYING USER";



            setStatus(

                "Human Detected",

                "Blink captured. Comparing your identity..."

            );



            setProgress(0);



            const verificationSamples =

                await captureSamples(

                    CONFIG.VERIFY_SAMPLES

                );



            const currentDescriptor =

                averageDescriptors(

                    verificationSamples

                );



            if (

                !currentDescriptor

            ) {


                throw new Error(

                    "Unable to generate current face identity."

                );

            }



            const distance =

                euclideanDistance(

                    savedFace.descriptor,

                    currentDescriptor

                );



            console.log(

                "[Velos] Face distance:",

                distance

            );



            console.log(

                "[Velos] Required threshold:",

                CONFIG.MATCH_THRESHOLD

            );



            // ----------------------------------------------------
            // FACE DOES NOT MATCH
            // ----------------------------------------------------

            if (

                distance >

                CONFIG.MATCH_THRESHOLD

            ) {


                throw new Error(

                    "Face does not match the registered user."

                );

            }



            // ----------------------------------------------------
            // FACE MATCH
            // ----------------------------------------------------

            setProgress(1);



            modeBadge.textContent =

                "ACCESS GRANTED";



            setStatus(

                "Identity Matched",

                "Registered human confirmed."

            );



            await sleep(

                250

            );



            await showHumanDetectedSuccess(

                "FACE MATCHED"

            );

        }



        catch (error) {


            console.error(

                "[Velos Face Login]",

                error

            );



            authenticationStarted =

                false;



            authenticationFinished =

                false;



            blinkState = {

                closed: false,

                detected: false

            };



            setProgress(0);



            modeBadge.textContent =

                "ACCESS DENIED";



            setStatus(

                "Access Denied",

                error.message ||

                "Face authentication failed."

            );



            if (blinkChip) {


                blinkChip.textContent =

                    "BLINK AGAIN";


                blinkChip.classList.remove(

                    "success"

                );

            }



            if (backButton) {


                backButton.disabled =

                    false;

            }



            if (resetButton) {


                resetButton.disabled =

                    false;

            }


            /*
              Allow the next blink attempt after a short delay.
            */

            await sleep(

                1000

            );

        }

    }



    // ============================================================
    // HUMAN DETECTED SUCCESS
    // ============================================================

    async function showHumanDetectedSuccess(detail) {

        authenticationFinished =

            true;


        authenticationStarted =

            false;



        const successOverlay =

            document.getElementById(

                "velos-auto-success"

            );


        const successText =

            document.getElementById(

                "velos-auto-success-text"

            );



        if (successText) {


            successText.textContent =

                `${detail} • Opening Velos Interface`;

        }



        if (successOverlay) {


            successOverlay.classList.add(

                "visible"

            );

        }



        modeBadge.textContent =

            "ACCESS GRANTED";



        setStatus(

            "HUMAN DETECTED",

            "Identity confirmed. Opening interface for you..."

        );



        setProgress(1);



        // --------------------------------------------------------
        // STOP CAMERA
        // --------------------------------------------------------

        stopCamera();



        // --------------------------------------------------------
        // SHOW SUCCESS
        // --------------------------------------------------------

        await sleep(

            CONFIG.SUCCESS_DELAY

        );



        // ========================================================
        // MUST OPEN interface.html
        // ========================================================

        window.location.href =

            CONFIG.SUCCESS_URL;

    }



    // ============================================================
    // DETERMINE USER MODE
    // ============================================================

    async function determineUserMode() {

        const savedFace =

            await getSavedFace();



        if (

            savedFace &&

            Array.isArray(

                savedFace.descriptor

            )

        ) {


            modeBadge.textContent =

                "RETURNING USER";


            setStatus(

                "Ready For Human",

                "Look at the camera and blink once. Verification is automatic."

            );

        }


        else {


            modeBadge.textContent =

                "FIRST TIME USER";


            setStatus(

                "Ready To Register",

                "Look at the camera and blink once. Registration is automatic."

            );

        }

    }



    // ============================================================
    // CLOSE FACE LOGIN
    // ============================================================

    function closeFaceLogin() {

        stopCamera();



        if (

            root

        ) {


            root.remove();

        }



        root = null;



        if (

            landingPage

        ) {


            landingPage.style.display =

                "";

        }



        authenticationStarted =

            false;


        authenticationFinished =

            false;


        blinkState = {

            closed: false,

            detected: false

        };



        if (

            location.hash ===

            CONFIG.LOGIN_HASH

        ) {


            history.replaceState(

                null,

                "",

                location.pathname +

                location.search

            );

        }

    }



    // ============================================================
    // INITIALIZE FACE LOGIN
    // ============================================================

    async function initializeFaceLogin() {

        if (root) {

            return;

        }



        buildFaceLogin();



        try {


            setStatus(

                "Loading Velos Face Engine",

                "Preparing Face Mesh and recognition models..."

            );



            // ----------------------------------------------------
            // LOAD JAVASCRIPT LIBRARIES
            // ----------------------------------------------------

            await Promise.all([


                loadScript(

                    CONFIG.FACE_MESH_SCRIPT,

                    "FaceMesh"

                ),


                loadScript(

                    CONFIG.FACE_API_SCRIPT,

                    "faceapi"

                )

            ]);



            setStatus(

                "Starting Camera",

                "Preparing webcam and biometric models..."

            );



            // ----------------------------------------------------
            // CAMERA + MODELS
            // ----------------------------------------------------

            await Promise.all([


                startCamera(),


                loadFaceRecognitionModels()

            ]);



            // ----------------------------------------------------
            // FACE MESH
            // ----------------------------------------------------

            await initializeFaceMesh();



            modelsReady = true;



            await determineUserMode();

        }



        catch (error) {


            console.error(

                "[Velos Initialization]",

                error

            );



            modeBadge.textContent =

                "ERROR";



            setStatus(

                "Face Login Unavailable",

                error.message ||

                "Check camera permission and internet connection."

            );

        }

    }



    // ============================================================
    // OPEN FACE LOGIN
    // ============================================================

    function openFaceLogin(event) {

        if (event) {


            event.preventDefault();

        }



        if (

            location.hash !==

            CONFIG.LOGIN_HASH

        ) {


            history.pushState(

                {

                    velosFaceLogin: true

                },

                "",

                CONFIG.LOGIN_HASH

            );

        }



        initializeFaceLogin();

    }



    // ============================================================
    // CONNECT TO LANDING PAGE
    // ============================================================

    function connectLandingPage() {

        const presentationButton =

            document.querySelector(

                ".cta"

            );



        if (

            presentationButton

        ) {


            // ----------------------------------------------------
            // DO NOT ALLOW DIRECT interface.html ACCESS FROM CTA
            // ----------------------------------------------------

            presentationButton.setAttribute(

                "href",

                CONFIG.LOGIN_HASH

            );



            presentationButton.addEventListener(

                "click",

                openFaceLogin

            );

        }



        // --------------------------------------------------------
        // BROWSER BACK
        // --------------------------------------------------------

        window.addEventListener(

            "popstate",

            () => {


                if (

                    location.hash ===

                    CONFIG.LOGIN_HASH

                ) {


                    initializeFaceLogin();

                }


                else if (

                    root

                ) {


                    closeFaceLogin();

                }

            }

        );



        // --------------------------------------------------------
        // DIRECT #face-login
        // --------------------------------------------------------

        if (

            location.hash ===

            CONFIG.LOGIN_HASH

        ) {


            initializeFaceLogin();

        }

    }



    // ============================================================
    // START VELOS FACE LOGIN
    // ============================================================

    if (

        document.readyState ===

        "loading"

    ) {


        document.addEventListener(

            "DOMContentLoaded",

            connectLandingPage,

            {

                once: true

            }

        );

    }


    else {


        connectLandingPage();

    }

})();