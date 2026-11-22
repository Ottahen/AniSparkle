const MAX_URL_LENGTH = 2048;
const ALLOWED_FORMATS = new Set(["auto", "hls", "video"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".m4v", ".ogv"]);
const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".home.arpa", ".test", ".invalid"];
let hlsRuntimePromise;

function isPrivateOrLocalHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (host.includes(":")) return true; // Disallow IPv6 literals, including loopback and link-local addresses.
  if (/^(?:\d+\.?){1,4}$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true; // No IPv4 or integer/hex IP forms.
  if (host.split(".").length < 2) return true;
  return false;
}

export function parseDirectMediaUrl(value, requestedFormat = "auto") {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) throw new TypeError("Enter a direct media URL first.");
  if (raw.length > MAX_URL_LENGTH) throw new TypeError("That URL is too long.");
  if (!ALLOWED_FORMATS.has(requestedFormat)) throw new TypeError("Choose a supported media format.");

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError("Enter a complete HTTPS media URL.");
  }
  if (url.protocol !== "https:") throw new TypeError("Only secure HTTPS media URLs are accepted.");
  if (url.username || url.password) throw new TypeError("URLs with embedded usernames or passwords are not accepted.");
  if (isPrivateOrLocalHost(url.hostname)) throw new TypeError("Use a public media host, not a local or private network address.");

  const extension = url.pathname.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() || "";
  let type = requestedFormat;
  if (type === "auto") {
    if (extension === ".m3u8") type = "hls";
    else if (VIDEO_EXTENSIONS.has(extension)) type = "video";
    else throw new TypeError("Could not detect the media type. Use a direct .mp4, .webm, .m4v, .ogv, or .m3u8 link, or choose its format.");
  }
  return Object.freeze({ url: url.href, type });
}

function loadHlsRuntime() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsRuntimePromise) return hlsRuntimePromise;
  hlsRuntimePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "hls-runtime";
    script.src = "/vendor/hls.min.js";
    script.async = true;
    script.onload = () => {
      if (window.Hls) resolve(window.Hls);
      else {
        script.remove();
        hlsRuntimePromise = null;
        reject(new Error("The HLS player library did not initialize."));
      }
    };
    script.onerror = () => {
      script.remove();
      hlsRuntimePromise = null;
      reject(new Error("The HLS player library could not be loaded."));
    };
    document.head.append(script);
  });
  return hlsRuntimePromise;
}

export function initializeDirectPlayer() {
  const video = document.getElementById("direct-video");
  const form = document.getElementById("direct-media-form");
  const urlInput = document.getElementById("media-url");
  const formatSelect = document.getElementById("media-format");
  const emptyState = document.getElementById("player-empty");
  const status = document.getElementById("player-status");
  const clearButton = document.getElementById("clear-media");
  let hls = null;
  let requestVersion = 0;

  const setStatus = (message, state = "") => {
    status.textContent = message;
    status.classList.toggle("is-error", state === "error");
    status.classList.toggle("is-ready", state === "ready");
  };
  const releaseCurrentSource = () => {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    video.pause();
    video.removeAttribute("src");
    video.load();
  };
  const showVideo = () => {
    video.hidden = false;
    emptyState.hidden = true;
  };

  video.addEventListener("playing", () => setStatus("Playing in Ani Sparkle.", "ready"));
  video.addEventListener("canplay", () => setStatus("Ready. Press play when you’re set.", "ready"));
  video.addEventListener("error", () => {
    if (video.hidden) return;
    setStatus("The browser couldn’t play this media. Check the URL, format, HTTPS access, and source permissions.", "error");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const activeRequest = ++requestVersion;
    releaseCurrentSource();
    let source;
    try {
      source = parseDirectMediaUrl(urlInput.value, formatSelect.value);
    } catch (error) {
      video.hidden = true;
      emptyState.hidden = false;
      setStatus(error.message, "error");
      return;
    }
    showVideo();

    if (source.type === "video") {
      video.src = source.url;
      video.load();
      setStatus("Media loaded. Press play to start.", "ready");
      return;
    }

    const supportsNativeHls = Boolean(
      video.canPlayType("application/vnd.apple.mpegurl") || video.canPlayType("application/x-mpegURL"),
    );
    if (supportsNativeHls) {
      video.src = source.url;
      video.load();
      setStatus("HLS source ready. Press play to load it.", "ready");
      return;
    }

    setStatus("Loading HLS playback support…");
    try {
      const Hls = await loadHlsRuntime();
      if (activeRequest !== requestVersion) return;
      if (!Hls.isSupported()) throw new Error("HLS is not supported by this browser.");
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        xhrSetup(xhr) { xhr.withCredentials = false; },
        fetchSetup(context, init) {
          return new Request(context.url, { ...init, credentials: "omit", referrerPolicy: "no-referrer" });
        },
      });
      const activeHls = hls;
      activeHls.on(Hls.Events.MEDIA_ATTACHED, () => activeHls.loadSource(source.url));
      activeHls.on(Hls.Events.MANIFEST_PARSED, () => setStatus("HLS playlist loaded. Press play to start.", "ready"));
      activeHls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || activeRequest !== requestVersion) return;
        setStatus("HLS playback failed. Confirm the media URL is available over HTTPS and its host allows cross-origin playlist/segment requests.", "error");
        activeHls.destroy();
        if (hls === activeHls) hls = null;
      });
      activeHls.attachMedia(video);
    } catch (error) {
      setStatus(error.message || "HLS playback could not be started.", "error");
    }
  });

  clearButton.addEventListener("click", () => {
    requestVersion += 1;
    releaseCurrentSource();
    form.reset();
    video.hidden = true;
    emptyState.hidden = false;
    setStatus("Nothing is loaded. Pasted URLs aren’t saved or sent to the catalog API.");
    urlInput.focus();
  });
}

export function pauseDirectPlayer() {
  const video = document.getElementById("direct-video");
  if (video && !video.paused) video.pause();
}
