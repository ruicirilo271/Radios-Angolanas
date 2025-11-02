// DOM
const stationsEl = document.getElementById("stations");
const player = document.getElementById("player");
const coverImg = document.getElementById("coverImg");
const stationNameEl = document.getElementById("stationName");
const songInfoEl = document.getElementById("songInfo");
const themeBtn = document.getElementById("themeBtn");
const allBtn = document.getElementById("allBtn");
const favBtn = document.getElementById("favBtn");
const histBtn = document.getElementById("histBtn");
const popup = document.getElementById("popup");
const popupTitle = document.getElementById("popup-title");
const popupList = document.getElementById("popup-list");
const closePopup = document.getElementById("closePopup");

const historyListEl = document.getElementById("historyList");
const lyricsEl = document.getElementById("lyrics");
const artistBioEl = document.getElementById("artistBio");
const top10El = document.getElementById("top10");

const FAV_KEY = "radioFavorites_v2";
const HIST_KEY = "radioHistory_v2";

let allStations = [];
let currentStream = null;
let currentStation = null;
let pollInterval = null;
let identifying = false;
let displayedSongKey = null; // to avoid re-fetching lyrics/bio repeatedly

// theme
function setLight(isLight) {
  if (isLight) document.body.classList.add("light"); else document.body.classList.remove("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
}
themeBtn.addEventListener("click", () => setLight(!document.body.classList.contains("light")));
if (localStorage.getItem("theme") === "light") setLight(true);

// load stations
async function loadStations() {
  stationsEl.innerHTML = "A carregar rádios...";
  try {
    const res = await fetch("/stations", {cache: "no-store"});
    const list = await res.json();
    allStations = (Array.isArray(list) ? list : []);
    renderStations(allStations);
  } catch (e) {
    stationsEl.innerHTML = "<p>Erro ao carregar rádios.</p>";
    console.error(e);
  }
}

function renderStations(list) {
  stationsEl.innerHTML = "";
  if (!list.length) {
    stationsEl.innerHTML = "<p>Nenhuma rádio encontrada.</p>";
    return;
  }
  list.forEach(st => {
    const card = document.createElement("div");
    card.className = "station";
    card.innerHTML = `
      <div class="station-header">
        <div class="sname">${st.name}</div>
      </div>
      <div class="station-actions">
        <button class="play">▶ Ouvir</button>
        <button class="fav">⭐</button>
      </div>
    `;
    card.querySelector(".play").addEventListener("click", () => startStation(st));
    card.querySelector(".fav").addEventListener("click", () => toggleFavorite(st));
    stationsEl.appendChild(card);
  });
}

function toggleFavorite(st) {
  let favs = JSON.parse(localStorage.getItem(FAV_KEY)) || [];
  if (favs.find(f => f.name === st.name && f.stream === st.stream)) {
    favs = favs.filter(f => !(f.name === st.name && f.stream === st.stream));
  } else {
    favs.push(st);
  }
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

// history (local)
function saveHistoryLocal(st) {
  let hist = JSON.parse(localStorage.getItem(HIST_KEY)) || [];
  hist = hist.filter(h => !(h.name === st.name && h.stream === st.stream));
  hist.unshift(st);
  if (hist.length > 30) hist.pop();
  localStorage.setItem(HIST_KEY, JSON.stringify(hist));
}

// play / monitor control
async function startStation(st) {
  // stop previous
  if (currentStream && currentStream !== st.stream) {
    await stopMonitor(currentStream);
  }

  currentStream = st.stream;
  currentStation = st;
  player.src = currentStream;
  player.play().catch(()=>{});

  // UI immediate
  stationNameEl.textContent = `📻 ${st.name}`;
  songInfoEl.textContent = `🎧 Tocando...`;
  if (st.img) {
    coverImg.src = st.img;
    coverImg.classList.remove("hidden");
  } else {
    coverImg.classList.add("hidden");
  }

  saveHistoryLocal(st);

  // start server monitor
  try {
    await fetch("/monitor/start", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({stream: currentStream, station_name: st.name})
    });
  } catch (e) {
    console.error("monitor start error", e);
  }

  // start polling every 5s to read nowplaying
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(pollNowPlaying, 5000);
  pollNowPlaying();
}

async function stopMonitor(stream) {
  try {
    await fetch("/monitor/stop", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({stream})
    });
  } catch (e) {
    console.error("monitor stop error", e);
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  displayedSongKey = null;
  clearExtrasUI();
}

function clearExtrasUI() {
  historyListEl.innerHTML = "<p>Sem histórico.</p>";
  lyricsEl.textContent = "—";
  artistBioEl.textContent = "—";
  top10El.textContent = "—";
}

// fetch and render nowplaying + extras
async function pollNowPlaying() {
  if (!currentStream) return;
  try {
    const url = "/nowplaying?stream=" + encodeURIComponent(currentStream);
    const res = await fetch(url, {cache: "no-store"});
    const data = await res.json();

    // always show radio name
    stationNameEl.textContent = `📻 ${currentStation ? currentStation.name : (data.station_name || "Rádio")}`;

    if (data && data.found) {
      songInfoEl.textContent = `🎵 ${data.artist} – ${data.title}`;
      if (data.cover) {
        coverImg.src = data.cover;
        coverImg.classList.remove("hidden");
      } else if (currentStation && currentStation.img) {
        coverImg.src = currentStation.img;
        coverImg.classList.remove("hidden");
      } else {
        coverImg.classList.add("hidden");
      }

      // if new song detected, fetch extras
      const key = `${data.artist} - ${data.title}`;
      if (displayedSongKey !== key) {
        displayedSongKey = key;
        fetchExtras(currentStream, data.artist, data.title);
      }
      // always update server-side history UI too
      fetchHistory(currentStream);
    } else {
      songInfoEl.textContent = `🎧 Tocando...`;
      if (currentStation && currentStation.img) {
        coverImg.src = currentStation.img;
        coverImg.classList.remove("hidden");
      } else {
        coverImg.classList.add("hidden");
      }
      // still refresh history
      fetchHistory(currentStream);
    }
  } catch (e) {
    console.error("poll error", e);
  }
}

// fetch server-side history (last 4)
async function fetchHistory(stream) {
  try {
    const res = await fetch("/history?stream=" + encodeURIComponent(stream), {cache: "no-store"});
    const list = await res.json();
    renderHistory(list);
  } catch (e) {
    console.error("history fetch error", e);
  }
}

function renderHistory(list) {
  if (!list || !list.length) {
    historyListEl.innerHTML = "<p>Sem histórico.</p>";
    return;
  }
  historyListEl.innerHTML = "";
  list.forEach(item => {
    const div = document.createElement("div");
    div.className = "hist-item";
    div.innerHTML = `
      <img src="${item.cover || ''}" alt="capa" onerror="this.style.display='none'">
      <div class="hist-meta">
        <div class="hist-title">${item.title}</div>
        <div class="hist-artist">${item.artist}</div>
      </div>
    `;
    historyListEl.appendChild(div);
  });
}

// fetch lyrics, artist bio and top10
async function fetchExtras(stream, artist, title) {
  // clear while loading
  lyricsEl.textContent = "A carregar letra...";
  artistBioEl.textContent = "A carregar biografia...";
  top10El.textContent = "A carregar top 10...";

  // lyrics
  try {
    const r = await fetch(`/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`, {cache: "no-store"});
    if (r.ok) {
      const j = await r.json();
      lyricsEl.textContent = j.lyrics || "Letra não encontrada.";
    } else {
      const j = await r.json().catch(()=>({}));
      lyricsEl.textContent = j.error ? ("Erro: " + j.error) : "Letra não encontrada.";
    }
  } catch (e) {
    lyricsEl.textContent = "Erro ao obter letra.";
    console.error("lyrics error", e);
  }

  // artist bio
  try {
    const r2 = await fetch(`/artist/bio?artist=${encodeURIComponent(artist)}`, {cache: "no-store"});
    if (r2.ok) {
      const j2 = await r2.json();
      artistBioEl.innerHTML = j2.bio ? (j2.bio + (j2.url ? `<div><a href="${j2.url}" target="_blank">Ver no Last.fm</a></div>` : "")) : "Biografia não encontrada.";
    } else {
      const j2 = await r2.json().catch(()=>({}));
      artistBioEl.textContent = j2.error ? ("Erro: " + j2.error) : "Biografia não encontrada.";
    }
  } catch (e) {
    artistBioEl.textContent = "Erro ao obter biografia.";
    console.error("artist bio error", e);
  }

  // top 10
  try {
    const r3 = await fetch(`/artist/top?artist=${encodeURIComponent(artist)}`, {cache: "no-store"});
    if (r3.ok) {
      const j3 = await r3.json();
      const top = j3.top || j3.toptracks || [];
      if (!top.length) {
        top10El.textContent = "Top 10 não disponível.";
      } else {
        top10El.innerHTML = "<ol>" + top.map(t => `<li><a href="${t.url||'#'}" target="_blank">${t.name}</a> ${t.playcount?`(${t.playcount})`:''}</li>`).join("") + "</ol>";
      }
    } else {
      const j3 = await r3.json().catch(()=>({}));
      top10El.textContent = j3.error ? ("Erro: " + j3.error) : "Top 10 não disponível.";
    }
  } catch (e) {
    top10El.textContent = "Erro ao obter top 10.";
    console.error("artist top error", e);
  }
}

// popup favorites / history
allBtn.addEventListener("click", () => renderStations(allStations));
favBtn.addEventListener("click", () => openPopup("Favoritos", FAV_KEY));
histBtn.addEventListener("click", () => openPopup("Histórico (local)", HIST_KEY));
closePopup.addEventListener("click", () => popup.classList.add("hidden"));

function openPopup(title, key) {
  popupTitle.textContent = title;
  popupList.innerHTML = "";
  const items = JSON.parse(localStorage.getItem(key)) || [];
  if (!items.length) {
    popupList.innerHTML = "<p>Sem itens.</p>";
  } else {
    items.forEach(st => {
      const div = document.createElement("div");
      div.className = "station small";
      div.innerHTML = `<div class="sname">${st.name}</div>`;
      div.addEventListener("click", () => { startStation(st); popup.classList.add("hidden"); });
      popupList.appendChild(div);
    });
  }
  popup.classList.remove("hidden");
}

// init
loadStations();
