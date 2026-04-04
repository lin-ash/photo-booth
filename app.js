(() => {
  // ── State ──
  const state = {
    filter: 'color',       // 'color' | 'bw'
    borderStyle: 'solid',  // 'solid' | 'tape' | 'template'
    borderColor: '#ffffff',
    borderTemplate: null,  // selected STRIP_TEMPLATES entry
    photoCount: 4,
    photos: [],            // captured image data URLs
    stickers: [],          // { src, el }
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
  const previewVideo  = $('#preview-video');
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
  const templateGrid = $('#template-grid');
  const previewCanvas = $('#preview-canvas');
  const previewVideoLayer = $('#preview-video-layer');
  const previewOverlay = $('#preview-overlay');

  // ── Strip templates ──
  // 3 layers: background color/image → photos → overlay PNG on top.
  // background: color string or image path. overlay: transparent PNG in /strip-overlay/.
  const STRIP_TEMPLATES = [
    {
      name: 'Charlie',
      background: '#ffffff',
      overlay: 'strip-overlay/charlie-4.png',
      photoCount: 4,
    },
  ];

  // ── Sticker list (PNG images in /stickers folder) ──
  const STICKERS = [
    { name: 'Charlie', src: 'stickers/charlie.png' },
  ];

  // ── Template image cache ──
  const templateImageCache = {};

  function loadTemplateImage(src) {
    if (templateImageCache[src]) return Promise.resolve(templateImageCache[src]);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { templateImageCache[src] = img; resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  // ── Template picker ──
  function populateTemplates() {
    templateGrid.innerHTML = '';

    // "None" option
    const noneBtn = document.createElement('button');
    noneBtn.className = 'template-btn' + (!state.borderTemplate ? ' active' : '');
    noneBtn.innerHTML = '<span class="template-none">&#10005;</span><span>None</span>';
    noneBtn.addEventListener('click', () => {
      state.borderTemplate = null;
      state.borderStyle = 'solid';
      templateGrid.querySelectorAll('.template-btn').forEach(b => b.classList.remove('active'));
      noneBtn.classList.add('active');
      updatePreview();
    });
    templateGrid.appendChild(noneBtn);

    STRIP_TEMPLATES.forEach(template => {
      const btn = document.createElement('button');
      btn.className = 'template-btn' + (state.borderTemplate === template ? ' active' : '');
      const img = document.createElement('img');
      img.src = template.overlay;
      img.alt = template.name;
      img.draggable = false;
      btn.appendChild(img);
      const label = document.createElement('span');
      label.textContent = template.name;
      btn.appendChild(label);
      btn.addEventListener('click', () => {
        state.borderTemplate = template;
        state.borderStyle = 'template';
        templateGrid.querySelectorAll('.template-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updatePreview();
      });
      templateGrid.appendChild(btn);
    });
  }

  // ── Preview ──
  let previewStream = null;

  async function startPreviewCamera() {
    try {
      previewStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      previewVideo.srcObject = previewStream;
    } catch (err) {
      // Preview is non-critical, silently fail
    }
  }

  function stopPreviewCamera() {
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
      previewStream = null;
    }
  }

  function getStripLayout(count) {
    const padding = 30;
    const gap = 16;
    const photoW = 400;
    const photoH = 300;
    const bottomExtra = 60;
    const stripW = photoW + padding * 2;
    const stripH = padding + (photoH + gap) * count - gap + padding + bottomExtra;
    return { stripW, stripH, padding, gap, photoW, photoH, bottomExtra };
  }

  function updatePreview() {
    const count = state.photoCount;
    const { stripW, stripH, padding, gap, photoW, photoH, bottomExtra } = getStripLayout(count);

    previewCanvas.width = stripW;
    previewCanvas.height = stripH;
    const ctx = previewCanvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, stripW, stripH);

    // Grey photo placeholders
    for (let i = 0; i < count; i++) {
      const x = padding;
      const y = padding + i * (photoH + gap);
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
      ctx.fillStyle = '#dddddd';
      ctx.fillRect(x, y, photoW, photoH);
      ctx.restore();
    }

    // Branding text
    const brandY = stripH - bottomExtra / 2;
    ctx.fillStyle = '#999999';
    ctx.globalAlpha = 0.5;
    ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Photo Booth', stripW / 2, brandY + 2);
    ctx.font = '11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(new Date().toLocaleDateString(), stripW / 2, brandY + 20);
    ctx.globalAlpha = 1;

    // Show overlay image on top of the video layer (if 4-photo template exists)
    const template = STRIP_TEMPLATES.find(t => t.photoCount === count);
    if (template) {
      previewOverlay.src = template.overlay;
      previewOverlay.classList.remove('hidden');
    } else {
      previewOverlay.classList.add('hidden');
    }

    // Position live video elements over the photo slots
    previewVideoLayer.innerHTML = '';
    const scaleX = 200 / stripW;

    for (let i = 0; i < count; i++) {
      const x = padding;
      const y = padding + i * (photoH + gap);

      const el = document.createElement('div');
      el.className = 'preview-video-slot' + (state.filter === 'bw' ? ' bw-preview' : '');
      el.style.left = (x * scaleX) + 'px';
      el.style.top = (y * scaleX) + 'px';
      el.style.width = (photoW * scaleX) + 'px';
      el.style.height = (photoH * scaleX) + 'px';

      const vid = document.createElement('video');
      vid.autoplay = true;
      vid.playsInline = true;
      vid.muted = true;
      if (previewStream) {
        vid.srcObject = previewStream;
      }
      el.appendChild(vid);
      previewVideoLayer.appendChild(el);
    }
  }

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
      updatePreview();
    });
  });

  // Border style buttons (edit screen — only solid/tape, not template)
  $$('[data-border]').forEach(btn => {
    btn.addEventListener('click', async () => {
      $$('[data-border]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.borderStyle = btn.dataset.border;
      state.borderTemplate = null;
      colorPickerSection.classList.toggle('hidden', state.borderStyle !== 'solid');
      await renderStrip();
    });
  });

  // Color swatches
  $$('.swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.borderColor = btn.dataset.color;
      updatePreview();
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
  async function renderStrip() {
    const count = state.photos.length;
    if (count === 0) return;

    const isTemplate = state.borderStyle === 'template' && state.borderTemplate;
    const { stripW, stripH, padding, gap, photoW, photoH, bottomExtra } = getStripLayout(count);

    stripCanvas.width = stripW;
    stripCanvas.height = stripH;
    const ctx = stripCanvas.getContext('2d');

    // Layer 1: Background
    if (isTemplate) {
      const bg = state.borderTemplate.background;
      if (bg.startsWith('#')) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, stripW, stripH);
      } else {
        const bgImg = await loadTemplateImage(bg);
        ctx.drawImage(bgImg, 0, 0, stripW, stripH);
      }
    } else if (state.borderStyle === 'tape') {
      drawTapeBorder(ctx, stripW, stripH);
    } else {
      ctx.fillStyle = state.borderColor;
      ctx.fillRect(0, 0, stripW, stripH);
    }

    // Layer 2: Photos
    await Promise.all(state.photos.map((src, i) => new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const x = padding;
        const y = padding + i * (photoH + gap);

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
        resolve();
      };
      img.src = src;
    })));

    // Layer 3: Overlay stickers / branding
    if (isTemplate) {
      const ovImg = await loadTemplateImage(state.borderTemplate.overlay);
      ctx.drawImage(ovImg, 0, 0, stripW, stripH);
    } else {
      const brandY = stripH - bottomExtra / 2;
      const textColor = getContrastText(
        state.borderStyle === 'tape' ? '#000000' : state.borderColor
      );
      ctx.fillStyle = textColor;
      ctx.globalAlpha = 0.5;
      ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Photo Booth', stripW / 2, brandY + 2);
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(new Date().toLocaleDateString(), stripW / 2, brandY + 20);
      ctx.globalAlpha = 1;
    }
  }

  function drawTapeBorder(ctx, w, h) {
    // Black film base
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Sprocket holes — rectangular with rounded corners, along both edges
    const holeW = 10;
    const holeH = 7;
    const holeSpacing = 20;
    const holeR = 1.5;
    const marginX = 6;

    ctx.fillStyle = '#ffffff';
    for (let y = 8; y < h; y += holeSpacing) {
      // Left sprocket hole
      drawRoundRect(ctx, marginX, y, holeW, holeH, holeR);
      ctx.fill();
      // Right sprocket hole
      drawRoundRect(ctx, w - marginX - holeW, y, holeW, holeH, holeR);
      ctx.fill();
    }

    // Subtle film edge lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginX + holeW + 4, 0);
    ctx.lineTo(marginX + holeW + 4, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - marginX - holeW - 4, 0);
    ctx.lineTo(w - marginX - holeW - 4, h);
    ctx.stroke();

    // Film grain noise
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 10;
      data[i] += noise;
      data[i + 1] += noise;
      data[i + 2] += noise;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
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
    STICKERS.forEach(sticker => {
      const btn = document.createElement('button');
      btn.className = 'sticker-btn';
      const img = document.createElement('img');
      img.src = sticker.src;
      img.alt = sticker.name;
      img.draggable = false;
      btn.appendChild(img);
      btn.addEventListener('click', () => addStickerToStrip(sticker.src));
      stickerGrid.appendChild(btn);
    });
  }

  function addStickerToStrip(src) {
    // Place sticker at random position on the strip
    const x = 15 + Math.random() * 60; // percent
    const y = 10 + Math.random() * 75; // percent

    const el = document.createElement('img');
    el.className = 'placed-sticker';
    el.src = src;
    el.draggable = false;
    el.style.left = x + '%';
    el.style.top = y + '%';

    // Make draggable
    makeDraggable(el);

    stickerLayer.appendChild(el);
    state.stickers.push({ src, el });
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
    for (const el of stickerEls) {
      const elRect = el.getBoundingClientRect();
      const layerRect = stickerLayer.getBoundingClientRect();

      const x = (elRect.left - layerRect.left) * scaleX;
      const y = (elRect.top - layerRect.top) * scaleY;
      const w = elRect.width * scaleX;
      const h = elRect.height * scaleY;

      // Load image for canvas drawing
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = el.src;
      });
      ctx.drawImage(img, x, y, w, h);
    }

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

    // Sync edit panel UI with current state
    $$('[data-border]').forEach(b => b.classList.toggle('active', b.dataset.border === state.borderStyle));
    $$('.swatch').forEach(b => b.classList.toggle('active', b.dataset.color === state.borderColor));
    colorPickerSection.classList.toggle('hidden', state.borderStyle !== 'solid');

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
  $('#start-btn').addEventListener('click', async () => {
    showScreen('setup');
    populateTemplates();
    await startPreviewCamera();
    updatePreview();
  });

  $('#to-camera-btn').addEventListener('click', async () => {
    stopPreviewCamera();
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

  $('#retake-all-btn').addEventListener('click', async () => {
    state.photos = [];
    state.stickers = [];
    state.borderStyle = 'solid';
    state.borderColor = '#ffffff';
    state.borderTemplate = null;
    stickerLayer.innerHTML = '';
    // Reset edit panel UI
    $$('[data-border]').forEach(b => b.classList.toggle('active', b.dataset.border === 'solid'));
    $$('.swatch').forEach(b => b.classList.toggle('active', b.dataset.color === '#ffffff'));
    colorPickerSection.classList.remove('hidden');
    showScreen('setup');
    populateTemplates();
    await startPreviewCamera();
    updatePreview();
  });
})();
