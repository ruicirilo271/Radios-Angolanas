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

async function loadStations() {
  const res = await fetch("/static/stations.json");
  const data = await res.json();
  allStations = data.filter(st => st.stream && st.name);
  renderStations(allStations);
}

function renderStations(list) {
  stationsContainer.innerHTML = "";
  list.forEach(st => {
    const card = document.createElement("div");
    card.className = "station";
    card.innerHTML = `
      <h3>${st.name}</h3>
      <div class="buttons">
        <button class="play">▶️</button>
        <button class="fav">⭐</button>
      </div>
    `;
    const playBtn = card.querySelector(".play");
    const favBtnCard = card.querySelector(".fav");

    playBtn.onclick = () => playStation(st, card);
    favBtnCard.onclick = () => toggleFavorite(st);

    stationsContainer.appendChild(card);
  });
}

function playStation(station, card) {
  player.src = station.stream;
  player.play();
  currentStation.innerHTML = `🎶 Tocando: ${station.name}`;
  saveHistory(station);

  if(currentPlayingCard) currentPlayingCard.classList.remove("playing");
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

favBtn.onclick = () => openPopup("Favoritos", FAV_KEY);
histBtn.onclick = () => openPopup("Histórico", HIST_KEY);
allBtn.onclick = () => renderStations(allStations);
closePopup.onclick = () => popup.classList.add("hidden");

function openPopup(title, key) {
  popupTitle.textContent = title;
  popupList.innerHTML = "";
  const items = JSON.parse(localStorage.getItem(key)) || [];
  items.forEach(st => {
    const div = document.createElement("div");
    div.className = "station small";
    div.innerHTML = `<h3>${st.name}</h3>`;
    div.onclick = () => playStation(st, div);
    popupList.appendChild(div);
  });
  popup.classList.remove("hidden");
}

themeBtn.onclick = () => {
  document.body.classList.toggle("light");
};

loadStations();






