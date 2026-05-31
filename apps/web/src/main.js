const demoCanvas = document.getElementById("demoCanvas");
    const demoOverlay = document.getElementById("demoOverlay");
    const demoMiniShell = document.getElementById("demoMiniShell");
    const demoExpandedShell = document.getElementById("demoExpandedShell");
    const demoOverlayPanel = document.getElementById("demoOverlayPanel");
    const demoResponseShell = document.getElementById("demoResponseShell");
    const demoLoadingState = document.getElementById("demoLoadingState");
    const demoResponseTitle = document.getElementById("demoResponseTitle");
    const demoResponseList = document.getElementById("demoResponseList");
    const demoFocusText = document.getElementById("demoFocusText");
    const demoAskForm = document.getElementById("demoAskForm");
    const demoAskInput = document.getElementById("demoAskInput");
    const demoFrame = document.querySelector(".interactive-demo-frame");
    const interviewVideoWindow = document.querySelector(".interview-video-window");
    const howListeningTimer = document.getElementById("howListeningTimer");
    const floatingCta = document.getElementById("floatingCta");
    const primaryDownloadButtons = document.querySelectorAll(".cta-row .btn-primary, .hero-actions .btn-primary, .final-cta-inner .btn-primary");
    const baseDemoWidth = 1280;
    const baseDemoHeight = 760;
    const maxDemoScale = 0.78;
    const mobileDemoQuery = window.matchMedia("(max-width: 640px)");

    function syncDemoScale() {
      if (!demoFrame) return;

      if (mobileDemoQuery.matches) {
        demoFrame.style.setProperty("--demo-scale", "1");

        const availableWidth = Math.max(demoFrame.clientWidth - 24, 1);
        const activeShell = demoExpandedShell.classList.contains("active") ? demoExpandedShell : demoMiniShell;
        const mobileMaxOverlayWidth = 900;
        const overlayScale = Math.min(0.52, availableWidth / mobileMaxOverlayWidth);
        const boundedOverlayScale = Math.max(0.32, overlayScale);
        demoFrame.style.setProperty("--mobile-overlay-scale", boundedOverlayScale.toFixed(3));

        const videoHeight = interviewVideoWindow?.offsetHeight || 0;
        const overlayHeight = (activeShell.offsetHeight || demoOverlay?.offsetHeight || 0) * boundedOverlayScale;
        const isExpanded = demoExpandedShell.classList.contains("active");
        const safeHeight = isExpanded
          ? Math.max(videoHeight + 28, overlayHeight + 24)
          : Math.max(videoHeight + 28, 360);

        demoFrame.style.height = `${Math.ceil(safeHeight)}px`;
        demoCanvas.style.minHeight = `${Math.ceil(safeHeight)}px`;
        demoCanvas.style.height = "auto";
        demoOverlay.style.left = "";
        demoOverlay.style.top = "";
        return;
      }

      demoCanvas.style.minHeight = "";
      demoCanvas.style.height = "";
      demoFrame.style.removeProperty("--mobile-overlay-scale");
      const nextScale = Math.min(maxDemoScale, demoFrame.clientWidth / baseDemoWidth);
      demoFrame.style.setProperty("--demo-scale", nextScale.toFixed(4));
      demoFrame.style.height = `${baseDemoHeight * nextScale}px`;
    }

    function scheduleDemoScaleSync() {
      window.requestAnimationFrame(syncDemoScale);
    }

    function syncDemoOverlayBounds(preferCenter = false) {
      if (mobileDemoQuery.matches) return;

      const activeWidth = demoExpandedShell.classList.contains("with-response") ? 900 : 560;
      const activeHeight = demoExpandedShell.classList.contains("active") ? 440 : demoMiniShell.offsetHeight;
      const currentLeft = Number.parseFloat(demoOverlay.style.left) || demoOverlay.offsetLeft;
      const currentTop = Number.parseFloat(demoOverlay.style.top) || demoOverlay.offsetTop;
      const centeredLeft = (baseDemoWidth - activeWidth) / 2;
      const nextLeft = preferCenter ? centeredLeft : currentLeft;
      const clampedLeft = Math.max(0, Math.min(baseDemoWidth - activeWidth, nextLeft));
      const clampedTop = Math.max(0, Math.min(baseDemoHeight - activeHeight, currentTop));

      demoOverlay.style.left = `${clampedLeft}px`;
      demoOverlay.style.top = `${clampedTop}px`;
    }

    syncDemoScale();

    if (window.ResizeObserver && demoFrame) {
      const demoResizeObserver = new ResizeObserver(syncDemoScale);
      demoResizeObserver.observe(demoFrame);
    }

    window.addEventListener("resize", syncDemoScale);
    interviewVideoWindow?.querySelector("video")?.addEventListener("loadedmetadata", syncDemoScale);
    mobileDemoQuery.addEventListener("change", syncDemoScale);

    const demoResponses = {
      answer_qna: {
        title: "Jawab Pertanyaan",
        points: [
          "Prioritas minggu ini sebaiknya ditentukan dari dampak terbesar, urgensi timeline, dan dependensi antar tim.",
          "Kalau ada keputusan yang masih menggantung, pisahkan mana yang harus diputuskan sekarang dan mana yang bisa masuk parking lot.",
          "Dengan begitu meeting tetap menghasilkan arah yang jelas tanpa memaksa semua isu selesai sekaligus."
        ]
      },
      answer_convo: {
        title: "Tanggapi",
        points: [
          "Setuju, menurut saya kita perlu kunci dua prioritas paling penting dulu supaya tim punya arah yang jelas minggu ini.",
          "Untuk keputusan yang belum matang, kita bisa tandai sebagai risiko dan tentukan owner-nya, jadi tidak hilang setelah meeting.",
          "Saya usul di akhir sesi kita tutup dengan next step singkat: prioritas, owner, dan deadline."
        ]
      },
      followup: {
        title: "Pertanyaan Follow-up",
        points: [
          "Dari semua prioritas yang dibahas, mana yang paling perlu diputuskan hari ini?",
          "Siapa owner untuk risiko timeline yang paling kritis?",
          "Apa next step paling kecil yang bisa mulai dijalankan setelah meeting ini?"
        ]
      },
      explain: {
        title: "Jelaskan Maksudnya",
        points: [
          "Pembicara sedang menandai bahwa tim belum punya prioritas yang cukup jelas untuk minggu ini.",
          "Kata kuncinya ada di timeline yang mulai padat dan keputusan yang masih menggantung.",
          "Respons terbaik adalah membantu merapikan prioritas, risiko, owner, dan next step."
        ]
      }
    };

    function showDemoMini() {
      demoMiniShell.style.display = "flex";
      demoExpandedShell.classList.remove("active");
      demoExpandedShell.classList.remove("with-response");
      demoOverlayPanel.classList.remove("compact-when-response");
      demoResponseShell.classList.remove("active");
      demoResponseList.innerHTML = "";
      demoLoadingState.classList.remove("active");
      scheduleDemoScaleSync();
      window.requestAnimationFrame(() => syncDemoOverlayBounds());
    }

    function showDemoExpanded() {
      demoMiniShell.style.display = "none";
      demoExpandedShell.classList.add("active");
      scheduleDemoScaleSync();
      window.requestAnimationFrame(() => syncDemoOverlayBounds());
    }

    function renderDemoResponse(title, points) {
      demoResponseTitle.textContent = title;
      demoResponseList.innerHTML = "";
      points.forEach((point) => {
        const li = document.createElement("li");
        li.textContent = point;
        demoResponseList.appendChild(li);
      });
    }

    function simulateDemoResponse(title, points) {
      showDemoExpanded();
      demoExpandedShell.classList.add("with-response");
      demoOverlayPanel.classList.add("compact-when-response");
      demoResponseShell.classList.add("active");
      demoResponseTitle.textContent = "Generating help...";
      demoResponseList.innerHTML = "";
      demoLoadingState.classList.add("active");
      scheduleDemoScaleSync();
      window.requestAnimationFrame(() => syncDemoOverlayBounds(true));

      window.setTimeout(() => {
        demoLoadingState.classList.remove("active");
        renderDemoResponse(title, points);
        scheduleDemoScaleSync();
        window.requestAnimationFrame(() => syncDemoOverlayBounds());
      }, 550);
    }

    document.getElementById("demoOpenBtn").addEventListener("click", showDemoExpanded);
    document.getElementById("demoHideBtn").addEventListener("click", showDemoMini);
    document.getElementById("demoCloseResponseBtn").addEventListener("click", () => {
      demoExpandedShell.classList.remove("with-response");
      demoOverlayPanel.classList.remove("compact-when-response");
      demoResponseShell.classList.remove("active");
      demoResponseList.innerHTML = "";
      demoLoadingState.classList.remove("active");
      scheduleDemoScaleSync();
      window.requestAnimationFrame(() => syncDemoOverlayBounds());
    });

    document.querySelectorAll(".demo-action-btn[data-kind='answer_qna'], .demo-action-btn[data-kind='answer_convo'], .demo-action-btn[data-kind='followup'], .demo-action-btn[data-kind='explain']").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = button.getAttribute("data-kind");
        const data = demoResponses[kind];
        simulateDemoResponse(data.title, data.points);
      });
    });

    document.querySelectorAll(".demo-keyword-btn[data-kind='keyword']").forEach((button) => {
      button.addEventListener("click", () => {
        const label = button.getAttribute("data-label") || "Keyword";
        simulateDemoResponse(`Keyword: ${label}`, [
          `${label} adalah topik yang sedang relevan dengan percakapan meeting terbaru.`,
          "Gunakan keyword ini untuk mengaitkan jawaban ke konteks terbaru.",
          "Respons terbaik tetap singkat, konkret, dan mengarah ke keputusan atau next step."
        ]);
      });
    });

    demoAskForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = demoAskInput.value.trim();
      if (!value) return;
      simulateDemoResponse("Ask", [
        `Dummy jawaban untuk: "${value}".`,
        "Saya sengaja buat singkat, cepat discan, dan siap dibaca.",
        "Kalau ini runtime asli, isi response akan mengikuti transcript terbaru."
      ]);
      demoAskInput.value = "";
    });

    const demoDragState = {
      active: false,
      offsetX: 0,
      offsetY: 0
    };

    function getDemoScale() {
      return Number.parseFloat(getComputedStyle(demoFrame).getPropertyValue("--demo-scale")) || 1;
    }

    function getDemoPoint(event) {
      const rect = demoCanvas.getBoundingClientRect();
      const scale = getDemoScale();
      return {
        x: (event.clientX - rect.left) / scale,
        y: (event.clientY - rect.top) / scale
      };
    }

    function beginDemoDrag(event) {
      if (mobileDemoQuery.matches) {
        return;
      }

      if (event.target.closest("button, input")) {
        return;
      }

      const point = getDemoPoint(event);
      demoDragState.active = true;
      demoDragState.offsetX = point.x - demoOverlay.offsetLeft;
      demoDragState.offsetY = point.y - demoOverlay.offsetTop;
      demoOverlay.classList.add("dragging");
    }

    function moveDemoDrag(event) {
      if (!demoDragState.active) return;

      const point = getDemoPoint(event);
      const activeWidth = demoExpandedShell.classList.contains("with-response") ? 900 : 560;
      const activeHeight = 440;
      const nextLeft = Math.max(0, Math.min(1280 - activeWidth, point.x - demoDragState.offsetX));
      const nextTop = Math.max(0, Math.min(760 - activeHeight, point.y - demoDragState.offsetY));
      demoOverlay.style.left = `${nextLeft}px`;
      demoOverlay.style.top = `${nextTop}px`;
    }

    function endDemoDrag() {
      demoDragState.active = false;
      demoOverlay.classList.remove("dragging");
    }

    demoMiniShell.addEventListener("pointerdown", beginDemoDrag);
    demoExpandedShell.addEventListener("pointerdown", beginDemoDrag);
    demoResponseShell.addEventListener("pointerdown", beginDemoDrag);
    window.addEventListener("pointermove", moveDemoDrag);
    window.addEventListener("pointerup", endDemoDrag);

    demoFocusText.textContent = "Kita perlu menentukan prioritas minggu ini karena timeline mulai padat dan beberapa keputusan masih menggantung.";

    let howListeningSecond = 1;
    window.setInterval(() => {
      if (!howListeningTimer) return;

      howListeningSecond = howListeningSecond >= 30 ? 1 : howListeningSecond + 1;
      howListeningTimer.textContent = `00:${String(howListeningSecond).padStart(2, "0")}`;
    }, 1000);

    if (floatingCta && primaryDownloadButtons.length) {
      const visibleDownloadButtons = new Set();

      function syncFloatingCta() {
        const shouldShow = visibleDownloadButtons.size === 0;
        floatingCta.classList.toggle("visible", shouldShow);
        floatingCta.setAttribute("aria-hidden", String(!shouldShow));
      }

      const downloadObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleDownloadButtons.add(entry.target);
          } else {
            visibleDownloadButtons.delete(entry.target);
          }
        });

        syncFloatingCta();
      }, { threshold: 0.08 });

      primaryDownloadButtons.forEach((button) => downloadObserver.observe(button));
      syncFloatingCta();
    }

  