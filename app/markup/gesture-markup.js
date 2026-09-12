(() => {
    "use strict";

    if (window.velosMarkup?.__v4) return;

    const CFG = {
        minPoints: 5,
        minDistance: 20,

        penDownFrames: 2,
        penUpFrames: 2,

        drawSmooth: 0.42,
        cursorSmooth: 0.68,
        dragSmooth: 0.72,

        // EASY SELECTION
        hoverPadding: 32,
        hoverReleasePadding: 60,

        fistFrames: 2,
        handLostTimeout: 500,

        confidence: 0.60
    };

    const COLOR = {
        circle: "#ff5555",
        arrow: "#42a5f5",
        rectangle: "#ab47bc",
        underline: "#26a69a",
        check: "#66bb6a",
        slash: "#ffa726",
        freehand: "#ef5350",
        preview: "rgba(66,165,245,.65)",
        hover: "rgba(255,255,255,.9)",
        selected: "#2196f3"
    };


    /* =====================================================
       STATE
    ===================================================== */

    let enabled = false;

    let sourceCanvas = null;
    let canvas = null;
    let ctx = null;

    let annotations = [];

    let points = [];
    let penDown = false;

    let downFrames = 0;
    let upFrames = 0;
    let fistCount = 0;

    let drawSmoothPoint = null;
    let cursorSmoothPoint = null;

    let cursor = null;

    let hoverId = null;
    let selectedId = null;

    let mode = "idle";

    let handDrag = null;
    let mouseDrag = null;

    let handLostTimer = null;

    let idCounter = 0;


    /* =====================================================
       BASIC UTILITIES
    ===================================================== */

    const dist = (a, b) =>
        Math.hypot(
            a.x - b.x,
            a.y - b.y
        );


    const clamp = (v, a, b) =>
        Math.max(a, Math.min(b, v));


    function currentSlide() {

        try {

            const value =
                window.velosApp?.currentSlideIndex;

            if (typeof value === "function") {
                return value() ?? 0;
            }

            return Number.isFinite(value)
                ? value
                : 0;

        } catch {
            return 0;
        }
    }


    function pathLength(arr) {

        let length = 0;

        for (let i = 1; i < arr.length; i++) {
            length += dist(arr[i - 1], arr[i]);
        }

        return length;
    }


    function bounds(arr) {

        if (!arr?.length) return null;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const p of arr) {

            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);

            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }

        return {
            minX,
            minY,
            maxX,
            maxY,

            width: maxX - minX,
            height: maxY - minY
        };
    }


    function segmentDistance(p, a, b) {

        const vx = b.x - a.x;
        const vy = b.y - a.y;

        const length2 =
            vx * vx +
            vy * vy;

        if (!length2) {
            return dist(p, a);
        }

        const t = clamp(
            (
                (p.x - a.x) * vx +
                (p.y - a.y) * vy
            ) / length2,
            0,
            1
        );

        return dist(
            p,
            {
                x: a.x + vx * t,
                y: a.y + vy * t
            }
        );
    }


    function smooth(previous, next, amount) {

        if (!previous) {
            return { ...next };
        }

        return {
            x:
                previous.x +
                (next.x - previous.x) *
                amount,

            y:
                previous.y +
                (next.y - previous.y) *
                amount
        };
    }


    function newId() {

        if (crypto?.randomUUID) {
            return crypto.randomUUID();
        }

        return (
            "markup-" +
            Date.now() +
            "-" +
            (++idCounter)
        );
    }


    /* =====================================================
       CANVAS
    ===================================================== */

    function getSourceCanvas() {

        sourceCanvas =
            window.velosApp?.getDrawCanvas?.()
            ||
            document.getElementById("drawCanvas")
            ||
            sourceCanvas;

        return sourceCanvas;
    }


    function ensureCanvas() {

        if (canvas?.isConnected) {
            return true;
        }

        const source = getSourceCanvas();

        if (!source) {
            return false;
        }

        canvas =
            document.createElement("canvas");

        canvas.id =
            "velosMarkupObjectCanvas";

        Object.assign(
            canvas.style,
            {
                position: "fixed",
                pointerEvents: "none",
                touchAction: "none",
                background: "transparent",
                zIndex: "2147483000"
            }
        );

        document.body.appendChild(canvas);

        ctx =
            canvas.getContext("2d");

        syncCanvas();

        return true;
    }


    function syncCanvas() {

        const source = getSourceCanvas();

        if (!source || !canvas) return;

        const r =
            source.getBoundingClientRect();

        canvas.style.left =
            r.left + "px";

        canvas.style.top =
            r.top + "px";

        canvas.style.width =
            r.width + "px";

        canvas.style.height =
            r.height + "px";

        canvas.width =
            source.width ||
            Math.max(1, Math.round(r.width));

        canvas.height =
            source.height ||
            Math.max(1, Math.round(r.height));

        redraw();
    }


    function clientPoint(x, y) {

        if (!canvas) return null;

        const r =
            canvas.getBoundingClientRect();

        if (!r.width || !r.height) {
            return null;
        }

        return {
            x:
                (x - r.left) *
                canvas.width /
                r.width,

            y:
                (y - r.top) *
                canvas.height /
                r.height
        };
    }


    /* =====================================================
       HAND DETECTION
    ===================================================== */

    function validLandmarks(lm) {
        return (
            Array.isArray(lm) &&
            lm.length >= 21 &&
            Number.isFinite(lm[8]?.x) &&
            Number.isFinite(lm[8]?.y)
        );
    }


    function extractLandmarks(detail) {

        const possibilities = [
            detail?.landmarks,
            detail?.handLandmarks,
            detail?.hands?.[0]?.landmarks,
            detail?.hands?.[0],
            detail?.multiHandLandmarks?.[0],
            detail?.results?.multiHandLandmarks?.[0]
        ];

        return possibilities.find(validLandmarks)
            || null;
    }


    function fingerOpen(lm, tip, pip) {

        return (
            dist(lm[tip], lm[0])
            >
            dist(lm[pip], lm[0]) * 1.03
        );
    }


    function thumbOpen(lm) {

        if (
            !lm[2] ||
            !lm[3] ||
            !lm[4] ||
            !lm[5]
        ) return false;

        return (
            dist(lm[4], lm[2])
            >
            dist(lm[3], lm[2]) * 1.15
        );
    }


    function poses(lm) {

        const index =
            fingerOpen(lm, 8, 6);

        const middle =
            fingerOpen(lm, 12, 10);

        const ring =
            fingerOpen(lm, 16, 14);

        const pinky =
            fingerOpen(lm, 20, 18);

        const thumb =
            thumbOpen(lm);

        return {
            draw:
                index &&
                !middle &&
                !ring &&
                !pinky,

            open:
                thumb &&
                index &&
                middle &&
                ring &&
                pinky,

            fist:
                !index &&
                !middle &&
                !ring &&
                !pinky
        };
    }


    function fingertip(lm) {

        if (!canvas) return null;

        return {
            x:
                (1 - lm[8].x) *
                canvas.width,

            y:
                lm[8].y *
                canvas.height
        };
    }


    function palmPoint(lm) {

        if (!canvas) return null;

        const ids =
            [0, 5, 9, 13, 17];

        let x = 0;
        let y = 0;

        for (const id of ids) {
            x += lm[id].x;
            y += lm[id].y;
        }

        x /= ids.length;
        y /= ids.length;

        return {
            x:
                (1 - x) *
                canvas.width,

            y:
                y *
                canvas.height
        };
    }


    /* =====================================================
       RECOGNITION
    ===================================================== */

    function lineFit(arr) {

        if (arr.length < 2) return null;

        const start = arr[0];
        const end = arr[arr.length - 1];

        const direct =
            dist(start, end);

        if (direct < 1) return null;

        let deviation = 0;

        for (const p of arr) {
            deviation = Math.max(
                deviation,
                segmentDistance(
                    p,
                    start,
                    end
                )
            );
        }

        const ratio =
            deviation / direct;

        return {
            start: { ...start },
            end: { ...end },
            direct,
            ratio,
            confidence:
                Math.max(
                    0,
                    1 - ratio * 2.4
                )
        };
    }


    function detectCircle(arr) {

        if (arr.length < 10) return null;

        const b = bounds(arr);

        if (
            b.width < 25 ||
            b.height < 25
        ) return null;

        const ratio =
            Math.max(b.width, b.height) /
            Math.max(
                1,
                Math.min(
                    b.width,
                    b.height
                )
            );

        if (ratio > 1.6) return null;

        const center = {
            x:
                (b.minX + b.maxX) / 2,

            y:
                (b.minY + b.maxY) / 2
        };

        const radius =
            (b.width + b.height) / 4;

        const closure =
            dist(
                arr[0],
                arr[arr.length - 1]
            ) / radius;

        if (closure > 1) return null;

        let error = 0;

        for (const p of arr) {
            error +=
                Math.abs(
                    dist(p, center) -
                    radius
                );
        }

        error /=
            arr.length *
            radius;

        if (error > 0.30) return null;

        return {
            type: "circle",

            confidence:
                1 - error,

            data: {
                center,
                radius
            }
        };
    }


    function detectRectangle(arr) {

        if (arr.length < 12) return null;

        const b = bounds(arr);

        if (
            b.width < 30 ||
            b.height < 25
        ) return null;

        const diagonal =
            Math.hypot(
                b.width,
                b.height
            );

        if (
            dist(
                arr[0],
                arr[arr.length - 1]
            )
            >
            diagonal * 0.32
        ) return null;

        let error = 0;

        for (const p of arr) {

            error += Math.min(
                Math.abs(p.x - b.minX),
                Math.abs(p.x - b.maxX),
                Math.abs(p.y - b.minY),
                Math.abs(p.y - b.maxY)
            );
        }

        error /=
            arr.length *
            Math.min(
                b.width,
                b.height
            );

        if (error > 0.13) return null;

        return {
            type: "rectangle",

            confidence:
                1 - error * 3,

            data: {
                x: b.minX,
                y: b.minY,
                width: b.width,
                height: b.height
            }
        };
    }


    function detectCheck(arr) {

        if (arr.length < 7) return null;

        const b = bounds(arr);

        if (
            b.width < 24 ||
            b.height < 16
        ) return null;

        let corner = 0;

        for (let i = 1; i < arr.length; i++) {
            if (arr[i].y > arr[corner].y) {
                corner = i;
            }
        }

        if (
            corner < arr.length * 0.15 ||
            corner > arr.length * 0.75
        ) return null;

        const a = arr[0];
        const m = arr[corner];
        const c = arr[arr.length - 1];

        if (
            !(a.x < m.x && m.x < c.x) ||
            !(a.y < m.y && c.y < m.y)
        ) return null;

        return {
            type: "check",
            confidence: 0.80,

            data: {
                points: [
                    { ...a },
                    { ...m },
                    { ...c }
                ]
            }
        };
    }


    function detectArrow(arr) {

        if (arr.length < 10) return null;

        const start =
            arr[0];

        let tipIndex = 0;
        let maximum = 0;

        for (let i = 1; i < arr.length; i++) {

            const d =
                dist(
                    start,
                    arr[i]
                );

            if (d > maximum) {
                maximum = d;
                tipIndex = i;
            }
        }

        if (
            maximum < 45 ||
            tipIndex < arr.length * 0.45
        ) return null;

        const shaft =
            lineFit(
                arr.slice(
                    0,
                    tipIndex + 1
                )
            );

        if (
            !shaft ||
            shaft.ratio > 0.17
        ) return null;

        const remaining =
            arr.slice(
                tipIndex + 1
            );

        if (remaining.length < 2) {
            return null;
        }

        const tip =
            arr[tipIndex];

        let wing = 0;

        for (const p of remaining) {
            wing =
                Math.max(
                    wing,
                    dist(p, tip)
                );
        }

        if (
            wing < 8 ||
            wing > maximum * 0.55
        ) return null;

        return {
            type: "arrow",
            confidence: 0.82,

            data: {
                start: { ...start },
                end: { ...tip }
            }
        };
    }


    function detectLine(arr) {

        const fit =
            lineFit(arr);

        if (
            !fit ||
            fit.direct < 40 ||
            fit.ratio > 0.18
        ) return null;

        const angle =
            Math.abs(
                Math.atan2(
                    fit.end.y -
                    fit.start.y,

                    fit.end.x -
                    fit.start.x
                ) *
                180 /
                Math.PI
            );

        return {
            type:
                angle < 20 ||
                angle > 160
                    ? "underline"
                    : "slash",

            confidence:
                fit.confidence,

            data: {
                start: fit.start,
                end: fit.end
            }
        };
    }


    function recognize(arr) {

        const results = [
            detectCircle(arr),
            detectRectangle(arr),
            detectCheck(arr),
            detectArrow(arr),
            detectLine(arr)
        ]
        .filter(Boolean)
        .sort(
            (a, b) =>
                b.confidence -
                a.confidence
        );

        const best =
            results[0];

        return (
            best &&
            best.confidence >=
            CFG.confidence
        )
            ? best
            : null;
    }


    /* =====================================================
       CREATE OBJECT
    ===================================================== */

    function createObject(stroke) {

        const recognized =
            recognize(stroke);

        if (recognized) {

            return {
                id: newId(),
                slide: currentSlide(),
                type: recognized.type,
                data: recognized.data
            };
        }

        /*
         * Never lose the user's drawing.
         */
        return {
            id: newId(),
            slide: currentSlide(),
            type: "freehand",

            data: {
                points:
                    stroke.map(
                        p => ({ ...p })
                    )
            }
        };
    }


    /* =====================================================
       DRAW OBJECTS
    ===================================================== */

    function drawPath(
        arr,
        color,
        width = 4
    ) {

        if (!arr?.length) return;

        ctx.beginPath();

        ctx.moveTo(
            arr[0].x,
            arr[0].y
        );

        for (let i = 1; i < arr.length; i++) {

            ctx.lineTo(
                arr[i].x,
                arr[i].y
            );
        }

        ctx.strokeStyle =
            color;

        ctx.lineWidth =
            width;

        ctx.lineCap =
            "round";

        ctx.lineJoin =
            "round";

        ctx.stroke();
    }


    function drawArrow(data) {

        drawPath(
            [
                data.start,
                data.end
            ],
            COLOR.arrow,
            4
        );

        const angle =
            Math.atan2(
                data.end.y -
                data.start.y,

                data.end.x -
                data.start.x
            );

        const length =
            clamp(
                dist(
                    data.start,
                    data.end
                ) * 0.22,
                12,
                26
            );

        const spread =
            Math.PI / 7;

        drawPath(
            [
                {
                    x:
                        data.end.x -
                        length *
                        Math.cos(
                            angle -
                            spread
                        ),

                    y:
                        data.end.y -
                        length *
                        Math.sin(
                            angle -
                            spread
                        )
                },

                data.end,

                {
                    x:
                        data.end.x -
                        length *
                        Math.cos(
                            angle +
                            spread
                        ),

                    y:
                        data.end.y -
                        length *
                        Math.sin(
                            angle +
                            spread
                        )
                }
            ],
            COLOR.arrow,
            4
        );
    }


    function drawObject(a) {

        ctx.save();

        switch (a.type) {

            case "circle":

                ctx.beginPath();

                ctx.arc(
                    a.data.center.x,
                    a.data.center.y,
                    a.data.radius,
                    0,
                    Math.PI * 2
                );

                ctx.strokeStyle =
                    COLOR.circle;

                ctx.lineWidth = 4;

                ctx.stroke();

                break;


            case "rectangle":

                ctx.strokeStyle =
                    COLOR.rectangle;

                ctx.lineWidth = 4;

                ctx.strokeRect(
                    a.data.x,
                    a.data.y,
                    a.data.width,
                    a.data.height
                );

                break;


            case "arrow":

                drawArrow(a.data);

                break;


            case "underline":

                drawPath(
                    [
                        a.data.start,
                        a.data.end
                    ],
                    COLOR.underline,
                    5
                );

                break;


            case "slash":

                drawPath(
                    [
                        a.data.start,
                        a.data.end
                    ],
                    COLOR.slash,
                    4
                );

                break;


            case "check":

                drawPath(
                    a.data.points,
                    COLOR.check,
                    5
                );

                break;


            default:

                drawPath(
                    a.data.points,
                    COLOR.freehand,
                    4
                );
        }

        ctx.restore();
    }


    /* =====================================================
       OBJECT BOUNDS
    ===================================================== */

    function objectBounds(a) {

        switch (a.type) {

            case "circle":

                return {
                    minX:
                        a.data.center.x -
                        a.data.radius,

                    minY:
                        a.data.center.y -
                        a.data.radius,

                    maxX:
                        a.data.center.x +
                        a.data.radius,

                    maxY:
                        a.data.center.y +
                        a.data.radius
                };


            case "rectangle":

                return {
                    minX: a.data.x,
                    minY: a.data.y,

                    maxX:
                        a.data.x +
                        a.data.width,

                    maxY:
                        a.data.y +
                        a.data.height
                };


            case "arrow":
            case "underline":
            case "slash":

                return bounds(
                    [
                        a.data.start,
                        a.data.end
                    ]
                );


            default:

                return bounds(
                    a.data.points
                );
        }
    }


    function drawBoundary(
        object,
        selected = false
    ) {

        const b =
            objectBounds(object);

        if (!b) return;

        const pad =
            selected ? 10 : 8;

        ctx.save();

        ctx.strokeStyle =
            selected
                ? COLOR.selected
                : COLOR.hover;

        ctx.lineWidth =
            selected ? 2 : 1.5;

        ctx.setLineDash(
            selected
                ? [7, 4]
                : [4, 4]
        );

        ctx.strokeRect(
            b.minX - pad,
            b.minY - pad,

            b.maxX -
            b.minX +
            pad * 2,

            b.maxY -
            b.minY +
            pad * 2
        );

        ctx.restore();
    }


    /* =====================================================
       FAST / STICKY HOVER
    ===================================================== */

    function distanceToBounds(p, b) {

        const dx =
            Math.max(
                b.minX - p.x,
                0,
                p.x - b.maxX
            );

        const dy =
            Math.max(
                b.minY - p.y,
                0,
                p.y - b.maxY
            );

        return Math.hypot(dx, dy);
    }


    function hoverTarget(p) {

        if (!p) return null;

        const slide =
            currentSlide();


        /*
         * Sticky existing hover.
         * Prevents jitter from losing object.
         */
        if (hoverId) {

            const current =
                annotations.find(
                    a =>
                        a.id === hoverId &&
                        a.slide === slide
                );

            if (current) {

                const b =
                    objectBounds(current);

                if (
                    b &&
                    distanceToBounds(p, b)
                    <=
                    CFG.hoverReleasePadding
                ) {

                    return current;
                }
            }
        }


        /*
         * Find nearest object.
         */
        let best = null;
        let bestDistance = Infinity;

        for (const a of annotations) {

            if (a.slide !== slide) {
                continue;
            }

            const b =
                objectBounds(a);

            if (!b) continue;

            const d =
                distanceToBounds(p, b);

            if (
                d <= CFG.hoverPadding &&
                d < bestDistance
            ) {

                best = a;
                bestDistance = d;
            }
        }

        return best;
    }


    function updateHover(p) {

        const target =
            hoverTarget(p);

        hoverId =
            target?.id ||
            null;

        return target;
    }


    /* =====================================================
       VIRTUAL CURSOR
    ===================================================== */

    function drawCursor() {

        if (
            !enabled ||
            !cursor
        ) return;


        ctx.save();

        ctx.translate(
            cursor.x,
            cursor.y
        );


        /*
         * Fist / grabbed.
         */
        if (mode === "grab") {

            ctx.beginPath();

            ctx.arc(
                0,
                0,
                10,
                0,
                Math.PI * 2
            );

            ctx.fillStyle =
                "#fff";

            ctx.strokeStyle =
                "#111";

            ctx.lineWidth = 3;

            ctx.fill();
            ctx.stroke();

            ctx.restore();

            return;
        }


        /*
         * Drawing pointer.
         */
        if (mode === "draw") {

            ctx.beginPath();

            ctx.arc(
                0,
                0,
                5,
                0,
                Math.PI * 2
            );

            ctx.fillStyle =
                "#fff";

            ctx.strokeStyle =
                "#111";

            ctx.lineWidth = 2;

            ctx.fill();
            ctx.stroke();

            ctx.restore();

            return;
        }


        /*
         * Mouse arrow.
         */
        ctx.beginPath();

        ctx.moveTo(0, 0);
        ctx.lineTo(0, 25);
        ctx.lineTo(6, 19);
        ctx.lineTo(12, 30);
        ctx.lineTo(17, 27);
        ctx.lineTo(11, 17);
        ctx.lineTo(21, 17);

        ctx.closePath();

        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 2;

        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }


    /* =====================================================
       REDRAW
    ===================================================== */

    function redraw() {

        if (!ctx || !canvas) return;

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        const slide =
            currentSlide();

        const visible =
            annotations.filter(
                a =>
                    a.slide === slide
            );


        for (const a of visible) {
            drawObject(a);
        }


        const hover =
            visible.find(
                a => a.id === hoverId
            );

        if (
            hover &&
            hover.id !== selectedId
        ) {

            drawBoundary(
                hover,
                false
            );
        }


        const selected =
            visible.find(
                a => a.id === selectedId
            );

        if (selected) {

            drawBoundary(
                selected,
                true
            );
        }


        if (
            penDown &&
            points.length > 1
        ) {

            drawPath(
                points,
                COLOR.preview,
                3
            );
        }


        drawCursor();
    }


    /* =====================================================
       MOVE OBJECT
    ===================================================== */

    function moveObject(
        object,
        dx,
        dy
    ) {

        if (!object) return;


        const movePoint = p => {
            p.x += dx;
            p.y += dy;
        };


        switch (object.type) {

            case "circle":

                movePoint(
                    object.data.center
                );

                break;


            case "rectangle":

                object.data.x += dx;
                object.data.y += dy;

                break;


            case "arrow":
            case "underline":
            case "slash":

                movePoint(
                    object.data.start
                );

                movePoint(
                    object.data.end
                );

                break;


            default:

                object.data.points
                    ?.forEach(
                        movePoint
                    );
        }
    }


    /* =====================================================
       DRAWING
    ===================================================== */

    function finishDrawing() {

        if (!penDown) return;

        penDown = false;

        if (
            points.length >=
            CFG.minPoints

            &&

            pathLength(points) >=
            CFG.minDistance
        ) {

            const object =
                createObject(points);

            annotations.push(
                object
            );

            selectedId =
                object.id;
        }

        points = [];
        drawSmoothPoint = null;

        redraw();
    }


    function drawPoint(p) {

        drawSmoothPoint =
            smooth(
                drawSmoothPoint,
                p,
                CFG.drawSmooth
            );

        const last =
            points[
                points.length - 1
            ];

        if (
            !last ||
            dist(
                last,
                drawSmoothPoint
            ) > 1.2
        ) {

            points.push({
                ...drawSmoothPoint
            });
        }

        redraw();
    }


    /* =====================================================
       HAND GRAB
    ===================================================== */

    function startGrab(lm) {

        /*
         * IMPORTANT:
         * Grab highlighted object directly.
         */
        let object =
            annotations.find(
                a =>
                    a.id === hoverId &&
                    a.slide === currentSlide()
            );


        /*
         * Fallback to proximity search.
         */
        if (!object) {

            object =
                hoverTarget(cursor);
        }


        if (!object) return false;


        const palm =
            palmPoint(lm);

        if (!palm) return false;


        selectedId =
            object.id;

        hoverId =
            object.id;


        handDrag = {
            id: object.id,

            last: {
                ...palm
            },

            smooth: {
                ...palm
            }
        };


        return true;
    }


    function updateGrab(lm) {

        if (!handDrag) return;

        const raw =
            palmPoint(lm);

        if (!raw) return;


        const palm =
            smooth(
                handDrag.smooth,
                raw,
                CFG.dragSmooth
            );


        const object =
            annotations.find(
                a =>
                    a.id ===
                    handDrag.id
            );


        if (!object) {

            handDrag = null;
            return;
        }


        let dx =
            palm.x -
            handDrag.last.x;

        let dy =
            palm.y -
            handDrag.last.y;


        /*
         * Prevent MediaPipe jump.
         */
        dx =
            clamp(
                dx,
                -55,
                55
            );

        dy =
            clamp(
                dy,
                -55,
                55
            );


        moveObject(
            object,
            dx,
            dy
        );


        /*
         * Cursor follows dragged object.
         */
        if (cursor) {

            cursor.x += dx;
            cursor.y += dy;
        }


        handDrag.last = {
            ...palm
        };

        handDrag.smooth = {
            ...palm
        };


        selectedId =
            object.id;

        hoverId =
            object.id;


        redraw();
    }


    function dropGrab() {

        handDrag = null;

        redraw();
    }


    /* =====================================================
       MAIN HAND FUNCTION
    ===================================================== */

    function feedLandmarks(lm) {

        if (
            !enabled ||
            !validLandmarks(lm)
        ) return false;


        ensureCanvas();


        clearTimeout(
            handLostTimer
        );


        handLostTimer =
            setTimeout(
                () => {

                    if (handDrag) {
                        dropGrab();
                    }

                    cursor = null;

                    cursorSmoothPoint = null;

                    hoverId = null;

                    mode = "idle";

                    redraw();

                },
                CFG.handLostTimeout
            );


        const pose =
            poses(lm);


        /* ===============================================
           ✊ FIST = GRAB
        =============================================== */

        if (pose.fist) {

            fistCount++;


            if (penDown) {
                finishDrawing();
            }


            mode = "grab";


            if (
                !handDrag &&
                fistCount >=
                CFG.fistFrames
            ) {

                startGrab(lm);
            }


            if (handDrag) {
                updateGrab(lm);
            }


            redraw();

            return true;
        }


        fistCount = 0;


        /*
         * Fist opened = DROP.
         */
        if (handDrag) {
            dropGrab();
        }


        /* ===============================================
           🖐 OPEN HAND = MOVE CURSOR
        =============================================== */

        if (pose.open) {

            if (penDown) {
                finishDrawing();
            }


            mode = "move";

            downFrames = 0;
            upFrames = 0;


            const raw =
                fingertip(lm);


            cursorSmoothPoint =
                smooth(
                    cursorSmoothPoint,
                    raw,
                    CFG.cursorSmooth
                );


            cursor = {
                ...cursorSmoothPoint
            };


            updateHover(
                cursor
            );


            redraw();

            return true;
        }


        /* ===============================================
           ☝ INDEX ONLY = DRAW
        =============================================== */

        if (pose.draw) {

            mode = "draw";

            hoverId = null;


            cursor =
                fingertip(lm);


            downFrames++;
            upFrames = 0;


            if (
                !penDown &&
                downFrames >=
                CFG.penDownFrames
            ) {

                penDown = true;

                points = [];

                drawSmoothPoint = null;
            }


            if (
                penDown &&
                cursor
            ) {

                drawPoint(
                    cursor
                );
            }


            return true;
        }


        /* ===============================================
           TRANSITION POSE
        =============================================== */

        mode = "idle";

        downFrames = 0;


        if (penDown) {

            upFrames++;

            if (
                upFrames >=
                CFG.penUpFrames
            ) {

                finishDrawing();
            }
        }

        redraw();

        return true;
    }


    /* =====================================================
       HAND EVENT
    ===================================================== */

    function onHands(event) {

        const lm =
            extractLandmarks(
                event.detail
            );

        if (lm) {
            feedLandmarks(lm);
        }
    }


    /* =====================================================
       MOUSE HOVER + DRAG
    ===================================================== */

    function onPointerMove(e) {

        if (!enabled) return;

        const p =
            clientPoint(
                e.clientX,
                e.clientY
            );

        if (!p) return;


        /*
         * Normal hover.
         */
        if (!mouseDrag) {

            updateHover(p);

            redraw();

            return;
        }


        if (
            mouseDrag.pointerId !==
            e.pointerId
        ) return;


        const object =
            annotations.find(
                a =>
                    a.id ===
                    mouseDrag.id
            );

        if (!object) {
            mouseDrag = null;
            return;
        }


        const dx =
            p.x -
            mouseDrag.last.x;

        const dy =
            p.y -
            mouseDrag.last.y;


        moveObject(
            object,
            dx,
            dy
        );


        mouseDrag.last = p;

        selectedId = object.id;
        hoverId = object.id;

        redraw();

        e.preventDefault();
    }


    function onPointerDown(e) {

        if (
            !enabled ||
            e.button > 0
        ) return;


        const p =
            clientPoint(
                e.clientX,
                e.clientY
            );

        if (!p) return;


        /*
         * Use currently highlighted object.
         */
        let object =
            annotations.find(
                a =>
                    a.id === hoverId &&
                    a.slide === currentSlide()
            );


        if (!object) {
            object = hoverTarget(p);
        }


        if (!object) {

            selectedId = null;
            redraw();

            return;
        }


        selectedId =
            object.id;

        hoverId =
            object.id;


        mouseDrag = {
            id: object.id,
            pointerId: e.pointerId,
            last: p
        };


        redraw();

        e.preventDefault();
    }


    function onPointerUp(e) {

        if (
            mouseDrag &&
            mouseDrag.pointerId ===
            e.pointerId
        ) {

            mouseDrag = null;

            redraw();
        }
    }


    /* =====================================================
       KEYBOARD
    ===================================================== */

    function onKeyDown(e) {

        if (
            !enabled ||
            !selectedId
        ) return;


        const object =
            annotations.find(
                a =>
                    a.id === selectedId
            );

        if (!object) return;


        if (
            e.key === "Delete" ||
            e.key === "Backspace"
        ) {

            annotations =
                annotations.filter(
                    a =>
                        a.id !== selectedId
                );

            selectedId = null;
            hoverId = null;

            redraw();

            e.preventDefault();

            return;
        }


        const step =
            e.shiftKey
                ? 10
                : 2;


        let dx = 0;
        let dy = 0;


        if (e.key === "ArrowLeft") {
            dx = -step;
        }

        else if (e.key === "ArrowRight") {
            dx = step;
        }

        else if (e.key === "ArrowUp") {
            dy = -step;
        }

        else if (e.key === "ArrowDown") {
            dy = step;
        }

        else {
            return;
        }


        moveObject(
            object,
            dx,
            dy
        );

        redraw();

        e.preventDefault();
    }


    /* =====================================================
       PUBLIC API
    ===================================================== */

    window.velosMarkup = {

        __v4: true,


        enableMarkup() {

            if (enabled) return true;

            enabled = true;

            ensureCanvas();
            syncCanvas();

            window.addEventListener(
                "velosHandsDetected",
                onHands
            );

            redraw();

            return true;
        },


        disableMarkup() {

            enabled = false;

            window.removeEventListener(
                "velosHandsDetected",
                onHands
            );

            clearTimeout(
                handLostTimer
            );

            if (penDown) {
                finishDrawing();
            }


            mode = "idle";

            cursor = null;
            cursorSmoothPoint = null;

            handDrag = null;
            mouseDrag = null;

            hoverId = null;

            redraw();

            return true;
        },


        isEnabled() {
            return enabled;
        },


        feedLandmarks,


        redrawAll() {
            ensureCanvas();
            syncCanvas();
        },


        getAnnotations() {
            return annotations;
        },


        getSelected() {
            return (
                annotations.find(
                    a =>
                        a.id === selectedId
                )
                || null
            );
        },


        clearAnnotations() {

            const slide =
                currentSlide();

            annotations =
                annotations.filter(
                    a =>
                        a.slide !== slide
                );

            selectedId = null;
            hoverId = null;

            redraw();
        },


        clearAllAnnotations() {

            annotations = [];

            selectedId = null;
            hoverId = null;

            redraw();
        },


        undoLast() {

            const slide =
                currentSlide();

            for (
                let i =
                    annotations.length - 1;
                i >= 0;
                i--
            ) {

                if (
                    annotations[i].slide ===
                    slide
                ) {

                    const removed =
                        annotations.splice(
                            i,
                            1
                        )[0];

                    if (
                        selectedId === removed.id
                    ) {
                        selectedId = null;
                    }

                    hoverId = null;

                    redraw();

                    return removed;
                }
            }

            return null;
        },


        exportTranscript() {

            return {
                version: 4,
                created:
                    new Date()
                    .toISOString(),

                annotations
            };
        }
    };


    /* =====================================================
       GLOBAL EVENTS
    ===================================================== */

    window.addEventListener(
        "pointermove",
        onPointerMove,
        true
    );

    window.addEventListener(
        "pointerdown",
        onPointerDown,
        true
    );

    window.addEventListener(
        "pointerup",
        onPointerUp,
        true
    );

    window.addEventListener(
        "pointercancel",
        onPointerUp,
        true
    );

    window.addEventListener(
        "keydown",
        onKeyDown,
        true
    );

    window.addEventListener(
        "resize",
        syncCanvas
    );

    window.addEventListener(
        "velosSlideChanged",
        () => {

            hoverId = null;
            selectedId = null;
            handDrag = null;

            syncCanvas();
        }
    );


    ensureCanvas();


    window.dispatchEvent(
        new CustomEvent(
            "velosMarkupReady"
        )
    );


    console.log(
        "✅ Velos compact markup loaded"
    );

})();