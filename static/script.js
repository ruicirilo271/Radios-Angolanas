// Elementos DOM
const stationsContainer = document.getElementById("stations");
const player = document.getElementById("player");
const favBtn = document.getElementById("favBtn");
const histBtn = document.getElementById("histBtn");
const allBtn = document.getElementById("allBtn");
const popup = document.getElementById("popup");
const popupTitle = document.getElementById("popup-title");
const popupList = document.getElementById("popup-list");
const closePopup = document.getElementById("closePopup");
const currentStation = document.getElementById("currentStation");
const themeBtn = document.getElementById("themeBtn");

const FAV_KEY = "radioFavorites_v2";
const HIST_KEY = "radioHistory_v2";

let allStations = [];
let currentPlayingCard = null;

// Carrega estações pedindo ao backend
async function loadStations() {
  try {
    const res = await fetch("/stations", {cache: "no-store"});
    const data = await res.json();
    // Filtrar entradas inválidas
    allStations = (Array.isArray(data) ? data : []).filter(st => st.stream && st.name);
    renderStations(allStations);
  } catch (err) {
    console.error("Erro ao carregar estações:", err);
    stationsContainer.innerHTML = "<p>Erro ao carregar rádios.</p>";
  }
}

function renderStations(list) {
  stationsContainer.innerHTML = "";
  if (!list.length) {
    stationsContainer.innerHTML = "<p>Nenhuma rádio encontrada.</p>";
    return;
  }
  list.forEach((st, idx) => {
    const card = document.createElement("div");
    card.className = "station";
    card.innerHTML = `
      <h3 class="station-name">${st.name}</h3>
      <div class="buttons">
        <button class="play" data-idx="${idx}" aria-label="Tocar">▶️</button>
        <button class="fav" data-idx="${idx}" aria-label="Favorito">⭐</button>
      </div>
    `;
    const playBtn = card.querySelector(".play");
    const favBtnCard = card.querySelector(".fav");

    playBtn.addEventListener("click", () => playStation(st, card));
    favBtnCard.addEventListener("click", () => toggleFavorite(st));

    stationsContainer.appendChild(card);
  });
}

function playStation(station, card) {
  // Define fonte e tenta tocar
  player.src = station.stream;
  player.play().catch(err => {
    // Alguns streams podem ser bloqueados ou não reproduzir no browser
    console.warn("Erro ao tentar tocar:", err);
  });

  // Mostra nome no player fixo
  currentStation.textContent = `🎶 Tocando: ${station.name}`;

  // Histórico
  saveHistory(station);

  // Destaque visual
  if (currentPlayingCard) currentPlayingCard.classList.remove("playing");
  card.classList.add("playing");
  currentPlayingCard = card;
}

function toggleFavorite(station) {
  let favs = JSON.parse(localStorage.getItem(FAV_KEY)) || [];
  if (favs.find(f => f.name === station.name)) {
    favs = favs.filter(f => f.name !== station.name);
  } else {
    favs.push(station);
  }
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

function saveHistory(station) {
  let hist = JSON.parse(localStorage.getItem(HIST_KEY)) || [];
  hist = hist.filter(h => h.name !== station.name);
  hist.unshift(station);
  if (hist.length > 20) hist.pop();
  localStorage.setItem(HIST_KEY, JSON.stringify(hist));
}

// Popup para Favoritos / Histórico
favBtn.onclick = () => openPopup("Favoritos", FAV_KEY);
histBtn.onclick = () => openPopup("Histórico", HIST_KEY);
allBtn.onclick = () => renderStations(allStations);
closePopup.onclick = () => popup.classList.add("hidden");

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
      div.innerHTML = `<h3>${st.name}</h3>`;
      div.onclick = () => {
        playStation(st, div);
        popup.classList.add("hidden");
      };
      popupList.appendChild(div);
    });
  }
  popup.classList.remove("hidden");
}

// Tema claro/escuro
themeBtn.onclick = () => {
  document.body.classList.toggle("light");
  // Guarda preferência simples se quiseres:
  // localStorage.setItem('theme_light', document.body.classList.contains('light'));
};

// Inicializa
loadStations();





