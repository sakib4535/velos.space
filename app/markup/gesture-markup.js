/**
 * Velos Gesture Markup - Complete Replacement
 * -------------------------------------------
 * Replace the entire old gesture-markup.js with this file.
 *
 * Required from app.js:
 *   window.dispatchEvent(new CustomEvent("velosHandsDetected", {
 *     detail: { landmarks: handLandmarks }
 *   }));
 *
 * Supported hand payloads include:
 *   detail.landmarks
 *   detail.handLandmarks
 *   detail.hands[0]
 *   detail.hands[0].landmarks
 *   detail.multiHandLandmarks[0]
 *   detail.results.multiHandLandmarks[0]
 *
 * Public API:
 *   window.velosMarkup.enableMarkup()
 *   window.velosMarkup.disableMarkup()
 *   window.velosMarkup.isEnabled()
 *   window.velosMarkup.getStatus()
 *   window.velosMarkup.clearAnnotations()
 *   window.velosMarkup.clearAllAnnotations()
 *   window.velosMarkup.getAnnotations()
 *   window.velosMarkup.redrawAll()
 *   window.velosMarkup.feedLandmarks(landmarks)
 */

(() => {
  "use strict";

  // ============================================================
  // CONFIG
  // ============================================================

  const CONFIG = Object.freeze({
    // Startup
    canvasRetryMs: 100,
    canvasRetryCount: 50,
    handWarningMs: 3000,

    // Drawing
    minTrailPoints: 8,
    maxTrailPoints: 260,
    minTravelPx: 35,
    movementThresholdPx: 2.5,
    idleFinalizeMs: 450,
    maxGestureMs: 5000,

    // Pose
    requireDrawingPose: true,
    penDownStableFrames: 2,
    penUpStableFrames: 2,

    // Smoothing
    smoothingAlphaSlow: 0.22,
    smoothingAlphaFast: 0.58,
    smoothingFastDistancePx: 25,

    // Recognition
    minConfidence: 0.55,

    // UI
    showToast: true,
    showLiveTrail: true,
    debug: false,
  });

  const COLORS = Object.freeze({
    preview: "rgba(100, 200, 255, 0.75)",
    circleStroke: "#ff6464",
    circleFill: "rgba(255, 100, 100, 0.16)",
    slashStroke: "#ff9632",
    arrowStroke: "#64c8ff",
  });

  // ============================================================
  // STATE
  // ============================================================

  let enabled = false;
  let canvas = null;
  let ctx = null;

  let annotations = [];
  let rawTrail = [];

  let penIsDown = false;
  let penDownFrames = 0;
  let penUpFrames = 0;

  let gestureStartedAt = 0;
  let finalizeTimer = null;

  let smoothedPoint = null;
  let lastRawPoint = null;

  let canvasRetryTimer = null;
  let handWarningTimer = null;

  let lastHandsEventAt = 0;
  let lastValidLandmarksAt = 0;
  let lastRecognition = null;

  let previousGestureNavigationState = null;
  let previousMouseState = null;

  // ============================================================
  // BASIC HELPERS
  // ============================================================

  function log(...args) {
    if (CONFIG.debug) {
      console.log("[VelosMarkup]", ...args);
    }
  }

  function toast(message, duration = 1200) {
    if (!CONFIG.showToast) return;

    if (typeof window.showToast === "function") {
      window.showToast(message, duration);
    } else if (CONFIG.debug) {
      console.log("[VelosMarkup]", message);
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function distance(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function distance3D(a, b) {
    if (!a || !b) return Infinity;

    return Math.hypot(
      a.x - b.x,
      a.y - b.y,
      (a.z || 0) - (b.z || 0)
    );
  }

  function pathLength(points) {
    let total = 0;

    for (let i = 1; i < points.length; i += 1) {
      total += distance(
        points[i - 1],
        points[i]
      );
    }

    return total;
  }

  function currentSlideIndex() {
    try {
      return (
        window.velosApp
          ?.currentSlideIndex?.() ?? 0
      );
    } catch (error) {
      return 0;
    }
  }

  // ============================================================
  // CANVAS
  // ============================================================

  function getCanvas() {
    const appCanvas =
      window.velosApp
        ?.getDrawCanvas?.();

    const domCanvas =
      document.getElementById(
        "drawCanvas"
      );

    canvas =
      appCanvas ||
      domCanvas ||
      canvas;

    if (canvas) {
      try {
        ctx =
          window.velosApp
            ?.getDrawContext?.() ||
          canvas.getContext(
            "2d",
            {
              alpha: true,
            }
          );
      } catch (error) {
        console.error(
          "[VelosMarkup] Could not obtain canvas context:",
          error
        );

        ctx = null;
      }
    }

    return canvas;
  }

  function logicalCanvasSize() {
    const c = getCanvas();

    if (!c) {
      return {
        width: 1,
        height: 1,
      };
    }

    const rect =
      c.getBoundingClientRect();

    return {
      width: Math.max(
        1,
        c.clientWidth ||
          rect.width ||
          c.width ||
          1
      ),

      height: Math.max(
        1,
        c.clientHeight ||
          rect.height ||
          c.height ||
          1
      ),
    };
  }

  function clearCanvasPixels() {
    const c = getCanvas();

    if (!c || !ctx) {
      return;
    }

    ctx.save();

    ctx.setTransform(
      1,
      0,
      0,
      1,
      0,
      0
    );

    ctx.clearRect(
      0,
      0,
      c.width,
      c.height
    );

    ctx.restore();
  }

  function waitForCanvas(
    attempt = 0
  ) {
    if (!enabled) {
      return;
    }

    if (canvasRetryTimer) {
      clearTimeout(
        canvasRetryTimer
      );

      canvasRetryTimer = null;
    }

    if (
      getCanvas() &&
      ctx
    ) {
      dispatchState();

      redrawAll();

      window.dispatchEvent(
        new CustomEvent(
          "velosMarkupCanvasReady",
          {
            detail: {
              canvas,
            },
          }
        )
      );

      toast(
        "AI Markup ready - point with your index finger",
        1200
      );

      log(
        "Canvas ready"
      );

      return;
    }

    if (
      attempt >=
      CONFIG.canvasRetryCount
    ) {
      console.error(
        "[VelosMarkup] drawCanvas was not found."
      );

      window.dispatchEvent(
        new CustomEvent(
          "velosMarkupError",
          {
            detail: {
              reason:
                "draw-canvas-unavailable",
            },
          }
        )
      );

      toast(
        "Markup could not find the drawing canvas",
        2200
      );

      return;
    }

    canvasRetryTimer =
      setTimeout(
        () => {
          waitForCanvas(
            attempt + 1
          );
        },

        CONFIG.canvasRetryMs
      );
  }

  // ============================================================
  // HAND PAYLOAD EXTRACTION
  // ============================================================

  function looksLikeLandmarkList(
    value
  ) {
    return (
      Array.isArray(value) &&
      value.length >= 21 &&
      value[0] &&
      Number.isFinite(
        Number(
          value[0].x
        )
      ) &&
      Number.isFinite(
        Number(
          value[0].y
        )
      )
    );
  }

  function extractLandmarks(
    detail
  ) {
    const candidates = [
      detail?.landmarks,

      detail?.handLandmarks,

      detail
        ?.hands?.[0]
        ?.landmarks,

      detail?.hands?.[0],

      detail
        ?.multiHandLandmarks?.[0],

      detail
        ?.results
        ?.multiHandLandmarks?.[0],

      detail
        ?.results
        ?.landmarks,

      detail
        ?.result
        ?.multiHandLandmarks?.[0],

      detail
        ?.result
        ?.landmarks,

      detail,
    ];

    for (
      const candidate
      of candidates
    ) {
      if (
        looksLikeLandmarkList(
          candidate
        )
      ) {
        return candidate;
      }

      if (
        Array.isArray(
          candidate
        ) &&
        looksLikeLandmarkList(
          candidate[0]
        )
      ) {
        return candidate[0];
      }
    }

    return null;
  }

  function landmarkToCanvasPoint(
    landmarks
  ) {
    const c =
      getCanvas();

    const tip =
      landmarks?.[8];

    if (
      !c ||
      !tip
    ) {
      return null;
    }

    const size =
      logicalCanvasSize();

    const x =
      Number(
        tip.x
      );

    const y =
      Number(
        tip.y
      );

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return null;
    }

    /*
     * MediaPipe normalized
     * coordinates.
     */
    if (
      x >= -0.25 &&
      x <= 1.25 &&
      y >= -0.25 &&
      y <= 1.25
    ) {
      return {
        x: clamp(
          (1 - x) *
            size.width,

          0,
          size.width
        ),

        y: clamp(
          y *
            size.height,

          0,
          size.height
        ),

        t:
          performance.now(),
      };
    }

    /*
     * Fallback if app.js sends
     * viewport pixel coordinates.
     */
    const rect =
      c.getBoundingClientRect();

    if (
      !rect.width ||
      !rect.height
    ) {
      return null;
    }

    return {
      x: clamp(
        (
          (
            x -
            rect.left
          ) /
          rect.width
        ) *
          size.width,

        0,
        size.width
      ),

      y: clamp(
        (
          (
            y -
            rect.top
          ) /
          rect.height
        ) *
          size.height,

        0,
        size.height
      ),

      t:
        performance.now(),
    };
  }

  // ============================================================
  // DRAWING POSE
  // ============================================================

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
        a.x - b.x,

      y:
        a.y - b.y,

      z:
        (a.z || 0) -
        (b.z || 0),
    };

    const cb = {
      x:
        c.x - b.x,

      y:
        c.y - b.y,

      z:
        (c.z || 0) -
        (b.z || 0),
    };

    const magA =
      Math.hypot(
        ab.x,
        ab.y,
        ab.z
      );

    const magB =
      Math.hypot(
        cb.x,
        cb.y,
        cb.z
      );

    if (
      magA < 1e-8 ||
      magB < 1e-8
    ) {
      return 0;
    }

    const cosine =
      clamp(
        (
          ab.x * cb.x +
          ab.y * cb.y +
          ab.z * cb.z
        ) /
          (
            magA *
            magB
          ),

        -1,
        1
      );

    return (
      Math.acos(
        cosine
      ) *
      180
    ) /
      Math.PI;
  }

  function fingerExtended(
    landmarks,
    mcp,
    pip,
    dip,
    tip
  ) {
    const wrist =
      landmarks?.[0];

    if (
      !wrist ||
      !landmarks?.[tip]
    ) {
      return false;
    }

    const pipAngle =
      jointAngleDeg(
        landmarks[mcp],
        landmarks[pip],
        landmarks[dip]
      );

    const dipAngle =
      jointAngleDeg(
        landmarks[pip],
        landmarks[dip],
        landmarks[tip]
      );

    const tipDistance =
      distance3D(
        landmarks[tip],
        wrist
      );

    const pipDistance =
      distance3D(
        landmarks[pip],
        wrist
      );

    return (
      pipAngle > 138 &&
      dipAngle > 132 &&
      tipDistance >
        pipDistance *
          1.01
    );
  }

  function isDrawingPose(
    landmarks
  ) {
    if (
      !CONFIG
        .requireDrawingPose
    ) {
      return true;
    }

    if (
      !looksLikeLandmarkList(
        landmarks
      )
    ) {
      return false;
    }

    const index =
      fingerExtended(
        landmarks,
        5,
        6,
        7,
        8
      );

    const middle =
      fingerExtended(
        landmarks,
        9,
        10,
        11,
        12
      );

    const ring =
      fingerExtended(
        landmarks,
        13,
        14,
        15,
        16
      );

    const pinky =
      fingerExtended(
        landmarks,
        17,
        18,
        19,
        20
      );

    const foldedOthers =
      [
        middle,
        ring,
        pinky,
      ].filter(
        (value) =>
          !value
      ).length;

    return (
      index &&
      foldedOthers >= 2
    );
  }

  // ============================================================
  // SMOOTHING
  // ============================================================

  function resetSmoothing() {
    smoothedPoint = null;
    lastRawPoint = null;
  }

  function smoothPoint(
    point
  ) {
    if (
      !smoothedPoint ||
      !lastRawPoint
    ) {
      smoothedPoint = {
        ...point,
      };

      lastRawPoint = {
        ...point,
      };

      return {
        ...point,
      };
    }

    const d =
      distance(
        point,
        lastRawPoint
      );

    const speed =
      clamp01(
        d /
          CONFIG
            .smoothingFastDistancePx
      );

    const alpha =
      CONFIG
        .smoothingAlphaSlow +
      (
        CONFIG
          .smoothingAlphaFast -
        CONFIG
          .smoothingAlphaSlow
      ) *
        speed;

    smoothedPoint.x +=
      (
        point.x -
        smoothedPoint.x
      ) *
        alpha;

    smoothedPoint.y +=
      (
        point.y -
        smoothedPoint.y
      ) *
        alpha;

    smoothedPoint.t =
      point.t;

    lastRawPoint = {
      ...point,
    };

    return {
      ...smoothedPoint,
    };
  }

  // ============================================================
  // GEOMETRY
  // ============================================================

  function boundingBox(
    points
  ) {
    let minX =
      Infinity;

    let minY =
      Infinity;

    let maxX =
      -Infinity;

    let maxY =
      -Infinity;

    for (
      const p
      of points
    ) {
      minX =
        Math.min(
          minX,
          p.x
        );

      minY =
        Math.min(
          minY,
          p.y
        );

      maxX =
        Math.max(
          maxX,
          p.x
        );

      maxY =
        Math.max(
          maxY,
          p.y
        );
    }

    return {
      minX,
      minY,
      maxX,
      maxY,

      width:
        Math.max(
          0,
          maxX -
            minX
        ),

      height:
        Math.max(
          0,
          maxY -
            minY
        ),
    };
  }

  function pointToLineDistance(
    point,
    start,
    end
  ) {
    const dx =
      end.x -
      start.x;

    const dy =
      end.y -
      start.y;

    const denom =
      dx * dx +
      dy * dy;

    if (
      denom < 1e-9
    ) {
      return distance(
        point,
        start
      );
    }

    const t =
      clamp(
        (
          (
            point.x -
            start.x
          ) *
            dx +
          (
            point.y -
            start.y
          ) *
            dy
        ) /
          denom,

        0,
        1
      );

    const px =
      start.x +
      t * dx;

    const py =
      start.y +
      t * dy;

    return Math.hypot(
      point.x - px,
      point.y - py
    );
  }

  function lineQuality(
    points,
    start,
    end
  ) {
    const direct =
      distance(
        start,
        end
      );

    if (
      direct < 1
    ) {
      return {
        direct,

        pathRatio:
          Infinity,

        deviationRatio:
          Infinity,
      };
    }

    let maxDeviation =
      0;

    for (
      const p
      of points
    ) {
      maxDeviation =
        Math.max(
          maxDeviation,

          pointToLineDistance(
            p,
            start,
            end
          )
        );
    }

    return {
      direct,

      pathRatio:
        pathLength(
          points
        ) /
        direct,

      deviationRatio:
        maxDeviation /
        direct,
    };
  }

  // ============================================================
  // RECOGNITION
  // ============================================================

  function detectCircle(
    points
  ) {
    if (
      points.length <
      CONFIG.minTrailPoints
    ) {
      return null;
    }

    const box =
      boundingBox(
        points
      );

    const width =
      Math.max(
        1,
        box.width
      );

    const height =
      Math.max(
        1,
        box.height
      );

    const aspect =
      Math.max(
        width,
        height
      ) /
      Math.min(
        width,
        height
      );

    if (
      aspect > 1.85
    ) {
      return null;
    }

    const center = {
      x:
        (
          box.minX +
          box.maxX
        ) /
        2,

      y:
        (
          box.minY +
          box.maxY
        ) /
        2,
    };

    const radius =
      (
        width +
        height
      ) /
      4;

    if (
      radius < 16
    ) {
      return null;
    }

    const closure =
      distance(
        points[0],
        points[
          points.length - 1
        ]
      ) /
      radius;

    if (
      closure > 1.05
    ) {
      return null;
    }

    let radialError =
      0;

    for (
      const p
      of points
    ) {
      radialError +=
        Math.abs(
          distance(
            p,
            center
          ) -
            radius
        );
    }

    radialError =
      radialError /
      points.length /
      radius;

    if (
      radialError >
      0.34
    ) {
      return null;
    }

    const traveled =
      pathLength(
        points
      );

    const circumference =
      Math.PI *
      2 *
      radius;

    const travelRatio =
      traveled /
      Math.max(
        1,
        circumference
      );

    if (
      travelRatio < 0.48 ||
      travelRatio > 1.9
    ) {
      return null;
    }

    const confidence =
      clamp01(
        0.35 *
          (
            1 -
            clamp01(
              (
                aspect -
                1
              ) /
                0.85
            )
          ) +

        0.35 *
          (
            1 -
            clamp01(
              radialError /
                0.34
            )
          ) +

        0.30 *
          (
            1 -
            clamp01(
              closure /
                1.05
            )
          )
      );

    if (
      confidence <
      CONFIG.minConfidence
    ) {
      return null;
    }

    return {
      type:
        "circle",

      confidence,

      shape: {
        center,
        radius,
      },
    };
  }

  function detectSlash(
    points
  ) {
    if (
      points.length <
      CONFIG.minTrailPoints
    ) {
      return null;
    }

    const start =
      points[0];

    const end =
      points[
        points.length - 1
      ];

    const quality =
      lineQuality(
        points,
        start,
        end
      );

    if (
      quality.direct <
      45
    ) {
      return null;
    }

    if (
      quality.deviationRatio >
      0.24
    ) {
      return null;
    }

    if (
      quality.pathRatio >
      1.45
    ) {
      return null;
    }

    const deviationScore =
      1 -
      clamp01(
        quality
          .deviationRatio /
          0.24
      );

    const pathScore =
      1 -
      clamp01(
        (
          quality.pathRatio -
          1
        ) /
          0.45
      );

    const lengthScore =
      clamp01(
        (
          quality.direct -
          45
        ) /
          140 +
          0.45
      );

    const confidence =
      clamp01(
        deviationScore *
          0.45 +

        pathScore *
          0.35 +

        lengthScore *
          0.20
      );

    if (
      confidence <
      CONFIG.minConfidence
    ) {
      return null;
    }

    return {
      type:
        "slash",

      confidence,

      shape: {
        startPos: {
          x:
            start.x,

          y:
            start.y,
        },

        endPos: {
          x:
            end.x,

          y:
            end.y,
        },

        length:
          quality.direct,

        angle:
          (
            Math.atan2(
              end.y -
                start.y,

              end.x -
                start.x
            ) *
            180
          ) /
          Math.PI,
      },
    };
  }

  function angleBetweenDeg(
    ax,
    ay,
    bx,
    by
  ) {
    const magA =
      Math.hypot(
        ax,
        ay
      );

    const magB =
      Math.hypot(
        bx,
        by
      );

    if (
      magA < 1e-8 ||
      magB < 1e-8
    ) {
      return 0;
    }

    const cosine =
      clamp(
        (
          ax * bx +
          ay * by
        ) /
          (
            magA *
            magB
          ),

        -1,
        1
      );

    return (
      Math.acos(
        cosine
      ) *
      180
    ) /
      Math.PI;
  }

  function detectArrow(
    points
  ) {
    if (
      points.length <
      CONFIG.minTrailPoints +
        3
    ) {
      return null;
    }

    const start =
      points[0];

    let tipIndex = 1;
    let shaftLength = 0;

    for (
      let i = 1;
      i < points.length;
      i += 1
    ) {
      const d =
        distance(
          start,
          points[i]
        );

      if (
        d >
        shaftLength
      ) {
        shaftLength =
          d;

        tipIndex =
          i;
      }
    }

    if (
      shaftLength <
      65
    ) {
      return null;
    }

    const ratio =
      tipIndex /
      Math.max(
        1,
        points.length -
          1
      );

    if (
      ratio < 0.48 ||
      ratio > 0.95 ||
      tipIndex >=
        points.length -
          1
    ) {
      return null;
    }

    const tip =
      points[
        tipIndex
      ];

    const shaftPoints =
      points.slice(
        0,
        tipIndex + 1
      );

    const shaftQuality =
      lineQuality(
        shaftPoints,
        start,
        tip
      );

    if (
      shaftQuality
        .deviationRatio >
      0.22
    ) {
      return null;
    }

    if (
      shaftQuality
        .pathRatio >
      1.45
    ) {
      return null;
    }

    const headPoints =
      points.slice(
        tipIndex + 1
      );

    if (
      !headPoints.length
    ) {
      return null;
    }

    let wing =
      headPoints[0];

    let headLength =
      distance(
        tip,
        wing
      );

    for (
      const p
      of headPoints
    ) {
      const d =
        distance(
          tip,
          p
        );

      if (
        d >
        headLength
      ) {
        headLength =
          d;

        wing =
          p;
      }
    }

    const headRatio =
      headLength /
      shaftLength;

    if (
      headRatio < 0.06 ||
      headRatio > 0.55
    ) {
      return null;
    }

    const backX =
      start.x -
      tip.x;

    const backY =
      start.y -
      tip.y;

    const wingX =
      wing.x -
      tip.x;

    const wingY =
      wing.y -
      tip.y;

    const headAngle =
      angleBetweenDeg(
        backX,
        backY,
        wingX,
        wingY
      );

    if (
      headAngle < 10 ||
      headAngle > 95
    ) {
      return null;
    }

    const straightScore =
      1 -
      clamp01(
        shaftQuality
          .deviationRatio /
          0.22
      );

    const headRatioScore =
      1 -
      clamp01(
        Math.abs(
          headRatio -
          0.22
        ) /
          0.35
      );

    const angleScore =
      1 -
      clamp01(
        Math.abs(
          headAngle -
          38
        ) /
          65
      );

    const tipScore =
      1 -
      clamp01(
        Math.abs(
          ratio -
          0.76
        ) /
          0.38
      );

    const confidence =
      clamp01(
        straightScore *
          0.35 +

        headRatioScore *
          0.25 +

        angleScore *
          0.25 +

        tipScore *
          0.15
      );

    if (
      confidence <
      CONFIG.minConfidence
    ) {
      return null;
    }

    return {
      type:
        "arrow",

      confidence,

      shape: {
        startPos: {
          x:
            start.x,

          y:
            start.y,
        },

        endPos: {
          x:
            tip.x,

          y:
            tip.y,
        },

        length:
          shaftLength,

        angle:
          (
            Math.atan2(
              tip.y -
                start.y,

              tip.x -
                start.x
            ) *
            180
          ) /
          Math.PI,
      },
    };
  }

  function recognize(
    points
  ) {
    if (
      points.length <
      CONFIG.minTrailPoints
    ) {
      return {
        accepted:
          false,

        reason:
          "too-few-points",

        candidates:
          [],
      };
    }

    if (
      pathLength(
        points
      ) <
      CONFIG.minTravelPx
    ) {
      return {
        accepted:
          false,

        reason:
          "gesture-too-short",

        candidates:
          [],
      };
    }

    const candidates =
      [];

    const circle =
      detectCircle(
        points
      );

    const arrow =
      detectArrow(
        points
      );

    const slash =
      detectSlash(
        points
      );

    if (circle) {
      candidates.push(
        circle
      );
    }

    if (arrow) {
      candidates.push(
        arrow
      );
    }

    if (slash) {
      candidates.push(
        slash
      );
    }

    candidates.sort(
      (a, b) =>
        b.confidence -
        a.confidence
    );

    if (
      !candidates.length
    ) {
      return {
        accepted:
          false,

        reason:
          "no-shape-match",

        candidates,
      };
    }

    let best =
      candidates[0];

    if (
      best.type ===
      "slash"
    ) {
      const closeArrow =
        candidates.find(
          (candidate) =>
            candidate.type ===
              "arrow" &&
            candidate
              .confidence >=
              best.confidence -
                0.10
        );

      if (
        closeArrow
      ) {
        best =
          closeArrow;
      }
    }

    return {
      accepted:
        true,

      result:
        best,

      candidates,
    };
  }

  // ============================================================
  // RENDERING
  // ============================================================

  function scaledShape(
    annotation
  ) {
    const current =
      logicalCanvasSize();

    const original =
      annotation.canvasSize ||
      current;

    const sx =
      current.width /
      Math.max(
        1,
        original.width
      );

    const sy =
      current.height /
      Math.max(
        1,
        original.height
      );

    if (
      annotation.type ===
      "circle"
    ) {
      return {
        center: {
          x:
            annotation
              .shape
              .center
              .x *
            sx,

          y:
            annotation
              .shape
              .center
              .y *
            sy,
        },

        radius:
          annotation
            .shape
            .radius *
          (
            (
              sx +
              sy
            ) /
            2
          ),
      };
    }

    return {
      ...annotation.shape,

      startPos: {
        x:
          annotation
            .shape
            .startPos
            .x *
          sx,

        y:
          annotation
            .shape
            .startPos
            .y *
          sy,
      },

      endPos: {
        x:
          annotation
            .shape
            .endPos
            .x *
          sx,

        y:
          annotation
            .shape
            .endPos
            .y *
          sy,
      },
    };
  }

  function drawCircle(
    shape
  ) {
    if (!ctx) {
      return;
    }

    ctx.save();

    ctx.beginPath();

    ctx.arc(
      shape.center.x,
      shape.center.y,
      shape.radius,
      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      COLORS.circleFill;

    ctx.fill();

    ctx.strokeStyle =
      COLORS.circleStroke;

    ctx.lineWidth =
      3;

    ctx.stroke();

    ctx.restore();
  }

  function drawSlash(
    shape
  ) {
    if (!ctx) {
      return;
    }

    ctx.save();

    ctx.beginPath();

    ctx.moveTo(
      shape.startPos.x,
      shape.startPos.y
    );

    ctx.lineTo(
      shape.endPos.x,
      shape.endPos.y
    );

    ctx.strokeStyle =
      COLORS.slashStroke;

    ctx.lineWidth =
      4;

    ctx.lineCap =
      "round";

    ctx.stroke();

    ctx.restore();
  }

  function drawArrow(
    shape
  ) {
    if (!ctx) {
      return;
    }

    const dx =
      shape.endPos.x -
      shape.startPos.x;

    const dy =
      shape.endPos.y -
      shape.startPos.y;

    const angle =
      Math.atan2(
        dy,
        dx
      );

    const length =
      Math.hypot(
        dx,
        dy
      );

    const head =
      clamp(
        length *
          0.16,

        15,
        30
      );

    ctx.save();

    ctx.strokeStyle =
      COLORS.arrowStroke;

    ctx.lineWidth =
      3.5;

    ctx.lineCap =
      "round";

    ctx.lineJoin =
      "round";

    ctx.beginPath();

    ctx.moveTo(
      shape.startPos.x,
      shape.startPos.y
    );

    ctx.lineTo(
      shape.endPos.x,
      shape.endPos.y
    );

    ctx.moveTo(
      shape.endPos.x,
      shape.endPos.y
    );

    ctx.lineTo(
      shape.endPos.x -
        head *
          Math.cos(
            angle -
            Math.PI / 6
          ),

      shape.endPos.y -
        head *
          Math.sin(
            angle -
            Math.PI / 6
          )
    );

    ctx.moveTo(
      shape.endPos.x,
      shape.endPos.y
    );

    ctx.lineTo(
      shape.endPos.x -
        head *
          Math.cos(
            angle +
            Math.PI / 6
          ),

      shape.endPos.y -
        head *
          Math.sin(
            angle +
            Math.PI / 6
          )
    );

    ctx.stroke();

    ctx.restore();
  }

  function drawAnnotation(
    annotation
  ) {
    if (!ctx) {
      return;
    }

    const shape =
      scaledShape(
        annotation
      );

    if (
      annotation.type ===
      "circle"
    ) {
      drawCircle(
        shape
      );
    }

    if (
      annotation.type ===
      "slash"
    ) {
      drawSlash(
        shape
      );
    }

    if (
      annotation.type ===
      "arrow"
    ) {
      drawArrow(
        shape
      );
    }
  }

  function drawLiveTrail() {
    if (
      !ctx ||
      !CONFIG.showLiveTrail ||
      rawTrail.length < 2
    ) {
      return;
    }

    ctx.save();

    ctx.beginPath();

    ctx.moveTo(
      rawTrail[0].x,
      rawTrail[0].y
    );

    for (
      let i = 1;
      i < rawTrail.length;
      i += 1
    ) {
      ctx.lineTo(
        rawTrail[i].x,
        rawTrail[i].y
      );
    }

    ctx.strokeStyle =
      COLORS.preview;

    ctx.lineWidth =
      2.5;

    ctx.lineCap =
      "round";

    ctx.lineJoin =
      "round";

    ctx.stroke();

    ctx.restore();
  }

  function redrawAll(
    includeLiveTrail =
      false
  ) {
    getCanvas();

    if (!ctx) {
      return;
    }

    clearCanvasPixels();

    const slide =
      currentSlideIndex();

    for (
      const annotation
      of annotations
    ) {
      if (
        annotation
          .slideIndex ===
        slide
      ) {
        drawAnnotation(
          annotation
        );
      }
    }

    if (
      includeLiveTrail
    ) {
      drawLiveTrail();
    }
  }

  // ============================================================
  // ANNOTATIONS
  // ============================================================

  function storeAnnotation(
    result
  ) {
    const annotation = {
      id:
        `annotation-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}`,

      timestamp:
        Date.now(),

      slideIndex:
        currentSlideIndex(),

      type:
        result.type,

      confidence:
        result.confidence,

      shape:
        result.shape,

      canvasSize:
        logicalCanvasSize(),
    };

    annotations.push(
      annotation
    );

    window.dispatchEvent(
      new CustomEvent(
        "velosMarkupCreated",
        {
          detail:
            annotation,
        }
      )
    );

    return annotation;
  }

  // ============================================================
  // GESTURE CAPTURE
  // ============================================================

  function clearFinalizeTimer() {
    if (
      finalizeTimer
    ) {
      clearTimeout(
        finalizeTimer
      );

      finalizeTimer =
        null;
    }
  }

  function resetGesture() {
    clearFinalizeTimer();

    rawTrail =
      [];

    gestureStartedAt =
      0;

    resetSmoothing();
  }

  function armFinalizeTimer() {
    clearFinalizeTimer();

    finalizeTimer =
      setTimeout(
        () => {
          if (
            penIsDown
          ) {
            releasePen(
              "idle"
            );
          } else {
            finalizeGesture(
              "idle"
            );
          }
        },

        CONFIG.idleFinalizeMs
      );
  }

  function beginPen(
    point,
    now
  ) {
    resetGesture();

    penIsDown =
      true;

    penDownFrames =
      0;

    penUpFrames =
      0;

    gestureStartedAt =
      now;

    const p =
      smoothPoint(
        point
      );

    rawTrail.push(
      p
    );

    armFinalizeTimer();

    redrawAll(
      true
    );

    window.dispatchEvent(
      new CustomEvent(
        "velosMarkupPenDown",
        {
          detail: {
            point:
              p,

            slideIndex:
              currentSlideIndex(),
          },
        }
      )
    );
  }

  function addPenPoint(
    point,
    now
  ) {
    const p =
      smoothPoint(
        point
      );

    const last =
      rawTrail[
        rawTrail.length - 1
      ];

    if (
      !last ||
      distance(
        last,
        p
      ) >=
        CONFIG
          .movementThresholdPx
    ) {
      rawTrail.push(
        p
      );

      while (
        rawTrail.length >
        CONFIG.maxTrailPoints
      ) {
        rawTrail.shift();
      }

      armFinalizeTimer();

      redrawAll(
        true
      );
    }

    if (
      gestureStartedAt &&
      now -
        gestureStartedAt >=
        CONFIG.maxGestureMs
    ) {
      releasePen(
        "max-duration"
      );
    }
  }

  function finalizeGesture(
    reason =
      "release"
  ) {
    clearFinalizeTimer();

    if (
      !rawTrail.length
    ) {
      redrawAll(
        false
      );

      resetGesture();

      return null;
    }

    const points =
      rawTrail.slice();

    resetGesture();

    const recognition =
      recognize(
        points
      );

    lastRecognition = {
      ...recognition,

      trigger:
        reason,

      rawPointCount:
        points.length,

      timestamp:
        Date.now(),
    };

    if (
      !recognition.accepted
    ) {
      redrawAll(
        false
      );

      window.dispatchEvent(
        new CustomEvent(
          "velosMarkupRejected",
          {
            detail:
              lastRecognition,
          }
        )
      );

      log(
        "Rejected gesture",
        lastRecognition
      );

      return null;
    }

    const annotation =
      storeAnnotation(
        recognition.result
      );

    redrawAll(
      false
    );

    const label =
      recognition
        .result
        .type ===
      "circle"

        ? "Circle"

        : recognition
              .result
              .type ===
            "arrow"

          ? "Arrow"

          : "Slash";

    toast(
      `${label} ${Math.round(
        recognition
          .result
          .confidence *
          100
      )}%`,

      800
    );

    return annotation;
  }

  function releasePen(
    reason =
      "pose-release"
  ) {
    if (
      !penIsDown
    ) {
      finalizeGesture(
        reason
      );

      return;
    }

    penIsDown =
      false;

    penDownFrames =
      0;

    penUpFrames =
      0;

    window.dispatchEvent(
      new CustomEvent(
        "velosMarkupPenUp",
        {
          detail: {
            slideIndex:
              currentSlideIndex(),

            reason,
          },
        }
      )
    );

    finalizeGesture(
      reason
    );
  }

  // ============================================================
  // HAND EVENT PROCESSING
  // ============================================================

  function processLandmarks(
    landmarks,
    timestamp =
      performance.now()
  ) {
    if (!enabled) {
      return false;
    }

    if (
      !looksLikeLandmarkList(
        landmarks
      )
    ) {
      penDownFrames =
        0;

      penUpFrames +=
        1;

      if (
        penIsDown &&
        penUpFrames >=
          CONFIG
            .penUpStableFrames
      ) {
        releasePen(
          "hand-lost"
        );
      }

      return false;
    }

    lastValidLandmarksAt =
      Date.now();

    if (
      handWarningTimer
    ) {
      clearTimeout(
        handWarningTimer
      );

      handWarningTimer =
        null;
    }

    const drawingPose =
      isDrawingPose(
        landmarks
      );

    if (
      drawingPose
    ) {
      penDownFrames +=
        1;

      penUpFrames =
        0;
    } else {
      penDownFrames =
        0;

      penUpFrames +=
        1;
    }

    if (
      !penIsDown
    ) {
      if (
        drawingPose &&
        penDownFrames >=
          CONFIG
            .penDownStableFrames
      ) {
        const point =
          landmarkToCanvasPoint(
            landmarks
          );

        if (
          point
        ) {
          beginPen(
            point,
            timestamp
          );
        }
      }

      return true;
    }

    if (
      !drawingPose
    ) {
      if (
        penUpFrames >=
        CONFIG
          .penUpStableFrames
      ) {
        releasePen(
          "pose-release"
        );
      }

      return true;
    }

    const point =
      landmarkToCanvasPoint(
        landmarks
      );

    if (
      !point
    ) {
      releasePen(
        "invalid-point"
      );

      return false;
    }

    addPenPoint(
      point,
      timestamp
    );

    return true;
  }

  function handleHandsDetected(
    event
  ) {
    if (
      !enabled
    ) {
      return;
    }

    lastHandsEventAt =
      Date.now();

    const landmarks =
      extractLandmarks(
        event?.detail
      );

    const timestamp =
      event
        ?.detail
        ?.timestamp ??
      performance.now();

    processLandmarks(
      landmarks,
      timestamp
    );
  }

  function installHandListeners() {
    const eventNames = [
      "velosHandsDetected",
      "handsDetected",
      "handLandmarks",
      "mediapipeHandsDetected",
    ];

    for (
      const name
      of eventNames
    ) {
      window.removeEventListener(
        name,
        handleHandsDetected
      );

      window.addEventListener(
        name,
        handleHandsDetected
      );
    }
  }

  function removeHandListeners() {
    const eventNames = [
      "velosHandsDetected",
      "handsDetected",
      "handLandmarks",
      "mediapipeHandsDetected",
    ];

    for (
      const name
      of eventNames
    ) {
      window.removeEventListener(
        name,
        handleHandsDetected
      );
    }
  }

  function armHandWarning() {
    if (
      handWarningTimer
    ) {
      clearTimeout(
        handWarningTimer
      );
    }

    handWarningTimer =
      setTimeout(
        () => {
          if (
            !enabled ||
            lastValidLandmarksAt
          ) {
            return;
          }

          const reason =
            lastHandsEventAt

              ? "unsupported-hand-data"

              : "no-hand-events";

          console.warn(
            "[VelosMarkup] Markup is enabled but no valid hand landmarks were received.",
            reason
          );

          window.dispatchEvent(
            new CustomEvent(
              "velosMarkupWarning",
              {
                detail: {
                  reason,
                },
              }
            )
          );

          toast(
            lastHandsEventAt

              ? "Markup received hand events, but landmark data is invalid"

              : "Markup is ready, but hand tracking is not sending data",

            2600
          );
        },

        CONFIG.handWarningMs
      );
  }

  // ============================================================
  // STATE EVENT
  // ============================================================

  function dispatchState() {
    window.dispatchEvent(
      new CustomEvent(
        "velosMarkupStateChanged",
        {
          detail: {
            enabled,

            penIsDown,

            canvasReady:
              !!getCanvas() &&
              !!ctx,
          },
        }
      )
    );
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  const MarkupAPI = {
    enableMarkup() {
      if (
        enabled
      ) {
        return true;
      }

      enabled =
        true;

      penIsDown =
        false;

      penDownFrames =
        0;

      penUpFrames =
        0;

      lastHandsEventAt =
        0;

      lastValidLandmarksAt =
        0;

      lastRecognition =
        null;

      resetGesture();

      try {
        previousGestureNavigationState =
          window.velosApp
            ?.isGestureNavigationEnabled?.() ??
          null;
      } catch (
        error
      ) {
        previousGestureNavigationState =
          null;
      }

      try {
        previousMouseState =
          window.velosApp
            ?.isMouseEnabled?.() ??
          null;
      } catch (
        error
      ) {
        previousMouseState =
          null;
      }

      try {
        window.velosApp
          ?.setGestureNavigationEnabled?.(
            false
          );
      } catch (
        error
      ) {
        log(
          "Could not disable gesture navigation",
          error
        );
      }

      if (
        previousMouseState ===
        true
      ) {
        try {
          window.velosApp
            ?.setMouseEnabled?.(
              false
            );
        } catch (
          error
        ) {
          log(
            "Could not disable mouse mode",
            error
          );
        }
      }

      installHandListeners();

      dispatchState();

      armHandWarning();

      if (
        getCanvas() &&
        ctx
      ) {
        redrawAll();

        toast(
          "AI Markup ready - point with your index finger",
          1200
        );
      } else {
        toast(
          "AI Markup starting...",
          1000
        );

        waitForCanvas();
      }

      window.dispatchEvent(
        new CustomEvent(
          "velosMarkupEnabled",
          {
            detail: {
              enabled:
                true,
            },
          }
        )
      );

      log(
        "Enabled"
      );

      return true;
    },

    disableMarkup() {
      if (
        !enabled
      ) {
        return true;
      }

      if (
        penIsDown
      ) {
        releasePen(
          "mode-disabled"
        );
      }

      enabled =
        false;

      removeHandListeners();

      resetGesture();

      if (
        canvasRetryTimer
      ) {
        clearTimeout(
          canvasRetryTimer
        );

        canvasRetryTimer =
          null;
      }

      if (
        handWarningTimer
      ) {
        clearTimeout(
          handWarningTimer
        );

        handWarningTimer =
          null;
      }

      if (
        previousGestureNavigationState !==
        null
      ) {
        try {
          window.velosApp
            ?.setGestureNavigationEnabled?.(
              previousGestureNavigationState
            );
        } catch (
          error
        ) {
          log(
            "Could not restore gesture navigation",
            error
          );
        }
      }

      if (
        previousMouseState ===
        true
      ) {
        try {
          window.velosApp
            ?.setMouseEnabled?.(
              true
            );
        } catch (
          error
        ) {
          log(
            "Could not restore mouse mode",
            error
          );
        }
      }

      previousGestureNavigationState =
        null;

      previousMouseState =
        null;

      dispatchState();

      window.dispatchEvent(
        new CustomEvent(
          "velosMarkupDisabled",
          {
            detail: {
              enabled:
                false,
            },
          }
        )
      );

      return true;
    },

    toggleMarkup() {
      return enabled

        ? this.disableMarkup()

        : this.enableMarkup();
    },

    isEnabled() {
      return enabled;
    },

    isPenDown() {
      return penIsDown;
    },

    feedLandmarks(
      landmarks,
      timestamp =
        performance.now()
    ) {
      lastHandsEventAt =
        Date.now();

      return processLandmarks(
        landmarks,
        timestamp
      );
    },

    clearAnnotations(
      slideIndex =
        currentSlideIndex()
    ) {
      annotations =
        annotations.filter(
          (annotation) =>
            annotation
              .slideIndex !==
            slideIndex
        );

      redrawAll();

      window.dispatchEvent(
        new CustomEvent(
          "velosMarkupCleared",
          {
            detail: {
              slideIndex,
            },
          }
        )
      );

      return true;
    },

    clearAllAnnotations() {
      annotations =
        [];

      redrawAll();

      window.dispatchEvent(
        new CustomEvent(
          "velosMarkupClearedAll"
        )
      );

      return true;
    },

    getAnnotations(
      slideIndex =
        null
    ) {
      const selected =
        slideIndex ===
        null

          ? annotations

          : annotations.filter(
              (annotation) =>
                annotation
                  .slideIndex ===
                slideIndex
            );

      return selected.map(
        (annotation) => ({
          ...annotation,
        })
      );
    },

    redrawAll() {
      redrawAll();

      return true;
    },

    getLastRecognition() {
      return lastRecognition

        ? {
            ...lastRecognition,
          }

        : null;
    },

    getStatus() {
      return {
        loaded:
          true,

        enabled,

        penIsDown,

        canvasReady:
          !!getCanvas() &&
          !!ctx,

        canvasId:
          canvas?.id ||
          null,

        lastHandsEventAt,

        lastValidLandmarksAt,

        annotationCount:
          annotations.length,

        currentSlideIndex:
          currentSlideIndex(),

        lastRecognition,
      };
    },

    getConfig() {
      return CONFIG;
    },
  };

  // ============================================================
  // EXPOSE API IMMEDIATELY
  // ============================================================

  window.velosMarkup =
    MarkupAPI;

  window.velosMarkupReady =
    true;

  /*
   * Optional aliases for
   * older UI code.
   */
  window.enableMarkup =
    () =>
      MarkupAPI
        .enableMarkup();

  window.disableMarkup =
    () =>
      MarkupAPI
        .disableMarkup();

  window.toggleMarkup =
    () =>
      MarkupAPI
        .toggleMarkup();

  // ============================================================
  // APP EVENTS
  // ============================================================

  window.addEventListener(
    "velosSlideChanged",
    () => {
      if (
        penIsDown
      ) {
        releasePen(
          "slide-change"
        );
      } else {
        resetGesture();
      }

      setTimeout(
        () => {
          redrawAll();
        },
        0
      );
    }
  );

  window.addEventListener(
    "velosCanvasResized",
    () => {
      setTimeout(
        () => {
          getCanvas();

          redrawAll();
        },
        0
      );
    }
  );

  window.addEventListener(
    "resize",
    () => {
      if (
        !enabled
      ) {
        return;
      }

      setTimeout(
        () => {
          getCanvas();

          redrawAll();
        },
        50
      );
    }
  );

  window.addEventListener(
    "velosReady",
    () => {
      getCanvas();

      if (
        enabled
      ) {
        waitForCanvas();
      }
    },

    {
      once:
        true,
    }
  );

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        getCanvas();
      },

      {
        once:
          true,
      }
    );
  } else {
    getCanvas();
  }

  /*
   * Tell app.js that
   * gesture-markup.js itself
   * has finished loading.
   */
  setTimeout(
    () => {
      window.dispatchEvent(
        new CustomEvent(
          "velosMarkupReady",
          {
            detail: {
              ready:
                true,

              api:
                MarkupAPI,
            },
          }
        )
      );
    },
    0
  );

  console.log(
    "[VelosMarkup] Complete replacement engine loaded"
  );
})();