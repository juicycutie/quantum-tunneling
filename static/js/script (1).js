// Menunggu DOM ter-load penuh
document.addEventListener("DOMContentLoaded", () => {
  const isEmbed = document.body.dataset.embed === "1";
  const getTheme = () => document.documentElement.dataset.theme || "dark";
  // 1. Pemetaan Referensi Elemen UI
  const sliders = {
    E: document.getElementById("energy-slider"),
    V0: document.getElementById("v0-slider"),
    L: document.getElementById("length-slider"),
  };

  const inputs = {
    E: document.getElementById("energy-input"),
    V0: document.getElementById("v0-input"),
    L: document.getElementById("length-input"),
  };

  const outputs = {
    T_text: document.getElementById("val-transmission"),
    R_text: document.getElementById("val-reflection"),
    T_bar: document.getElementById("bar-transmission"),
    R_bar: document.getElementById("bar-reflection"),
    info: document.getElementById("info-text"),
  };

  const calcOutputs = {
    inputs: document.getElementById("calc-inputs"),
    caseText: document.getElementById("calc-case"),
    k1: document.getElementById("calc-k1"),
    k2: document.getElementById("calc-k2"),
    kappa: document.getElementById("calc-kappa"),
    tAbs: document.getElementById("calc-t"),
    rAbs: document.getElementById("calc-r"),
    T: document.getElementById("calc-T"),
    R: document.getElementById("calc-R"),
  };

  const formulaOutputs = {
    k1: document.getElementById("formula-k1"),
    k2: document.getElementById("formula-k2"),
    denom: document.getElementById("formula-denom"),
    t: document.getElementById("formula-t"),
    tr: document.getElementById("formula-tr"),
  };

  const btnReset = document.getElementById("btn-reset");
  const btnPause = document.getElementById("btn-pause");
  const plotContainer = document.getElementById("plot-container");

  const viewSliders = {
    zoom: document.getElementById("zoom-slider"),
    speed: document.getElementById("speed-slider"),
  };

  const viewInputs = {
    zoom: document.getElementById("zoom-input"),
    speed: document.getElementById("speed-input"),
  };

  const baseRange = { x: [-5, 5], y: [-5, 5] };
  let viewState = {
    zoom: 1.0,
    speed: 1.0,
    xRange: [...baseRange.x],
    yRange: [...baseRange.y],
  };

  // 2. State Aplikasi Dasar
  let currentData = {
    E: 1.0,
    V0: 2.0,
    L: 1.0,
    x_min: viewState.xRange[0],
    x_max: viewState.xRange[1],
  };
  let plotInitialized = false; // Flag untuk Plotly
  let simulationResult = null; // Menyimpan hasil komputasi dari backend
  let animationId = null; // ID untuk requestAnimationFrame
  let plotEventsAttached = false;
  let animationPaused = false;
  let pauseOffset = 0;
  let pausedAt = 0;
  let relayoutTimer = null;
  let lastXLen = null;

  // 3. Logika Event Listeners
  // Fungsi untuk menyinkronkan UI Slider & Input Box
  function syncControls(id, value) {
    sliders[id].value = value;
    inputs[id].value = value;
    currentData[id] = parseFloat(value);
    fetchSimulationData();
  }

  Object.keys(sliders).forEach((key) => {
    if (!sliders[key] || !inputs[key]) return;
    // Event saat slider digeser secara kontinu
    sliders[key].addEventListener("input", (e) => {
      inputs[key].value = e.target.value;
      currentData[key] = parseFloat(e.target.value);
      fetchSimulationData(); // Request real-time update
    });

    // Event saat input box diisi secara manual
    inputs[key].addEventListener("change", (e) => {
      let val = parseFloat(e.target.value);
      const min = parseFloat(e.target.min);
      const sliderMax = parseFloat(sliders[key].max);

      // Validasi batas minimal & maksimal
      if (Number.isFinite(min) && val < min) val = min;
      if (Number.isFinite(sliderMax) && val > sliderMax) {
        sliders[key].value = sliderMax;
      } else {
        sliders[key].value = val;
      }

      e.target.value = val;
      currentData[key] = val;
      fetchSimulationData();
    });
  });

  // Event Klik Reset Button
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      syncControls("E", 1.0);
      syncControls("V0", 2.0);
      syncControls("L", 1.0);
    });
  }

  if (btnPause) {
    btnPause.addEventListener("click", () => {
      if (animationPaused) {
        animationPaused = false;
        pauseOffset = performance.now() - pausedAt;
        btnPause.innerText = "Pause Animasi";
      } else {
        animationPaused = true;
        pausedAt = performance.now() - pauseOffset;
        btnPause.innerText = "Lanjutkan Animasi";
      }
    });
  }

  function getAnimTime() {
    return animationPaused ? pausedAt : performance.now() - pauseOffset;
  }

  function applyZoom() {
    const xCenter = (viewState.xRange[0] + viewState.xRange[1]) / 2;
    const yCenter = (viewState.yRange[0] + viewState.yRange[1]) / 2;

    const baseHalfX = (baseRange.x[1] - baseRange.x[0]) / 2;
    const baseHalfY = (baseRange.y[1] - baseRange.y[0]) / 2;

    const halfX = baseHalfX / viewState.zoom;
    const halfY = baseHalfY / viewState.zoom;

    viewState.xRange = [xCenter - halfX, xCenter + halfX];
    viewState.yRange = [yCenter - halfY, yCenter + halfY];
    currentData.x_min = viewState.xRange[0];
    currentData.x_max = viewState.xRange[1];

    if (plotInitialized && plotContainer && window.Plotly) {
      Plotly.relayout(plotContainer, {
        "xaxis.range": viewState.xRange,
        "yaxis.range": viewState.yRange,
      });
    }

    fetchSimulationData();
  }

  function syncViewControl(id, value) {
    viewSliders[id].value = value;
    viewInputs[id].value = value;

    const numericValue = parseFloat(value);
    if (id === "zoom") {
      viewState.zoom = numericValue;
      applyZoom();
    } else if (id === "speed") {
      viewState.speed = numericValue;
    }
  }

  Object.keys(viewSliders).forEach((key) => {
    if (!viewSliders[key] || !viewInputs[key]) return;
    viewSliders[key].addEventListener("input", (e) => {
      syncViewControl(key, e.target.value);
    });

    viewInputs[key].addEventListener("change", (e) => {
      let val = parseFloat(e.target.value);
      const min = parseFloat(e.target.min);

      if (Number.isFinite(min) && val < min) val = min;

      syncViewControl(key, val);
    });
  });

  // 4. API Fetching ke Backend Flask
  async function fetchSimulationData() {
    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(currentData),
      });
      const data = await response.json();
      simulationResult = data;
      updateUI(data); // Render balasan dari server

      // Mulai loop animasi jika belum berjalan
      if (!animationId) {
        animateWave();
      }
    } catch (error) {
      console.error("Error saat fetch API:", error);
    }
  }

  function renderMath(el, tex) {
    if (!el) return;
    if (window.katex && window.katex.render) {
      window.katex.render(tex, el, {
        throwOnError: false,
        displayMode: false,
      });
    } else {
      el.innerText = tex;
    }
  }

  function renderStaticFormulas() {
    renderMath(formulaOutputs.k1, "k_1 = \\sqrt{E}");
    renderMath(
      formulaOutputs.k2,
      "k_2 = \\sqrt{E - V_0}\\;\\;\\text{atau}\\;\\; i\\sqrt{V_0 - E}"
    );
    renderMath(
      formulaOutputs.denom,
      "\\mathrm{denom} = (k_1 + k_2)^2 e^{-i k_2 L} - (k_1 - k_2)^2 e^{i k_2 L}"
    );
    renderMath(
      formulaOutputs.t,
      "t = \\frac{4 k_1 k_2 e^{-i k_1 L}}{\\mathrm{denom}}"
    );
    renderMath(formulaOutputs.tr, "T = |t|^2,\\; R = 1 - T");
  }

  function ensureKatexReady() {
    if (window.katex && window.katex.render) {
      renderStaticFormulas();
      if (simulationResult) {
        updateUI(simulationResult);
      }
      return;
    }
    setTimeout(ensureKatexReady, 80);
  }

  // 5. Update UI dan Konten Informasi
  function updateUI(data) {
    // A. Panggil fungsi render Plotly (Struktur dasar grafik)
    renderPlot(data);

    // B. Update Persentase Output Analitik
    const T_percent = (data.T * 100).toFixed(1);
    const R_percent = (data.R * 100).toFixed(1);

    outputs.T_text.innerText = `${T_percent}%`;
    outputs.R_text.innerText = `${R_percent}%`;

    // Animasi bar width CSS
    outputs.T_bar.style.width = `${T_percent}%`;
    outputs.R_bar.style.width = `${R_percent}%`;

    // C. Update Dynamic Tooltip (Edukasi Fisika)
    if (data.E < data.V0) {
      outputs.info.innerHTML = `<strong>Kasus Kuantum (Tunneling):</strong> Energi partikel (E=${data.E.toFixed(
        1
      )}) lebih rendah dari Tinggi Penghalang (V<sub>0</sub>=${data.V0.toFixed(
        1
      )}). Secara klasik partikel akan terpantul, namun mekanika kuantum membuktikan ada <strong>${T_percent}%</strong> probabilitas gelombang dapat menembus penghalang.`;
    } else if (data.E > data.V0) {
      outputs.info.innerHTML = `<strong>Energi Ekstra:</strong> Energi partikel (E=${data.E.toFixed(
        1
      )}) melebihi Penghalang (V<sub>0</sub>=${data.V0.toFixed(
        1
      )}). Secara klasik 100% tembus, namun secara kuantum <strong>${R_percent}%</strong> gelombang terpantul akibat perubahan mendadak pada medan potensial.`;
    } else {
      outputs.info.innerHTML = `Energi partikel (E) sama dengan tinggi penghalang (V<sub>0</sub>). Keadaan transisi kuantum.`;
    }

    // D. Update langkah perhitungan
    const formatNumber = (value, digits = 3) =>
      Number.isFinite(value) ? value.toFixed(digits) : "-";

    const k2Real = typeof data.k2_real === "number" ? data.k2_real : 0;
    const k2Imag = typeof data.k2_imag === "number" ? data.k2_imag : 0;

    const inputTex = `E=${data.E.toFixed(2)},\\; V_0=${data.V0.toFixed(
      2
    )},\\; L=${data.L.toFixed(2)}`;
    renderMath(calcOutputs.inputs, inputTex);

    if (data.E < data.V0) {
      renderMath(calcOutputs.caseText, "\\text{Kasus: } E < V_0");
    } else if (data.E > data.V0) {
      renderMath(calcOutputs.caseText, "\\text{Kasus: } E > V_0");
    } else {
      renderMath(calcOutputs.caseText, "\\text{Kasus: } E = V_0");
    }

    renderMath(
      calcOutputs.k1,
      `k_1 = \\sqrt{E} = ${formatNumber(data.k1)}`
    );

    if (data.E < data.V0) {
      renderMath(
        calcOutputs.k2,
        `k_2 = i\\sqrt{V_0 - E} = i\\sqrt{${data.V0.toFixed(2)} - ${data.E.toFixed(
          2
        )}} = i\\,${formatNumber(Math.abs(k2Imag))}`
      );
    } else if (data.E > data.V0) {
      renderMath(
        calcOutputs.k2,
        `k_2 = \\sqrt{E - V_0} = \\sqrt{${data.E.toFixed(2)} - ${data.V0.toFixed(
          2
        )}} = ${formatNumber(k2Real)}`
      );
    } else {
      renderMath(calcOutputs.k2, "k_2 = 0");
    }

    renderMath(
      calcOutputs.kappa,
      `\\kappa = \\sqrt{|V_0 - E|} = ${formatNumber(data.kappa)}`
    );
    renderMath(calcOutputs.tAbs, `|t| = ${formatNumber(data.t_abs)}`);
    renderMath(calcOutputs.rAbs, `|r| = ${formatNumber(data.r_abs)}`);
    renderMath(calcOutputs.T, `T = |t|^2 = ${formatNumber(data.T)}`);
    renderMath(calcOutputs.R, `R = 1 - T = ${formatNumber(data.R)}`);
  }

  // 6. Konfigurasi dan Rendering Plotly.js
  function renderPlot(data) {
    if (!plotContainer || !window.Plotly) return;
    const theme = getTheme();
    const palette =
      theme === "light"
        ? {
            barrierFill: "rgba(250, 204, 21, 0.35)",
            energyLine: "#dc2626",
            psiLine: "rgba(37, 99, 235, 0.45)",
            psiFill: "rgba(59, 130, 246, 0.18)",
            waveLine: "#1d4ed8",
            text: "#0f172a",
            muted: "#475569",
            grid: "rgba(100, 116, 139, 0.25)",
            axis: "rgba(100, 116, 139, 0.45)",
            plotBg: "rgba(248, 250, 252, 0)",
            paperBg: "rgba(248, 250, 252, 0)",
            hoverBg: "rgba(255, 255, 255, 0.95)",
            hoverText: "#0f172a",
          }
        : {
            barrierFill: "rgba(241, 196, 15, 0.35)",
            energyLine: "#e74c3c",
            psiLine: "rgba(52, 152, 219, 0.4)",
            psiFill: "rgba(52, 152, 219, 0.15)",
            waveLine: "#2980b9",
            text: "#e2e8f0",
            muted: "#cbd5f5",
            grid: "rgba(148, 163, 184, 0.18)",
            axis: "rgba(148, 163, 184, 0.35)",
            plotBg: "rgba(15, 23, 42, 0)",
            paperBg: "rgba(15, 23, 42, 0)",
            hoverBg: "rgba(15, 23, 42, 0.95)",
            hoverText: "#e2e8f0",
          };
    // Trace 0: Area Blok Penghalang Potensial
    const traceV = {
      x: data.x,
      y: data.V,
      type: "scatter",
      mode: "none",
      fill: "tozeroy",
      fillcolor: palette.barrierFill,
      name: "Penghalang (V0)",
      hoverinfo: "none",
    };

    // Trace 1: Garis Energi Kinetik Partikel (E)
    const traceE = {
      x: data.x,
      y: Array(data.x.length).fill(data.E),
      type: "scatter",
      mode: "lines",
      line: {
        color: palette.energyLine,
        width: 2,
        dash: "dashdot",
      },
      name: "Tingkat Energi (E)",
      hoverinfo: "none",
    };

    // Trace 2: Amplop Probabilitas Kerapatan (|psi|^2)
    const tracePsiSq = {
      x: data.x,
      y: data.psi_sq,
      type: "scatter",
      mode: "lines",
      line: {
        color: palette.psiLine,
        width: 1,
        shape: "spline",
        smoothing: 1.3,
      },
      fill: "tonexty",
      fillcolor: palette.psiFill,
      name: "Amplop Probabilitas (|psi|^2)",
    };

    // Trace 3: Gelombang Berjalan (Real Part of Psi)
    // Hitung posisi awal gelombang berdasarkan waktu agar tidak flicker
    const time = getAnimTime() * 0.005 * viewState.speed;
    const phase = data.E * time;
    const cos_p = Math.cos(phase);
    const sin_p = Math.sin(phase);

    let wave_y = data.x.map((_, i) => {
      let val = data.psi_real[i] * cos_p + data.psi_imag[i] * sin_p;
      return data.E + val;
    });

    const traceWave = {
      x: data.x,
      y: wave_y,
      type: "scatter",
      mode: "lines",
      line: {
        color: palette.waveLine,
        width: 2.5,
        shape: "spline",
        smoothing: 1.3,
      },
      hoverinfo: isEmbed ? "skip" : "x+y",
      name: "Gelombang Re(Psi)",
    };

    // Konfigurasi Tata Letak Grafik
    const axisBase = {
      zeroline: true,
      zerolinecolor: palette.axis,
      showgrid: true,
      gridcolor: palette.grid,
      linecolor: palette.axis,
      tickcolor: palette.axis,
      tickfont: { color: palette.muted },
      titlefont: { color: palette.muted },
    };

    const layout = {
      title: {
        text: isEmbed
          ? ""
          : "Simulasi Quantum Tunneling (Animasi Gelombang Berjalan)",
        font: { size: 16, color: palette.text },
      },
      xaxis: {
        title: "Posisi Ruang (x)",
        range: viewState.xRange,
        ...axisBase,
        zeroline: !isEmbed,
        showline: !isEmbed,
        showticklabels: !isEmbed,
        ticks: isEmbed ? "" : "outside",
        title: isEmbed ? "" : "Posisi Ruang (x)",
        fixedrange: isEmbed,
      },
      yaxis: {
        title: "Tingkat Energi & Amplitudo",
        range: viewState.yRange,
        ...axisBase,
        zeroline: !isEmbed,
        showline: !isEmbed,
        showticklabels: !isEmbed,
        ticks: isEmbed ? "" : "outside",
        title: isEmbed ? "" : "Tingkat Energi & Amplitudo",
        fixedrange: isEmbed,
      },
      margin: { t: isEmbed ? 20 : 50, l: isEmbed ? 20 : 60, r: 20, b: isEmbed ? 20 : 60 },
      showlegend: !isEmbed,
      legend: {
        orientation: "h",
        y: -0.15,
        x: 0.5,
        xanchor: "center",
        font: { color: palette.muted },
      },
      dragmode: isEmbed ? false : "pan",
      uirevision: "view",
      plot_bgcolor: palette.plotBg,
      paper_bgcolor: palette.paperBg,
      hovermode: isEmbed ? false : "x",
      hoverlabel: {
        bgcolor: palette.hoverBg,
        bordercolor: palette.axis,
        font: { color: palette.hoverText },
      },
    };

    const config = {
      responsive: true,
      displayModeBar: false,
      scrollZoom: !isEmbed,
    };

    const traces = isEmbed
      ? [traceWave]
      : [traceV, traceE, tracePsiSq, traceWave];

    const xLen = data.x.length;
    if (!plotInitialized) {
      Plotly.newPlot("plot-container", traces, layout, config);
      plotInitialized = true;
      lastXLen = xLen;

      if (!plotEventsAttached) {
        plotContainer.on("plotly_relayout", (eventData) => {
          const x0 = eventData["xaxis.range[0]"];
          const x1 = eventData["xaxis.range[1]"];
          const y0 = eventData["yaxis.range[0]"];
          const y1 = eventData["yaxis.range[1]"];

          if (x0 !== undefined && x1 !== undefined) {
            viewState.xRange = [x0, x1];
            currentData.x_min = x0;
            currentData.x_max = x1;
          }
          if (y0 !== undefined && y1 !== undefined) {
            viewState.yRange = [y0, y1];
          }

          if (eventData["xaxis.autorange"] || eventData["yaxis.autorange"]) {
            viewState.xRange = [...baseRange.x];
            viewState.yRange = [...baseRange.y];
            applyZoom();
          }

          if (x0 !== undefined && x1 !== undefined) {
            if (relayoutTimer) {
              clearTimeout(relayoutTimer);
            }
            relayoutTimer = setTimeout(() => {
              fetchSimulationData();
            }, 120);
          }
        });
        plotEventsAttached = true;
      }
    } else {
      if (lastXLen !== xLen) {
        Plotly.react("plot-container", traces, layout, config);
        lastXLen = xLen;
        return;
      }

      if (isEmbed) {
        Plotly.restyle(
          "plot-container",
          { x: [data.x], y: [wave_y] },
          [0]
        );
      } else {
        Plotly.restyle("plot-container", { x: [data.x], y: [data.V] }, [0]);
        Plotly.restyle(
          "plot-container",
          { y: [Array(data.x.length).fill(data.E)] },
          [1]
        );
        Plotly.restyle(
          "plot-container",
          { x: [data.x], y: [data.psi_sq] },
          [2]
        );
        Plotly.restyle("plot-container", { x: [data.x], y: [wave_y] }, [3]);
      }
    }
  }

  // 7. Loop Animasi Kuantum (requestAnimationFrame)
  function animateWave() {
    if (!window.Plotly || !plotContainer) {
      animationId = requestAnimationFrame(animateWave);
      return;
    }
    if (!simulationResult || !plotInitialized) {
      animationId = requestAnimationFrame(animateWave);
      return;
    }

    const data = simulationResult;
    if (
      !Array.isArray(data.x) ||
      !Array.isArray(data.psi_real) ||
      !Array.isArray(data.psi_imag) ||
      data.x.length !== data.psi_real.length ||
      data.x.length !== data.psi_imag.length
    ) {
      animationId = requestAnimationFrame(animateWave);
      return;
    }
    if (animationPaused) {
      animationId = requestAnimationFrame(animateWave);
      return;
    }

    const time = getAnimTime() * 0.005 * viewState.speed; // Faktor kecepatan animasi

    // Frekuensi osilasi bergantung pada Energi (E)
    const phase = data.E * time;
    const cos_p = Math.cos(phase);
    const sin_p = Math.sin(phase);

    let wave_y = new Array(data.x.length);
    for (let i = 0; i < data.x.length; i++) {
      // Re(Psi(x,t)) = Re(psi(x) * exp(-iEt))
      // = psi_real * cos(Et) + psi_imag * sin(Et)
      let val = data.psi_real[i] * cos_p + data.psi_imag[i] * sin_p;
      wave_y[i] = data.E + val; // Offset sesuai tingkat energi
    }

    // Update hanya koordinat Y dari Trace ke-3 (Gelombang Re(Psi))
    try {
      Plotly.restyle("plot-container", { y: [wave_y] }, [isEmbed ? 0 : 3]);
    } catch (error) {
      console.warn("Gagal update animasi gelombang:", error);
    }

    // Lanjutkan loop
    animationId = requestAnimationFrame(animateWave);
  }

  // Eksekusi awal
  document.addEventListener("themechange", () => {
    if (simulationResult && plotInitialized) {
      renderPlot(simulationResult);
    }
  });

  fetchSimulationData();
  renderStaticFormulas();
  ensureKatexReady();
});
