// ===================== Navegación =====================
function goTo(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  document.querySelector(`.tab[data-view="${view}"]`).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  // Los canvas de gráficas miden 0x0 mientras su vista está en display:none;
  // avisamos a los módulos para que los redibujen ahora que ya son visibles.
  window.dispatchEvent(new CustomEvent("view-shown", { detail: view }));
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => goTo(t.dataset.view)));
document.querySelectorAll(".link-card[data-goto]").forEach((c) =>
  c.addEventListener("click", () => goTo(c.dataset.goto))
);

// ===================== Utilidades =====================
function bindRangeOutput(rangeId, outId, fmt) {
  const r = document.getElementById(rangeId);
  const o = document.getElementById(outId);
  const update = () => (o.textContent = fmt(parseFloat(r.value)));
  r.addEventListener("input", update);
  update();
  return r;
}

function leastSquaresThroughOrigin(points) {
  // fits y = k*x minimizing squared error, forced through origin
  let sumXY = 0, sumXX = 0;
  points.forEach((p) => { sumXY += p.x * p.y; sumXX += p.x * p.x; });
  if (sumXX === 0) return null;
  return sumXY / sumXX;
}

// CORRECCIÓN 2: Canvas con soporte HiDPI/Retina
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return { ctx, width: rect.width, height: rect.height };
}

function drawScatterChart(canvas, points, opts) {
  const { ctx, width: W, height: H } = setupCanvas(canvas);
  const pad = 44;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "#26334a";
  ctx.fillStyle = "#9fb0c3";
  ctx.font = "11px Segoe UI";

  if (points.length === 0) {
    ctx.fillText("Sin datos todavía — agrega mediciones arriba.", pad, H / 2);
    return;
  }
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  let maxX = Math.max(...xs, opts.minMaxX || 0) * 1.15 || 1;
  let maxY = Math.max(...ys, opts.minMaxY || 0) * 1.25 || 1;
  const minX = 0, minY = 0;

  const sx = (x) => pad + ((x - minX) / (maxX - minX)) * (W - pad * 1.5);
  const sy = (y) => H - pad - ((y - minY) / (maxY - minY)) * (H - pad * 1.5);

  // axes
  ctx.beginPath();
  ctx.moveTo(pad, H - pad); ctx.lineTo(W - 10, H - pad);
  ctx.moveTo(pad, H - pad); ctx.lineTo(pad, 10);
  ctx.stroke();
  ctx.fillText(opts.xLabel || "", W / 2 - 20, H - 8);
  ctx.save();
  ctx.translate(12, H / 2 + 20);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(opts.yLabel || "", 0, 0);
  ctx.restore();

  // fit line
  if (opts.slope != null) {
    ctx.strokeStyle = "#ffd13c";
    ctx.beginPath();
    ctx.moveTo(sx(0), sy(0));
    ctx.lineTo(sx(maxX), sy(opts.slope * maxX));
    ctx.stroke();
  }

  // points
  ctx.fillStyle = "#3ddc97";
  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

// CORRECCIÓN 6: Carga segura de localStorage (datos corruptos no deben tumbar el resto de app.js)
function safeLoad(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn(`Datos corruptos en "${key}", se reinician.`, e);
    return [];
  }
}

// CORRECCIÓN 5: Manejo seguro de localStorage
function safeSave(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    if (e.name === "QuotaExceededError" || e.code === 22) {
      alert("⚠️ Espacio de almacenamiento lleno.\nBorra mediciones antiguas para continuar guardando.");
    } else {
      alert("⚠️ Error al guardar: " + e.message);
    }
    return false;
  }
}

