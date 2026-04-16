let player = null;
    let soundcloudWidget = null;
    let currentMediaType = '';
    let currentVideoId = '';
    let volume = 30;
    let dropCounter = 0;
    let gameOver = false;
    let apiReady = false;

    const slotEffects = [-4, +5, -2, +3, -1, +2, -3, +4, -5, +6];

    const volumeText = document.getElementById('volumeText');
    const mobileVolumeText = document.getElementById('mobileVolumeText');
    const volumeBar = document.getElementById('volumeBar');
    const dropCount = document.getElementById('dropCount');
    const lastEffect = document.getElementById('lastEffect');
    const statusBox = document.getElementById('statusBox');

    const startOverlay = document.getElementById('startOverlay');
    const startYoutubeUrl = document.getElementById('startYoutubeUrl');
    const startLoadBtn = document.getElementById('startLoadBtn');
    const openStartBtn = document.getElementById('openStartBtn');

    const dropBtn = document.getElementById('dropBtn');
    const plinkoStage = document.getElementById('plinkoStage');
    const loseOverlay = document.getElementById('loseOverlay');
    const winOverlay = document.getElementById('winOverlay');
    const playAgainBtn = document.getElementById('playAgainBtn');
    const changeLinkOverlayBtn = document.getElementById('changeLinkOverlayBtn');
    const keepWinBtn = document.getElementById('keepWinBtn');
    const playAgainWinBtn = document.getElementById('playAgainWinBtn');
    const changeMusicWinBtn = document.getElementById('changeMusicWinBtn');
    const fallSpeedRange = document.getElementById('fallSpeedRange');
    const fallSpeedValue = document.getElementById('fallSpeedValue');
    const fallSpeedRangeMobile = document.getElementById('fallSpeedRangeMobile');
    const fallSpeedValueMobile = document.getElementById('fallSpeedValueMobile');
    const resumeVideoBtn = document.getElementById('resumeVideoBtn');
    const playerHost = document.getElementById('player');

    const canvas = document.getElementById('plinkoCanvas');
    const ctx = canvas.getContext('2d');

    const board = {
      x: 24,
      y: 24,
      w: canvas.width - 48,
      h: canvas.height - 48,
      pegRadius: 6,
      ballRadius: 10,
      rows: 9,
      cols: slotEffects.length,
      slotHeight: 82,
      pegs: []
    };

    let balls = [];
    let animationId = null;
    const baseGravity = 0.12;
    let fallSpeedMultiplier = 1;
    let keepStateOnNextVideoLoad = false;
    let apiReadyCheckTimer = null;
    const COOKIE_DAYS = 30;
    let urlMediaOverride = null;
    let didAutoLoadMedia = false;
    let autoLoadInProgress = false;
    let mediaReady = false;
    let pendingMediaVolume = null;
    let restartFromBeginningOnNextPlayAgain = false;
    let defaultStartVolume = 30;
    const DEFAULT_VOLUME_COOKIE_KEY = 'plinko_default_volume';

    function setCookie(name, value, days = COOKIE_DAYS) {
      const maxAge = days * 24 * 60 * 60;
      document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
      try { localStorage.setItem(name, value); } catch (e) {}
    }

    function getCookie(name) {
      const key = `${name}=`;
      const parts = document.cookie.split(';');
      for (const partRaw of parts) {
        const part = partRaw.trim();
        if (part.startsWith(key)) {
          return decodeURIComponent(part.slice(key.length));
        }
      }
      try { return localStorage.getItem(name) || ''; } catch (e) { return ''; }
    }

    function getCookieNumber(name) {
      const raw = getCookie(name);
      if (typeof raw !== 'string') return null;
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return null;
      return n;
    }

    function setStatus(text) {
      statusBox.innerHTML = text;
    }

    function focusPlinkoStage() {
      try {
        plinkoStage.focus({ preventScroll: true });
      } catch (e) {
        plinkoStage.focus();
      }
      try {
        plinkoStage.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {}
    }

    function updateFallSpeedLabel() {
      fallSpeedValue.textContent = `${fallSpeedMultiplier.toFixed(1)}x`;
      if (fallSpeedValueMobile) fallSpeedValueMobile.textContent = `${fallSpeedMultiplier.toFixed(1)}x`;
      if (fallSpeedRangeMobile) fallSpeedRangeMobile.value = String(fallSpeedMultiplier);
      if (fallSpeedRange) fallSpeedRange.value = String(fallSpeedMultiplier);
    }

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    function getDefaultVolumeFromCookie() {
      const raw = getCookie(DEFAULT_VOLUME_COOKIE_KEY);
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return clamp(Math.round(parsed), 0, 100);
      return 30;
    }

    function applyDifficultyFromUrl() {
      let diff = '';
      try {
        const params = new URLSearchParams(window.location.search);
        diff = (params.get('diff') || '').trim().toLowerCase();
      } catch (e) {}

      if (diff === 'easy') {
        defaultStartVolume = 70;
      } else if (diff === 'normal') {
        defaultStartVolume = 50;
      } else if (diff === 'hard') {
        defaultStartVolume = 20;
      } else if (!diff) {
        defaultStartVolume = 30;
      } else {
        defaultStartVolume = getDefaultVolumeFromCookie();
      }

      setCookie(DEFAULT_VOLUME_COOKIE_KEY, String(defaultStartVolume));
    }

    function formatEffect(n) {
      return `${n > 0 ? '+' : ''}${n}%`;
    }

    function ensureYouTubeApiReady() {
      if (apiReady) return true;
      if (window.YT && typeof window.YT.Player === 'function') {
        apiReady = true;
        return true;
      }
      return false;
    }

    function ensureSoundCloudApiReady() {
      return Boolean(window.SC && typeof window.SC.Widget === 'function');
    }

    function isSoundCloudUrl(url) {
      if (!url) return false;
      try {
        const u = new URL(url.trim());
        return u.hostname.includes('soundcloud.com') || u.hostname.includes('snd.sc');
      } catch (e) {
        return false;
      }
    }

    function normalizeSoundCloudUrl(url) {
      if (!url) return '';
      try {
        const u = new URL(url.trim());
        if (u.hostname.toLowerCase() === 'm.soundcloud.com') {
          u.hostname = 'soundcloud.com';
        }
        return u.toString();
      } catch (e) {
        return (url || '').trim();
      }
    }

    async function resolveSoundCloudUrl(url) {
      const normalized = normalizeSoundCloudUrl(url);
      if (!isSoundCloudUrl(normalized)) return normalized;
      let host = '';
      try {
        host = new URL(normalized).hostname.toLowerCase();
      } catch (e) {
        return normalized;
      }

      const shouldResolveViaOEmbed =
        host === 'on.soundcloud.com' ||
        host === 'snd.sc' ||
        host === 'm.soundcloud.com';
      if (!shouldResolveViaOEmbed) return normalized;

      const oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(normalized)}`;
      const resp = await fetch(oembedUrl, { method: 'GET', mode: 'cors', cache: 'no-store' });
      if (!resp.ok) {
        throw new Error(`oEmbed HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const html = typeof data.html === 'string' ? data.html : '';
      const srcMatch = html.match(/src="([^"]+)"/i);
      if (srcMatch && srcMatch[1]) {
        const iframeSrc = srcMatch[1].replace(/&amp;/g, '&');
        const iframeUrl = new URL(iframeSrc);
        const embedTarget = iframeUrl.searchParams.get('url');
        if (embedTarget) return embedTarget;
      }

      if (typeof data.url === 'string' && data.url.trim()) {
        return normalizeSoundCloudUrl(data.url);
      }
      return normalized;
    }

    function parseMediaInput(url) {
      const raw = (url || '').trim();
      if (!raw) return null;
      if (isSoundCloudUrl(raw)) {
        return { type: 'soundcloud', source: normalizeSoundCloudUrl(raw) };
      }
      const videoId = extractVideoId(raw);
      if (videoId) {
        return { type: 'youtube', source: videoId };
      }
      return null;
    }

    function setMediaCookies(type, source) {
      setCookie('plinko_media_type', type);
      setCookie('plinko_media_source', source);
      if (type === 'youtube') {
        setCookie('plinko_video_id', source);
        setCookie('plinko_video_url', `https://www.youtube.com/watch?v=${source}`);
      } else if (type === 'soundcloud') {
        setCookie('plinko_video_id', '');
        setCookie('plinko_video_url', source);
      }
    }

    function setMediaVolume(v) {
      const target = clamp(Math.round(v), 0, 100);
      if (currentMediaType === 'youtube' && player && typeof player.setVolume === 'function') {
        player.setVolume(target);
      } else if (currentMediaType === 'soundcloud' && soundcloudWidget && typeof soundcloudWidget.setVolume === 'function') {
        if (!mediaReady) {
          pendingMediaVolume = target;
          return;
        }
        soundcloudWidget.setVolume(target);
      }
    }

    function flushPendingMediaVolume() {
      if (pendingMediaVolume == null) return;
      const queuedVolume = pendingMediaVolume;
      pendingMediaVolume = null;
      setMediaVolume(queuedVolume);
    }

    function hasPlayableMedia() {
      if (currentMediaType === 'youtube') {
        return Boolean(player && typeof player.playVideo === 'function' && currentVideoId);
      }
      if (currentMediaType === 'soundcloud') {
        return Boolean(soundcloudWidget && typeof soundcloudWidget.play === 'function');
      }
      return false;
    }

    function playCurrentMedia() {
      if (currentMediaType === 'youtube' && player && typeof player.playVideo === 'function') {
        player.playVideo();
      } else if (currentMediaType === 'soundcloud' && soundcloudWidget && typeof soundcloudWidget.play === 'function') {
        soundcloudWidget.play();
      }
    }

    function stopCurrentMedia() {
      if (currentMediaType === 'youtube' && player && typeof player.stopVideo === 'function') {
        player.stopVideo();
      } else if (currentMediaType === 'soundcloud' && soundcloudWidget && typeof soundcloudWidget.pause === 'function') {
        soundcloudWidget.pause();
      }
    }

    function pauseCurrentMedia() {
      if (currentMediaType === 'youtube' && player && typeof player.pauseVideo === 'function') {
        player.pauseVideo();
      } else if (currentMediaType === 'soundcloud' && soundcloudWidget && typeof soundcloudWidget.pause === 'function') {
        soundcloudWidget.pause();
      }
    }

    function restartCurrentMedia() {
      if (currentMediaType === 'youtube' && player && typeof player.seekTo === 'function') {
        player.seekTo(0, true);
        playCurrentMedia();
        return;
      }
      if (currentMediaType === 'soundcloud' && soundcloudWidget && typeof soundcloudWidget.seekTo === 'function') {
        try {
          soundcloudWidget.seekTo(0);
        } catch (e) {}
        playCurrentMedia();
      }
    }

    function setResumeVideoButtonVisible(visible) {
      if (!resumeVideoBtn) return;
      resumeVideoBtn.classList.toggle('show', Boolean(visible));
    }

    function updateVolumeDisplay() {
      volumeText.textContent = `${volume}%`;
      if (mobileVolumeText) mobileVolumeText.textContent = `${volume}%`;
      volumeBar.style.width = `${volume}%`;
      setMediaVolume(volume);
      setCookie('plinko_volume', String(volume));
    }

    function cancelAllBalls() {
      if (animationId) cancelAnimationFrame(animationId);
      animationId = null;
      balls = [];
    }

    function resetGameUI() {
      volume = defaultStartVolume;
      dropCounter = 0;
      gameOver = false;
      lastEffect.textContent = '0%';
      dropCount.textContent = '0';
      setCookie('plinko_drop_count', '0');
      setCookie('plinko_last_effect', '0%');
      loseOverlay.classList.remove('show');
      winOverlay.classList.remove('show');
      updateVolumeDisplay();
      setStatus(`Game da san sang (mac dinh ${defaultStartVolume}%). Moi lan tha bong bi tru 1% volume truoc.`);
      playCurrentMedia();
      setResumeVideoButtonVisible(false);
      cancelAllBalls();
      draw();
    }

    function extractVideoId(url) {
      if (!url) return '';
      url = url.trim();
      const directMatch = url.match(/^[a-zA-Z0-9_-]{11}$/);
      if (directMatch) return directMatch[0];
      try {
        const u = new URL(url);
        if (u.hostname.includes('youtu.be')) return u.pathname.replace('/', '').slice(0, 11);
        if (u.searchParams.get('v')) return u.searchParams.get('v').slice(0, 11);
        const parts = u.pathname.split('/').filter(Boolean);
        const embedIndex = parts.findIndex(p => p === 'embed' || p === 'shorts');
        if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1].slice(0, 11);
      } catch (e) {}
      return '';
    }

    function applySavedProgress() {
      const savedVideoIdRaw = getCookie('plinko_video_id');
      const savedVideoUrl = getCookie('plinko_video_url');
      const savedVideoId = savedVideoIdRaw || extractVideoId(savedVideoUrl);

      volume = defaultStartVolume;
      const savedVolume = getCookieNumber('plinko_volume');
      if (savedVolume != null) {
        volume = clamp(Math.round(savedVolume), 0, 100);
      } else {
        setCookie('plinko_volume', String(volume));
      }

      const savedDropCount = getCookieNumber('plinko_drop_count');
      if (savedDropCount != null && savedDropCount >= 0) {
        dropCounter = Math.floor(savedDropCount);
        dropCount.textContent = String(dropCounter);
      }

      const savedLastEffect = getCookie('plinko_last_effect');
      if (savedLastEffect) {
        lastEffect.textContent = savedLastEffect;
      }

      const savedSpeed = getCookieNumber('plinko_fall_speed');
      if (savedSpeed != null) {
        fallSpeedMultiplier = clamp(savedSpeed, 0.5, 5);
        fallSpeedRange.value = String(fallSpeedMultiplier);
      }

      if (savedVideoUrl) {
        startYoutubeUrl.value = savedVideoUrl;
      } else if (savedVideoId) {
        startYoutubeUrl.value = `https://www.youtube.com/watch?v=${savedVideoId}`;
      }
    }

    function applyVideoOverrideFromUrl() {
      try {
        const params = new URLSearchParams(window.location.search);
        const webParam = params.get('web');
        if (!webParam) return;
        const media = parseMediaInput(webParam);
        if (!media) {
          setStatus('<span style="color:#fecaca;">Tham so web khong hop le.</span>');
          return;
        }
        urlMediaOverride = media;
        startYoutubeUrl.value = webParam;
      } catch (e) {}
    }

    function ensureDefaultVolumeCookieForFirstVisit() {
      const savedVolume = getCookieNumber('plinko_volume');
      if (savedVolume != null) return;
      volume = defaultStartVolume;
      setCookie('plinko_volume', String(volume));
    }

    function getSavedMediaInput() {
      if (urlMediaOverride) return urlMediaOverride;
      const mediaType = getCookie('plinko_media_type');
      const mediaSource = getCookie('plinko_media_source');
      if (mediaType === 'youtube' && mediaSource) return { type: 'youtube', source: mediaSource };
      if (mediaType === 'soundcloud' && mediaSource) return { type: 'soundcloud', source: mediaSource };

      const savedVideoIdRaw = getCookie('plinko_video_id');
      const savedVideoUrl = getCookie('plinko_video_url');
      const savedVideoId = savedVideoIdRaw || extractVideoId(savedVideoUrl);
      if (savedVideoId) return { type: 'youtube', source: savedVideoId };
      if (savedVideoUrl && isSoundCloudUrl(savedVideoUrl)) return { type: 'soundcloud', source: savedVideoUrl };
      return null;
    }

    async function tryAutoLoadSavedMedia() {
      if (didAutoLoadMedia || autoLoadInProgress) return;
      const media = getSavedMediaInput();
      if (!media) return;

      if (media.type === 'youtube' && !ensureYouTubeApiReady()) return;
      if (media.type === 'soundcloud' && !ensureSoundCloudApiReady()) return;

      autoLoadInProgress = true;
      try {
        if (media.type === 'youtube') {
          createOrLoadYouTubePlayer(media.source);
        } else {
          let resolvedSource = media.source;
          try {
            resolvedSource = await resolveSoundCloudUrl(media.source);
          } catch (e) {}
          createOrLoadSoundCloud(resolvedSource);
        }

        didAutoLoadMedia = true;
        startOverlay.classList.remove('show');
        if (urlMediaOverride) {
          setStatus(`Da doi media tu URL va giu nguyen tien trinh. Volume hien tai: <strong>${volume}%</strong>.`);
        } else {
          setStatus(`Da khoi phuc tien trinh. Volume hien tai: <strong>${volume}%</strong>.`);
        }
      } finally {
        autoLoadInProgress = false;
      }
    }

    window.onYouTubeIframeAPIReady = function () {
      apiReady = true;
      if (apiReadyCheckTimer) {
        clearInterval(apiReadyCheckTimer);
        apiReadyCheckTimer = null;
      }
      tryAutoLoadSavedMedia();
      if (!didAutoLoadMedia) {
        setStatus('YouTube API da san sang. Nhap link YouTube hoac SoundCloud o man hinh bat dau.');
      }
    };

    function createOrLoadYouTubePlayer(videoId) {
      currentMediaType = 'youtube';
      currentVideoId = videoId;
      mediaReady = false;
      setMediaCookies('youtube', videoId);

      if (soundcloudWidget) {
        soundcloudWidget = null;
        playerHost.innerHTML = '';
      }

      if (player && typeof player.loadVideoById === 'function') {
        player.loadVideoById({ videoId, suggestedQuality: 'large' });
        setTimeout(() => {
          try {
            mediaReady = true;
            setMediaVolume(volume);
            playCurrentMedia();
          } catch (e) {}
        }, 250);
        return;
      }

      player = new YT.Player('player', {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          playsinline: 1,
          iv_load_policy: 3,
          loop: 1,
          playlist: videoId,
          origin: location.origin
        },
        events: {
          onReady: () => {
            mediaReady = true;
            updateVolumeDisplay();
            playCurrentMedia();
            setResumeVideoButtonVisible(false);
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.ENDED && currentVideoId) {
              setResumeVideoButtonVisible(false);
              player.loadVideoById(currentVideoId);
              return;
            }
            if (
              event.data === YT.PlayerState.PAUSED ||
              event.data === YT.PlayerState.CUED ||
              event.data === YT.PlayerState.UNSTARTED
            ) {
              setResumeVideoButtonVisible(true);
              return;
            }
            if (
              event.data === YT.PlayerState.PLAYING ||
              event.data === YT.PlayerState.BUFFERING
            ) {
              mediaReady = true;
              setResumeVideoButtonVisible(false);
            }
          }
        }
      });
    }

    function createOrLoadSoundCloud(trackUrl) {
      currentMediaType = 'soundcloud';
      currentVideoId = '';
      mediaReady = false;
      pendingMediaVolume = null;
      setMediaCookies('soundcloud', trackUrl);

      if (player && typeof player.destroy === 'function') {
        try { player.destroy(); } catch (e) {}
      }
      player = null;

      const scSrc = `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=true`;
      playerHost.innerHTML = `<iframe id="scPlayerFrame" width="100%" height="100%" scrolling="no" frameborder="no" allow="autoplay" src="${scSrc}"></iframe>`;

      const frame = document.getElementById('scPlayerFrame');
      soundcloudWidget = SC.Widget(frame);
      soundcloudWidget.bind(SC.Widget.Events.READY, () => {
        mediaReady = true;
        updateVolumeDisplay();
        flushPendingMediaVolume();
        playCurrentMedia();
        setResumeVideoButtonVisible(false);
      });
      soundcloudWidget.bind(SC.Widget.Events.PAUSE, () => {
        setResumeVideoButtonVisible(true);
      });
      soundcloudWidget.bind(SC.Widget.Events.PLAY, () => {
        setResumeVideoButtonVisible(false);
      });
      soundcloudWidget.bind(SC.Widget.Events.FINISH, () => {
        restartCurrentMedia();
        setResumeVideoButtonVisible(false);
      });
    }

    async function loadVideoFromStart() {
      const media = parseMediaInput(startYoutubeUrl.value);
      if (!media) {
        setStatus('<span style="color:#fecaca;">Link YouTube/SoundCloud chua hop le.</span>');
        return;
      }

      if (media.type === 'youtube' && !ensureYouTubeApiReady()) {
        setStatus('YouTube API chua san sang. Kiem tra Internet/adblock roi thu lai.');
        return;
      }
      if (media.type === 'soundcloud' && !ensureSoundCloudApiReady()) {
        setStatus('SoundCloud API chua san sang. Thu lai sau it giay.');
        return;
      }

      const hadMediaBeforeLoad = Boolean(currentMediaType || currentVideoId || soundcloudWidget);
      const keepState = keepStateOnNextVideoLoad && hadMediaBeforeLoad && !gameOver;

      if (media.type === 'youtube') {
        createOrLoadYouTubePlayer(media.source);
      } else {
        let resolvedSource = media.source;
        try {
          setStatus('Dang resolve link SoundCloud...');
          resolvedSource = await resolveSoundCloudUrl(media.source);
        } catch (e) {
          setStatus('<span style="color:#fecaca;">Khong resolve duoc link SoundCloud. Thu link day du dang soundcloud.com/... </span>');
          return;
        }
        createOrLoadSoundCloud(resolvedSource);
      }

      startOverlay.classList.remove('show');
      if (keepState) {
        setStatus(`Da doi media, giu nguyen game state. Volume hien tai: <strong>${volume}%</strong>.`);
      } else {
        resetGameUI();
        setStatus(`Da mo media moi. Mac dinh volume ${defaultStartVolume}%.`);
      }
      keepStateOnNextVideoLoad = false;
      urlMediaOverride = null;
    }

    function buildPegs() {
      board.pegs = [];
      const usableTop = board.y + 70;
      const usableBottom = board.y + board.h - board.slotHeight - 40;
      const stepY = (usableBottom - usableTop) / (board.rows - 1);
      const slotW = board.w / board.cols;

      for (let row = 0; row < board.rows; row++) {
        const count = row % 2 === 0 ? board.cols - 1 : board.cols;
        const offsetX = row % 2 === 0 ? slotW : slotW / 2;
        const y = usableTop + row * stepY;
        for (let col = 0; col < count; col++) {
          const x = board.x + offsetX + col * slotW;
          board.pegs.push({ x, y });
        }
        if (row % 2 === 0) {
          const edgeInset = board.pegRadius + 3;
          board.pegs.push({ x: board.x + edgeInset, y });
          board.pegs.push({ x: board.x + board.w - edgeInset, y });
        }
      }
    }

    function drawRoundedRect(x, y, w, h, r) {
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

    function drawBoard() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawRoundedRect(board.x, board.y, board.w, board.h, 20);
      ctx.fillStyle = 'rgba(255,255,255,.085)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,.20)';
      ctx.stroke();

      const slotW = board.w / board.cols;
      const slotY = board.y + board.h - board.slotHeight;

      for (let i = 0; i < board.cols; i++) {
        const x = board.x + i * slotW;
        const effect = slotEffects[i];
        const isPositive = effect > 0;

        ctx.fillStyle = isPositive ? 'rgba(34,197,94,.18)' : 'rgba(239,68,68,.18)';
        ctx.fillRect(x, slotY, slotW, board.slotHeight);

        ctx.strokeStyle = 'rgba(255,255,255,.08)';
        ctx.strokeRect(x, slotY, slotW, board.slotHeight);

        ctx.fillStyle = isPositive ? '#86efac' : '#fca5a5';
        ctx.font = 'bold 22px Outfit, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatEffect(effect), x + slotW / 2, slotY + board.slotHeight / 2);
      }

      for (const peg of board.pegs) {
        const pegGradient = ctx.createRadialGradient(
          peg.x - board.pegRadius * 0.35,
          peg.y - board.pegRadius * 0.35,
          1,
          peg.x,
          peg.y,
          board.pegRadius + 1.2
        );
        pegGradient.addColorStop(0, 'rgba(255,255,255,.85)');
        pegGradient.addColorStop(.45, 'rgba(220,238,255,.45)');
        pegGradient.addColorStop(1, 'rgba(190,220,255,.12)');

        ctx.beginPath();
        ctx.arc(peg.x, peg.y, board.pegRadius, 0, Math.PI * 2);
        ctx.fillStyle = pegGradient;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(245,245,244,.7)';
      ctx.font = '14px Outfit, Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Bam nut hoac bam truc tiep vao bang de tha bong', board.x + 16, board.y + 28);
    }

    function drawBalls() {
      for (const ball of balls) {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, board.ballRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fde68a';
        ctx.stroke();
      }
    }

    function draw() {
      drawBoard();
      drawBalls();
    }

    function applyBaseDropCost() {
      volume = clamp(volume - 1, 0, 100);
      updateVolumeDisplay();
      return volume;
    }

    function resolveSlot(x) {
      const slotW = board.w / board.cols;
      let index = Math.floor((x - board.x) / slotW);
      return clamp(index, 0, board.cols - 1);
    }

    function finishDrop(ballIndex, slotIndex) {
      if (gameOver) return;
      const effect = slotEffects[slotIndex];
      const volumeBeforeEffect = volume;
      const isOverkillLoss = effect < 0 && (volumeBeforeEffect + effect) < 0;
      volume = clamp(volumeBeforeEffect + effect, 0, 100);
      updateVolumeDisplay();
      lastEffect.textContent = `${formatEffect(effect)}`;
      setCookie('plinko_last_effect', lastEffect.textContent);

      const ballNo = balls[ballIndex]?.id ?? '?';
      balls.splice(ballIndex, 1);
      setStatus(`Bong #${ballNo} vao o ${formatEffect(effect)}. Volume hien tai: <strong>${volume}%</strong>.`);

      if (isOverkillLoss) {
        handleLose(`Bong vao o <strong>${formatEffect(effect)}</strong> vuot qua volume hien tai (${volumeBeforeEffect}%) nen thua ngay.`);
        return;
      }

      if (volume <= 0) {
        if (balls.length === 0) {
          handleLose(`Bong vao o <strong>${formatEffect(effect)}</strong> nen volume ve 0%.`);
        } else {
          setStatus(`Bong #${ballNo} vao o ${formatEffect(effect)} nen volume ve <strong>0%</strong>. Doi cac bong con lai roi xuong de ket thuc.`);
        }
      } else if (volume >= 100) {
        handleWin(`Bong vao o <strong>${formatEffect(effect)}</strong> nen volume dat 100%.`);
      }
    }

    function handleLose(reason) {
      volume = 0;
      updateVolumeDisplay();
      gameOver = true;
      cancelAllBalls();
      pauseCurrentMedia();
      restartFromBeginningOnNextPlayAgain = true;
      setStatus(`${reason} <strong>Ban da thua.</strong>`);
      loseOverlay.classList.add('show');
      draw();
    }

    function handleWin(reason) {
      volume = 100;
      updateVolumeDisplay();
      gameOver = true;
      cancelAllBalls();
      setStatus(`${reason} <strong>Ban da thang.</strong>`);
      winOverlay.classList.add('show');
      draw();
    }

    function startDrop(xRatio = Math.random()) {
      focusPlinkoStage();
      if (gameOver) return;
      if (!hasPlayableMedia() || !mediaReady) {
        setStatus('Hay mo video YouTube/SoundCloud truoc khi choi.');
        return;
      }
      if (volume <= 0) {
        if (balls.length === 0) {
          handleLose('Volume da ve 0% nen khong the tha them bong.');
        } else {
          setStatus('Volume dang 0%. Khong the tha them bong cho den khi cac bong hien tai roi xong.');
        }
        return;
      }

      applyBaseDropCost();

      dropCounter += 1;
      dropCount.textContent = String(dropCounter);
      setCookie('plinko_drop_count', String(dropCounter));
      lastEffect.textContent = '-1%';
      setCookie('plinko_last_effect', lastEffect.textContent);

      const spawnX = clamp(board.x + 24 + xRatio * (board.w - 48), board.x + 18, board.x + board.w - 18);
      balls.push({
        id: dropCounter,
        x: spawnX,
        y: board.y + 18,
        vx: (Math.random() - 0.5) * 1.4,
        vy: 0
      });

      setStatus(`Lan tha #${dropCounter}: da tru truoc 1% volume. Co the tha tiep nhieu bong.`);
      if (!animationId) animate();
    }

    function animate() {
      if (gameOver) {
        animationId = null;
        return;
      }

      if (balls.length === 0) {
        if (volume <= 0) {
          handleLose('Khong con bong nao tren bang va volume da ve 0%.');
          animationId = null;
          return;
        }
        animationId = null;
        draw();
        return;
      }

      const gravity = baseGravity * fallSpeedMultiplier;
      const slotTop = board.y + board.h - board.slotHeight - board.ballRadius;

      for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];
        if (!ball) continue;

        ball.vy += gravity;
        ball.x += ball.vx;
        ball.y += ball.vy;

        if (ball.x <= board.x + board.ballRadius || ball.x >= board.x + board.w - board.ballRadius) {
          ball.vx *= -0.88;
          ball.x = clamp(ball.x, board.x + board.ballRadius, board.x + board.w - board.ballRadius);
        }

        for (const peg of board.pegs) {
          const dx = ball.x - peg.x;
          const dy = ball.y - peg.y;
          const dist = Math.hypot(dx, dy);
          const minDist = board.ballRadius + board.pegRadius;
          if (dist < minDist && dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;
            ball.x += nx * overlap;
            ball.y += ny * overlap;

            const dot = ball.vx * nx + ball.vy * ny;
            ball.vx -= 1.45 * dot * nx;
            ball.vy -= 0.95 * dot * ny;
            ball.vx += (Math.random() - 0.5) * 0.5;
          }
        }

        ball.vx *= 0.995;
        ball.vy *= 0.997;

        if (ball.y >= slotTop) {
          const slotIndex = resolveSlot(ball.x);
          finishDrop(i, slotIndex);
          if (gameOver) break;
        }
      }

      draw();
      if (!gameOver && balls.length > 0) {
        animationId = requestAnimationFrame(animate);
      } else {
        animationId = null;
      }
    }

    startLoadBtn.addEventListener('click', loadVideoFromStart);
    startYoutubeUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadVideoFromStart();
    });

    openStartBtn.addEventListener('click', () => {
      keepStateOnNextVideoLoad = true;
      if (currentVideoId) {
        startYoutubeUrl.value = `https://www.youtube.com/watch?v=${currentVideoId}`;
      } else if (currentMediaType === 'soundcloud') {
        const savedSource = getCookie('plinko_media_source');
        if (savedSource) startYoutubeUrl.value = savedSource;
      }
      startOverlay.classList.add('show');
      startYoutubeUrl.focus();
      startYoutubeUrl.select();
    });

    playAgainBtn.addEventListener('click', () => {
      resetGameUI();
      if (restartFromBeginningOnNextPlayAgain) {
        restartCurrentMedia();
        restartFromBeginningOnNextPlayAgain = false;
      }
    });
    keepWinBtn.addEventListener('click', () => {
      winOverlay.classList.remove('show');
      gameOver = false;
      setStatus('Ban chon giu nguyen trang thai thang. Co the tiep tuc tha bong.');
      playCurrentMedia();
    });
    playAgainWinBtn.addEventListener('click', () => {
      winOverlay.classList.remove('show');
      resetGameUI();
    });
    changeMusicWinBtn.addEventListener('click', () => {
      winOverlay.classList.remove('show');
      resetGameUI();
      keepStateOnNextVideoLoad = false;
      startOverlay.classList.add('show');
      if (currentVideoId) {
        startYoutubeUrl.value = `https://www.youtube.com/watch?v=${currentVideoId}`;
      }
      startYoutubeUrl.focus();
      startYoutubeUrl.select();
      setStatus(`Chon link YouTube/SoundCloud moi. Volume da dua ve ${defaultStartVolume}%.`);
    });

    changeLinkOverlayBtn.addEventListener('click', () => {
      loseOverlay.classList.remove('show');
      startOverlay.classList.add('show');
      if (currentVideoId) {
        startYoutubeUrl.value = `https://www.youtube.com/watch?v=${currentVideoId}`;
      }
      startYoutubeUrl.focus();
      startYoutubeUrl.select();
      setStatus('Dan link YouTube moi va bam mo video.');
      keepStateOnNextVideoLoad = false;
    });
    if (resumeVideoBtn) {
      resumeVideoBtn.addEventListener('click', () => {
        try {
          if (hasPlayableMedia()) {
            playCurrentMedia();
            setResumeVideoButtonVisible(false);
          }
        } catch (e) {}
      });
    }

    dropBtn.addEventListener('click', () => startDrop());
    fallSpeedRange.addEventListener('input', () => {
      fallSpeedMultiplier = clamp(Number(fallSpeedRange.value) || 1, 0.5, 5);
      updateFallSpeedLabel();
      setCookie('plinko_fall_speed', String(fallSpeedMultiplier));
    });
    if (fallSpeedRangeMobile) {
      fallSpeedRangeMobile.addEventListener('input', () => {
        fallSpeedMultiplier = clamp(Number(fallSpeedRangeMobile.value) || 1, 0.5, 5);
        updateFallSpeedLabel();
        setCookie('plinko_fall_speed', String(fallSpeedMultiplier));
      });
    }

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;
      startDrop(clamp(ratio, 0.05, 0.95));
    });

    applyDifficultyFromUrl();
    ensureDefaultVolumeCookieForFirstVisit();
    applySavedProgress();
    applyVideoOverrideFromUrl();
    tryAutoLoadSavedMedia();
    apiReadyCheckTimer = setInterval(() => {
      if (ensureYouTubeApiReady()) {
        clearInterval(apiReadyCheckTimer);
        apiReadyCheckTimer = null;
      }
      tryAutoLoadSavedMedia();
    }, 400);
    buildPegs();
    updateFallSpeedLabel();
    draw();
    updateVolumeDisplay();




