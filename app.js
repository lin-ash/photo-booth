(() => {
  // ── State ──
  const state = {
    filter: 'color',       // 'color' | 'bw'
    borderStyle: 'solid',  // 'solid' | 'tape'
    borderColor: '#ffffff',
    photoCount: 4,
    photos: [],            // captured image data URLs
    stickers: [],          // { emoji, x%, y% }
    stream: null,
  };

  // ── DOM refs ──
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const screens = {
    landing: $('#landing-screen'),
    setup:   $('#setup-screen'),
    camera:  $('#camera-screen'),
    edit:    $('#edit-screen'),
  };

  const video         = $('#video');
  const flashOverlay  = $('#flash-overlay');
  const countdownEl   = $('#countdown');
  const currentCountEl = $('#current-count');
  const totalCountEl  = $('#total-count');
  const captureBtn    = $('#capture-btn');
  const retakeBtn     = $('#retake-btn');
  const stripCanvas   = $('#strip-canvas');
  const stickerLayer  = $('#sticker-layer');
  const stickerGrid   = $('#sticker-grid');
  const colorPickerSection = $('#color-picker-section');

  // ── Sticker list ──
  const STICKERS = [
    '❤️','⭐','🔥','✨','💖','🌈','🎉','🦋','🌸','💫',
    '😎','🥳','😍','🤪','👑','💋','🎀','🌟','💐','🍭',
    '🧸','🎈','💎','🪩','🫧','☀️','🌙','🍒','🐱','🦄',
  ];

  // ── Screen navigation ──
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  // ── Setup option handlers ──
  function setupOptionButtons(selector, key) {
    $$(selector).forEach(btn => {
      btn.addEventListener('click', () => {
        btn.parentElement.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state[key] = btn.dataset[key] || btn.dataset.filter || btn.dataset.border || btn.dataset.count;
      });
    });
  }

  // Filter buttons
  $$('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
    });
  });

  // Border style buttons
  $$('[data-border]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-border]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.borderStyle = btn.dataset.border;
      colorPickerSection.classList.toggle('hidden', state.borderStyle === 'tape');
    });
  });

  // Photo count buttons
  $$('[data-count]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-count]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.photoCount = parseInt(btn.dataset.count);
    });
  });

  // Color swatches
  $$('.swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.borderColor = btn.dataset.color;
    });
  });

  // ── Camera ──
  async function startCamera() {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = state.stream;
    } catch (err) {
      alert('Could not access camera. Please allow camera permissions and try again.');
      showScreen('setup');
    }
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach(t => t.stop());
      state.stream = null;
    }
  }

  function capturePhoto() {
    return new Promise(resolve => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');

      // Mirror the capture to match preview
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Apply B&W filter
      if (state.filter === 'bw') {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
      }

      resolve(canvas.toDataURL('image/png'));
    });
  }

  function flashEffect() {
    flashOverlay.style.opacity = '1';
    setTimeout(() => { flashOverlay.style.opacity = '0'; }, 150);
  }

  function showCountdown(number) {
    return new Promise(resolve => {
      countdownEl.textContent = number;
      countdownEl.classList.remove('hidden');
      // Force re-trigger animation
      countdownEl.style.animation = 'none';
      countdownEl.offsetHeight; // reflow
      countdownEl.style.animation = '';
      setTimeout(() => {
        countdownEl.classList.add('hidden');
        resolve();
      }, 900);
    });
  }

  async function handleCapture() {
    captureBtn.disabled = true;
    retakeBtn.classList.add('hidden');

    // 3-2-1 countdown
    await showCountdown('3');
    await showCountdown('2');
    await showCountdown('1');

    flashEffect();
    const dataUrl = await capturePhoto();
    state.photos.push(dataUrl);

    const photoNum = state.photos.length;
    currentCountEl.textContent = Math.min(photoNum + 1, state.photoCount);

    if (photoNum > 1) {
      retakeBtn.classList.remove('hidden');
    }

    if (photoNum >= state.photoCount) {
      // All photos taken
      stopCamera();
      goToEdit();
    } else {
      captureBtn.disabled = false;
    }
  }

  function retakeLast() {
    state.photos.pop();
    currentCountEl.textContent = state.photos.length + 1;
    captureBtn.disabled = false;
    if (state.photos.length <= 1) {
      retakeBtn.classList.add('hidden');
    }
  }

  // ── Strip rendering ──
  function renderStrip() {
    const count = state.photos.length;
    if (count === 0) return Promise.resolve();

    return new Promise(resolve => {
      const padding = 30;
      const gap = 16;
      const photoW = 400;
      const photoH = 300;
      const bottomExtra = 60; // space for branding at bottom

      const stripW = photoW + padding * 2;
      const stripH = padding + (photoH + gap) * count - gap + padding + bottomExtra;

      stripCanvas.width = stripW;
      stripCanvas.height = stripH;
      const ctx = stripCanvas.getContext('2d');

      // Draw border background
      if (state.borderStyle === 'tape') {
        drawTapeBorder(ctx, stripW, stripH);
      } else {
        ctx.fillStyle = state.borderColor;
        ctx.fillRect(0, 0, stripW, stripH);
      }

      // Load and draw photos
      let loaded = 0;
      state.photos.forEach((src, i) => {
        const img = new Image();
        img.onload = () => {
          const x = padding;
          const y = padding + i * (photoH + gap);

          // Draw photo (cover-fit)
          const srcAspect = img.width / img.height;
          const dstAspect = photoW / photoH;
          let sx, sy, sw, sh;
          if (srcAspect > dstAspect) {
            sh = img.height;
            sw = sh * dstAspect;
            sx = (img.width - sw) / 2;
            sy = 0;
          } else {
            sw = img.width;
            sh = sw / dstAspect;
            sx = 0;
            sy = (img.height - sh) / 2;
          }

          // Rounded corners for each photo
          const r = 6;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + photoW - r, y);
          ctx.quadraticCurveTo(x + photoW, y, x + photoW, y + r);
          ctx.lineTo(x + photoW, y + photoH - r);
          ctx.quadraticCurveTo(x + photoW, y + photoH, x + photoW - r, y + photoH);
          ctx.lineTo(x + r, y + photoH);
          ctx.quadraticCurveTo(x, y + photoH, x, y + photoH - r);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, sx, sy, sw, sh, x, y, photoW, photoH);
          ctx.restore();

          loaded++;
          if (loaded === count) {
            // Draw branding text
            const brandY = stripH - bottomExtra / 2;
            const textColor = getContrastText(
              state.borderStyle === 'tape' ? '#f5e6d0' : state.borderColor
            );
            ctx.fillStyle = textColor;
            ctx.globalAlpha = 0.5;
            ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Photo Booth', stripW / 2, brandY + 2);
            ctx.font = '11px "Segoe UI", system-ui, sans-serif';
            ctx.fillText(new Date().toLocaleDateString(), stripW / 2, brandY + 20);
            ctx.globalAlpha = 1;
            resolve();
          }
        };
        img.src = src;
      });
    });
  }

  function drawTapeBorder(ctx, w, h) {
    // Warm vintage paper base
    ctx.fillStyle = '#f5e6d0';
    ctx.fillRect(0, 0, w, h);

    // Film sprocket holes along left and right edges
    const holeRadius = 5;
    const holeSpacing = 20;
    const holeMargin = 10;
    ctx.fillStyle = '#d4c4a8';
    for (let y = 10; y < h; y += holeSpacing) {
      // Left holes
      ctx.beginPath();
      ctx.arc(holeMargin, y, holeRadius, 0, Math.PI * 2);
      ctx.fill();
      // Right holes
      ctx.beginPath();
      ctx.arc(w - holeMargin, y, holeRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle horizontal tape lines
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Grain noise overlay
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 15;
      data[i] += noise;
      data[i + 1] += noise;
      data[i + 2] += noise;
    }
    ctx.putImageData(imageData, 0, 0);

    // Aged vignette
    const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  function getContrastText(bgColor) {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#333333' : '#eeeeee';
  }

  // ── Stickers ──
  function populateStickers() {
    stickerGrid.innerHTML = '';
    STICKERS.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'sticker-btn';
      btn.textContent = emoji;
      btn.addEventListener('click', () => addStickerToStrip(emoji));
      stickerGrid.appendChild(btn);
    });
  }

  function addStickerToStrip(emoji) {
    // Place sticker at random position on the strip
    const x = 15 + Math.random() * 60; // percent
    const y = 10 + Math.random() * 75; // percent

    const el = document.createElement('span');
    el.className = 'placed-sticker';
    el.textContent = emoji;
    el.style.left = x + '%';
    el.style.top = y + '%';

    // Make draggable
    makeDraggable(el);

    stickerLayer.appendChild(el);
    state.stickers.push({ emoji, el });
  }

  function makeDraggable(el) {
    let offsetX, offsetY, isDragging = false;

    const onStart = (e) => {
      isDragging = true;
      const rect = el.parentElement.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      offsetX = clientX - el.getBoundingClientRect().left;
      offsetY = clientY - el.getBoundingClientRect().top;
      el.style.zIndex = '10';
      el.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!isDragging) return;
      const rect = el.parentElement.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const x = ((clientX - offsetX - rect.left) / rect.width) * 100;
      const y = ((clientY - offsetY - rect.top) / rect.height) * 100;
      el.style.left = Math.max(0, Math.min(95, x)) + '%';
      el.style.top = Math.max(0, Math.min(95, y)) + '%';
      e.preventDefault();
    };

    const onEnd = () => {
      isDragging = false;
      el.style.zIndex = '5';
      el.style.cursor = 'grab';
    };

    el.addEventListener('mousedown', onStart);
    el.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  }

  function undoSticker() {
    if (state.stickers.length === 0) return;
    const last = state.stickers.pop();
    last.el.remove();
  }

  // ── Save final image ──
  async function saveStrip() {
    // Re-render strip with stickers baked in
    await renderStrip();

    const ctx = stripCanvas.getContext('2d');
    const canvasRect = stripCanvas.getBoundingClientRect();
    const scaleX = stripCanvas.width / canvasRect.width;
    const scaleY = stripCanvas.height / canvasRect.height;

    // Draw stickers onto canvas
    const stickerEls = stickerLayer.querySelectorAll('.placed-sticker');
    stickerEls.forEach(el => {
      const elRect = el.getBoundingClientRect();
      const layerRect = stickerLayer.getBoundingClientRect();

      const x = (elRect.left - layerRect.left) * scaleX;
      const y = (elRect.top - layerRect.top) * scaleY;
      const fontSize = parseFloat(getComputedStyle(el).fontSize) * scaleX;

      ctx.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(el.textContent, x, y + fontSize * 0.85);
    });

    // Download
    const link = document.createElement('a');
    link.download = `photobooth-${Date.now()}.png`;
    link.href = stripCanvas.toDataURL('image/png');
    link.click();
  }

  // ── Edit screen setup ──
  async function goToEdit() {
    showScreen('edit');
    populateStickers();
    stickerLayer.innerHTML = '';
    state.stickers = [];
    await renderStrip();

    // Size sticker layer to match canvas display size
    const resizeOverlay = () => {
      const rect = stripCanvas.getBoundingClientRect();
      stickerLayer.style.width = rect.width + 'px';
      stickerLayer.style.height = rect.height + 'px';
      stickerLayer.style.left = stripCanvas.offsetLeft + 'px';
      stickerLayer.style.top = stripCanvas.offsetTop + 'px';
    };
    resizeOverlay();
    window.addEventListener('resize', resizeOverlay);
  }

  // ── Navigation event listeners ──
  $('#start-btn').addEventListener('click', () => showScreen('setup'));

  $('#to-camera-btn').addEventListener('click', async () => {
    state.photos = [];
    currentCountEl.textContent = '1';
    totalCountEl.textContent = state.photoCount;
    captureBtn.disabled = false;
    retakeBtn.classList.add('hidden');
    showScreen('camera');
    await startCamera();
  });

  captureBtn.addEventListener('click', handleCapture);
  retakeBtn.addEventListener('click', retakeLast);

  $('#undo-sticker-btn').addEventListener('click', undoSticker);
  $('#save-btn').addEventListener('click', saveStrip);

  $('#retake-all-btn').addEventListener('click', () => {
    state.photos = [];
    state.stickers = [];
    stickerLayer.innerHTML = '';
    showScreen('setup');
  });
})();