// ===================== MÓDULO: GENERADOR GIRATORIO =====================
(function () {
  const rpm = bindRangeOutput("gen-rpm", "gen-rpm-out", (v) => `${v} RPM`);
  const nmag = bindRangeOutput("gen-nmag", "gen-nmag-out", (v) => `${v}`);
  const k = bindRangeOutput("gen-k", "gen-k-out", (v) => v.toFixed(4));
  const N = bindRangeOutput("gen-N", "gen-N-out", (v) => `${v}`);
  const B = bindRangeOutput("gen-B", "gen-B-out", (v) => `${v} mT`);
  const A = bindRangeOutput("gen-A", "gen-A-out", (v) => `${v} cm²`);

  const freqEl = document.getElementById("gen-freq");
  const omegaEl = document.getElementById("gen-omega");
  const voltEl = document.getElementById("gen-volt");
  const ledStatusEl = document.getElementById("gen-led-status");
  const idealVoltEl = document.getElementById("gen-ideal-volt");
  const rotor = document.getElementById("gen-rotor");
  const led = document.getElementById("gen-led");

  // ---- Velocímetro (gauge) de RPM ----
  const RPM_MAX = 3000;
  const VOLT_THRESHOLD = 1.4;
  const GX = 120, GY = 130, GR = 95, NEEDLE_LEN = 82;
  const gaugeTrack = document.getElementById("gauge-track");
  const gaugeValue = document.getElementById("gauge-value");
  const gaugeThreshold = document.getElementById("gauge-threshold");
  const gaugeNeedle = document.getElementById("gauge-needle");
  const gaugeRpmLabel = document.getElementById("gauge-rpm-label");

  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function describeArc(cx, cy, r, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }
  gaugeTrack.setAttribute("d", describeArc(GX, GY, GR, 180, 360));

  function renderGauge(rpmVal, kVal, encendido) {
    const frac = Math.max(0, Math.min(1, rpmVal / RPM_MAX));
    const theta = 180 + frac * 180;
    gaugeValue.setAttribute("d", frac > 0.002 ? describeArc(GX, GY, GR, 180, theta) : "");
    gaugeValue.setAttribute("stroke", encendido ? "#3ddc97" : "#ffd13c");

    const needleTip = polarToCartesian(GX, GY, NEEDLE_LEN, theta);
    gaugeNeedle.setAttribute("x2", needleTip.x);
    gaugeNeedle.setAttribute("y2", needleTip.y);

    const rpmThreshold = kVal > 0 ? VOLT_THRESHOLD / kVal : RPM_MAX;
    const thresholdFrac = Math.max(0, Math.min(1, rpmThreshold / RPM_MAX));
    const thetaT = 180 + thresholdFrac * 180;
    const p1 = polarToCartesian(GX, GY, GR - 14, thetaT);
    const p2 = polarToCartesian(GX, GY, GR + 10, thetaT);
    gaugeThreshold.setAttribute("x1", p1.x); gaugeThreshold.setAttribute("y1", p1.y);
    gaugeThreshold.setAttribute("x2", p2.x); gaugeThreshold.setAttribute("y2", p2.y);

    gaugeRpmLabel.textContent = Math.round(rpmVal) + " RPM";
  }

  let rotorAngle = 0;
  let lastTime = performance.now();

  // Cálculo puro (sin tocar el DOM) — se usa en cada frame de animación.
  function computeValues() {
    const rpmVal = parseFloat(rpm.value);
    const nmagVal = parseFloat(nmag.value);
    const kVal = parseFloat(k.value);
    const omega = (2 * Math.PI * rpmVal) / 60;
    const freq = (rpmVal / 60) * nmagVal;
    const volt = kVal * rpmVal;
    const encendido = volt > VOLT_THRESHOLD;
    return { rpmVal, kVal, omega, freq, volt, encendido };
  }

  // Escribe en el DOM — solo hace falta cuando el usuario mueve un control,
  // no en cada uno de los ~60 frames/seg de la animación del trompo/LED.
  function renderDOM() {
    const { rpmVal, kVal, omega, freq, volt, encendido } = computeValues();

    freqEl.textContent = freq.toFixed(2) + " Hz";
    omegaEl.textContent = omega.toFixed(1) + " rad/s";
    voltEl.textContent = volt.toFixed(2) + " V";
    ledStatusEl.textContent = encendido ? "encendido ⚡" : "apagado";
    ledStatusEl.style.color = encendido ? "#3ddc97" : "#e05353";

    renderGauge(rpmVal, kVal, encendido);

    // idealized model
    const Nv = parseFloat(N.value), Bv = parseFloat(B.value) / 1000, Av = parseFloat(A.value) / 10000;
    const idealVolt = Nv * Bv * Av * omega;
    idealVoltEl.textContent = idealVolt.toFixed(2) + " V";
  }

  function animate(t) {
    const dt = (t - lastTime) / 1000;
    lastTime = t;
    const { freq, rpmVal, encendido } = computeValues();
    const degPerSec = (rpmVal / 60) * 360;
    rotorAngle = (rotorAngle + degPerSec * dt) % 360;
    rotor.setAttribute("transform", `rotate(${rotorAngle} 160 180)`);

    if (encendido && freq > 0) {
      const flash = Math.sin(2 * Math.PI * freq * (t / 1000)) > 0;
      led.setAttribute("fill", flash ? "#ff5050" : "#3a0a0a");
      led.setAttribute("opacity", flash ? "1" : "0.4");
      led.setAttribute("filter", flash ? "url(#led-glow)" : "");
    } else {
      led.setAttribute("fill", "#3a0a0a");
      led.setAttribute("opacity", "0.5");
      led.setAttribute("filter", "");
    }
    requestAnimationFrame(animate);
  }

  [rpm, nmag, k, N, B, A].forEach((el) => el.addEventListener("input", renderDOM));
  renderDOM();
  requestAnimationFrame(animate);

  // ---- Arrastra el trompo con el dedo para girarlo ----
  const genSvg = document.getElementById("gen-diagram");
  let dragging = false;
  let lastAngleDeg = 0;
  let lastDragT = 0;

  function svgPoint(evt) {
    const pt = genSvg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(genSvg.getScreenCTM().inverse());
  }
  function angleFromCenter(p) {
    return (Math.atan2(p.y - 180, p.x - 160) * 180) / Math.PI;
  }
  rotor.addEventListener("pointerdown", (e) => {
    dragging = true;
    rotor.setPointerCapture(e.pointerId);
    genSvg.classList.add("show-hint");
    const p = svgPoint(e);
    lastAngleDeg = angleFromCenter(p);
    lastDragT = performance.now();
  });
  rotor.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const p = svgPoint(e);
    const angle = angleFromCenter(p);
    let delta = angle - lastAngleDeg;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const now = performance.now();
    const dt = Math.max((now - lastDragT) / 1000, 0.001);
    const degPerSec = Math.abs(delta) / dt;
    const rpmFromDrag = (degPerSec / 360) * 60;
    rpm.value = Math.round(Math.min(RPM_MAX, Math.max(0, rpmFromDrag)) / 10) * 10;
    rpm.dispatchEvent(new Event("input"));
    lastAngleDeg = angle;
    lastDragT = now;
  });
  function endDrag() {
    dragging = false;
  }
  rotor.addEventListener("pointerup", endDrag);
  rotor.addEventListener("pointercancel", endDrag);
  rotor.addEventListener("pointerleave", endDrag);

  // ---- Mediciones ----
  const STORAGE_KEY = "gen_mediciones_v1";
  let data = safeLoad(STORAGE_KEY);
  const tbody = document.querySelector("#gm-table tbody");
  const chartCanvas = document.getElementById("gm-chart");
  const statsEl = document.getElementById("gm-stats");

  function renderTable() {
    tbody.innerHTML = "";
    data.forEach((d, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${i + 1}</td><td>${d.tiempo}</td><td>${d.destellos}</td>
        <td>${d.f.toFixed(2)}</td><td>${d.rpmEst.toFixed(0)}</td><td>${d.voltaje != null ? d.voltaje.toFixed(2) : "—"}</td>
        <td><button class="btn small danger" data-i="${i}">Borrar</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        data.splice(parseInt(b.dataset.i), 1);
        save();
      })
    );
  }

  function renderChart() {
    const withVolt = data.filter((d) => d.voltaje != null);
    const points = withVolt.map((d) => ({ x: d.rpmEst, y: d.voltaje }));
    let slope = null;
    if (points.length >= 2) slope = leastSquaresThroughOrigin(points);
    drawScatterChart(chartCanvas, points, { xLabel: "RPM estimado", yLabel: "Voltaje (V)", slope, minMaxX: 1000, minMaxY: 2 });
    if (slope) {
      statsEl.innerHTML = `Con tus ${points.length} mediciones, tu constante experimental es
        <strong>k ≈ ${slope.toFixed(5)} V/RPM</strong>.<br>Puedes copiar este valor al control "Constante de
        calibración" de la Calculadora 1 para que el modelo use TU generador real.`;
    } else {
      statsEl.textContent = "Agrega al menos 2 mediciones con voltaje para calcular tu propia constante k.";
    }
  }

  function save() {
    safeSave(STORAGE_KEY, data);
    renderTable();
    renderChart();
  }

  document.getElementById("gm-add").addEventListener("click", () => {
    // CORRECCIÓN 3: Validación de inputs
    const tiempo = parseFloat(document.getElementById("gm-tiempo").value);
    const destellos = parseFloat(document.getElementById("gm-destellos").value);
    const voltajeRaw = document.getElementById("gm-voltaje").value;

    if (isNaN(tiempo) || isNaN(destellos)) {
      alert("⚠️ Ingresa valores numéricos válidos para tiempo y destellos.");
      return;
    }
    if (tiempo <= 0) {
      alert("⚠️ El tiempo debe ser mayor que cero.");
      return;
    }
    if (destellos < 0) {
      alert("⚠️ Los destellos no pueden ser negativos.");
      return;
    }
    if (destellos === 0) {
      alert("⚠️ Debes contar al menos 1 destello.");
      return;
    }

    const f = destellos / tiempo;
    const nmagVal = parseFloat(nmag.value);
    const rpmEst = (f / nmagVal) * 60;

    let voltaje = null;
    if (voltajeRaw !== "") {
      voltaje = parseFloat(voltajeRaw);
      if (isNaN(voltaje)) {
        alert("⚠️ El voltaje debe ser un número válido.");
        return;
      }
      if (voltaje < 0) {
        alert("⚠️ El voltaje no puede ser negativo.");
        return;
      }
    }

    data.push({ tiempo, destellos, f, rpmEst, voltaje });
    document.getElementById("gm-tiempo").value = "";
    document.getElementById("gm-destellos").value = "";
    document.getElementById("gm-voltaje").value = "";
    save();
  });

  renderTable();
  renderChart();
  window.addEventListener("view-shown", (e) => {
    if (e.detail === "generador") renderChart();
  });
})();

// ===================== MÓDULO: CALCULADORA DE LATA =====================
(function () {
  const gramos = bindRangeOutput("cal-gramos", "cal-gramos-out", (v) => `${v} g`);
  const agua = bindRangeOutput("cal-agua", "cal-agua-out", (v) => `${v} mL`);
  const vcell = bindRangeOutput("cal-vcell", "cal-vcell-out", (v) => `${v.toFixed(2)} V`);
  const ncell = bindRangeOutput("cal-ncell", "cal-ncell-out", (v) => `${v}`);
  const iload = bindRangeOutput("cal-iload", "cal-iload-out", (v) => `${v} µA`);

  const molEl = document.getElementById("cal-molaridad");
  const rintEl = document.getElementById("cal-rint");
  const vtotalEl = document.getElementById("cal-vtotal");
  const statusEl = document.getElementById("cal-status");
  const display = document.getElementById("cal-display");
  const water1 = document.getElementById("cell1-water");
  const water2 = document.getElementById("cell2-water");
  const wire = document.getElementById("cal-wire");
  const barFill = document.getElementById("cal-bar-fill");
  const barPct = document.getElementById("cal-bar-pct");
  const barThreshold = document.getElementById("cal-bar-threshold");

  const MOLAR_MASS_NACL = 58.44;
  const V_THRESHOLD = 1.0;
  const MOL_THRESHOLD = 0.15;
  const BAR_HEADROOM = 1.3; // el 100% de la barra equivale a 1.3x el umbral, para dar margen visual
  const bubbleState = { mol: 0 };
  // La marca del umbral se posiciona a partir de BAR_HEADROOM en vez de un
  // porcentaje fijo en CSS, para que ambos nunca queden desincronizados.
  barThreshold.style.left = 100 / BAR_HEADROOM + "%";

  function compute() {
    const g = parseFloat(gramos.value);
    const mL = parseFloat(agua.value);
    const molaridad = mL > 0 ? g / MOLAR_MASS_NACL / (mL / 1000) : 0;
    molEl.textContent = molaridad.toFixed(2) + " mol/L";

    // Illustrative internal resistance model: decreases as molarity increases.
    const R0 = 20000; // ohms at ~0 molarity (very high resistance, poor conduction)
    const kR = 3.2; // shape constant
    const rInt = R0 / (1 + kR * molaridad);
    rintEl.textContent = rInt >= 1000 ? (rInt / 1000).toFixed(1) + " kΩ" : rInt.toFixed(0) + " Ω";

    const vc = parseFloat(vcell.value);
    const nc = parseFloat(ncell.value);
    const iA = parseFloat(iload.value) / 1e6; // µA -> A
    const vIdeal = vc * nc;
    const vTerminal = Math.max(0, vIdeal - iA * rInt);
    vtotalEl.textContent = vTerminal.toFixed(2) + " V";

    const encendida = vTerminal > V_THRESHOLD && molaridad > MOL_THRESHOLD;
    statusEl.textContent = encendida ? "encendida ✅" : "apagada";
    statusEl.style.color = encendida ? "#3ddc97" : "#e05353";
    display.textContent = encendida ? "1.234" : "";

    const op = Math.min(0.85, 0.25 + molaridad * 0.15);
    water1.setAttribute("opacity", op);
    water2.setAttribute("opacity", op);

    // ---- Barra medible: progreso de apagada → encendida ----
    const progress = Math.max(0, Math.min(vTerminal / V_THRESHOLD, molaridad / MOL_THRESHOLD));
    const pctWidth = Math.min(1, progress / BAR_HEADROOM) * 100;
    barFill.style.width = pctWidth + "%";
    barFill.classList.toggle("is-on", encendida);
    // El texto sigue el mismo tope que el ancho de la barra, para que nunca
    // muestren números distintos (p.ej. barra llena al 100% pero "480%").
    barPct.textContent = (progress >= BAR_HEADROOM ? "100%+" : Math.round(pctWidth) + "%");
    barPct.style.color = encendida ? "#3ddc97" : "var(--muted)";

    // corriente animada por el cable cuando la pila está encendida
    wire.style.animationPlayState = encendida ? "running" : "paused";
    wire.setAttribute("stroke", encendida ? "#3ddc97" : "#333");

    bubbleState.mol = molaridad;

    return { molaridad, vTerminal };
  }

  [gramos, agua, vcell, ncell, iload].forEach((el) => el.addEventListener("input", compute));
  compute();

  // ---- Burbujas animadas: más actividad con más sal ----
  function spawnBubble(containerId, waterRect) {
    const container = document.getElementById(containerId);
    const b = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const wx = parseFloat(waterRect.getAttribute("x"));
    const ww = parseFloat(waterRect.getAttribute("width"));
    const wy = parseFloat(waterRect.getAttribute("y"));
    const wh = parseFloat(waterRect.getAttribute("height"));
    const x = wx + 8 + Math.random() * (ww - 16);
    const yStart = wy + wh - 4;
    const top = wy + 4;
    b.setAttribute("cx", x);
    b.setAttribute("cy", yStart);
    b.setAttribute("r", 1.3 + Math.random() * 1.4);
    b.setAttribute("class", "bubble");
    container.appendChild(b);
    const duration = 800 + Math.random() * 500;
    const start = performance.now();
    function step(t) {
      const p = Math.min(1, (t - start) / duration);
      b.setAttribute("cy", yStart + (top - yStart) * p);
      b.setAttribute("opacity", (1 - p) * 0.8);
      if (p < 1) requestAnimationFrame(step);
      else b.remove();
    }
    requestAnimationFrame(step);
  }
  setInterval(() => {
    if (bubbleState.mol <= 0.02) return;
    const chance = Math.min(0.9, bubbleState.mol * 0.4);
    if (Math.random() < chance) spawnBubble("cell1-bubbles", water1);
    if (Math.random() < chance) spawnBubble("cell2-bubbles", water2);
  }, 350);

  // ---- Toca una lata para agitar el agua (burbujeo instantáneo) ----
  function shakeCell(waterRect, bubblesId) {
    waterRect.classList.remove("shake");
    void waterRect.getBBox(); // reinicia la animación
    waterRect.classList.add("shake");
    const burst = bubbleState.mol > 0 ? 6 : 3;
    for (let i = 0; i < burst; i++) {
      setTimeout(() => spawnBubble(bubblesId, waterRect), i * 60);
    }
  }
  document.getElementById("cell-1").addEventListener("pointerdown", () => shakeCell(water1, "cell1-bubbles"));
  document.getElementById("cell-2").addEventListener("pointerdown", () => shakeCell(water2, "cell2-bubbles"));

  // ---- Mediciones ----
  const STORAGE_KEY = "cal_mediciones_v1";
  let data = safeLoad(STORAGE_KEY);
  const tbody = document.querySelector("#cm-table tbody");
  const chartCanvas = document.getElementById("cm-chart");
  const statsEl = document.getElementById("cm-stats");

  function renderTable() {
    tbody.innerHTML = "";
    data.forEach((d, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${i + 1}</td><td>${d.sal}</td><td>${d.agua}</td>
        <td>${d.molaridad.toFixed(2)}</td><td>${d.voltaje != null ? d.voltaje.toFixed(2) : "—"}</td>
        <td>${d.enciende === "si" ? "Sí" : "No"}</td>
        <td><button class="btn small danger" data-i="${i}">Borrar</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        data.splice(parseInt(b.dataset.i), 1);
        save();
      })
    );
  }

  function renderChart() {
    const withVolt = data.filter((d) => d.voltaje != null);
    const points = withVolt.map((d) => ({ x: d.molaridad, y: d.voltaje }));
    drawScatterChart(chartCanvas, points, { xLabel: "Molaridad (mol/L)", yLabel: "Voltaje medido (V)", minMaxX: 2, minMaxY: 2 });
    if (points.length >= 2) {
      statsEl.innerHTML = `Tienes ${points.length} mediciones. Observa si el voltaje sube y luego se estabiliza al
        aumentar la sal — eso confirma que el efecto principal es sobre la <strong>resistencia interna</strong>, no
        sobre la energía química disponible.`;
    } else {
      statsEl.textContent = "Agrega mediciones con voltaje para ver la tendencia molaridad → voltaje.";
    }
  }

  function save() {
    safeSave(STORAGE_KEY, data);
    renderTable();
    renderChart();
  }

  document.getElementById("cm-add").addEventListener("click", () => {
    // CORRECCIÓN 3: Validación de inputs
    const sal = parseFloat(document.getElementById("cm-sal").value);
    const aguaVal = parseFloat(document.getElementById("cm-agua").value);
    const voltRaw = document.getElementById("cm-volt").value;
    const enciende = document.getElementById("cm-enciende").value;

    if (isNaN(sal) || isNaN(aguaVal)) {
      alert("⚠️ Ingresa valores numéricos válidos para sal y agua.");
      return;
    }
    if (sal < 0) {
      alert("⚠️ Los gramos de sal no pueden ser negativos.");
      return;
    }
    if (aguaVal <= 0) {
      alert("⚠️ El volumen de agua debe ser mayor que cero.");
      return;
    }

    let voltaje = null;
    if (voltRaw !== "") {
      voltaje = parseFloat(voltRaw);
      if (isNaN(voltaje)) {
        alert("⚠️ El voltaje debe ser un número válido.");
        return;
      }
      if (voltaje < 0) {
        alert("⚠️ El voltaje no puede ser negativo.");
        return;
      }
    }

    const molaridad = sal / MOLAR_MASS_NACL / (aguaVal / 1000);
    data.push({ sal, agua: aguaVal, molaridad, enciende, voltaje });
    document.getElementById("cm-sal").value = "";
    document.getElementById("cm-agua").value = "";
    document.getElementById("cm-volt").value = "";
    save();
  });

  renderTable();
  renderChart();
  window.addEventListener("view-shown", (e) => {
    if (e.detail === "calculadora") renderChart();
  });
})();

// ===================== PWA: registrar service worker =====================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js")
      .then((reg) => console.log("SW registrado:", reg.scope))
      .catch((err) => console.log("SW error:", err));
  });
}
