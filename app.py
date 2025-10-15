from flask import Flask, render_template, jsonify
import requests
from bs4 import BeautifulSoup
import json
import os
import tempfile
import logging

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)

RADIO_URL = "https://onlineradiobox.com/ao/"
ON_VERCEL = os.environ.get("VERCEL") == "1"

if ON_VERCEL:
    STATIONS_FILE = os.path.join(tempfile.gettempdir(), "stations.json")
else:
    STATIONS_FILE = os.path.join(os.path.dirname(__file__), "static", "stations.json")

def scrape_radios():
    """
    Faz scraping das rádios (nomes + stream) e escreve o JSON no STATIONS_FILE.
    Retorna a lista de estações.
    """
    logging.info("Iniciando scraping de rádios...")
    try:
        response = requests.get(RADIO_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
        response.raise_for_status()
    except Exception as e:
        logging.exception("Erro ao buscar a página de rádios: %s", e)
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    stations = []

    # Percorre os elementos que normalmente têm info
    for btn in soup.select(".station_play"):
        name = btn.get("radioname")
        stream = btn.get("stream")
        # Apenas grava nome e stream — sem imagens (como pedido)
        if name and stream:
            stations.append({
                "name": name.strip(),
                "stream": stream.strip()
            })

    # Garante pasta e grava o ficheiro
    try:
        os.makedirs(os.path.dirname(STATIONS_FILE), exist_ok=True)
        with open(STATIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(stations, f, ensure_ascii=False, indent=2)
        logging.info("stations.json gravado em: %s", STATIONS_FILE)
    except Exception as e:
        logging.exception("Erro ao gravar stations.json: %s", e)

    return stations

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/stations")
def get_stations():
    """
    Endpoint que devolve a lista de estações.
    - Tenta ler STATIONS_FILE primeiro.
    - Se não existir ou ocorrer erro, faz o scraping e grava.
    """
    if os.path.exists(STATIONS_FILE):
        try:
            with open(STATIONS_FILE, "r", encoding="utf-8") as f:
                stations = json.load(f)
                # Filtra entradas sem stream/nome por segurança
                stations = [s for s in stations if s.get("name") and s.get("stream")]
                return jsonify(stations)
        except Exception:
            logging.exception("Falha ao ler stations.json — fará scraping.")
            # continua para scraping

    # Se não havia ficheiro ou deu erro, faz scraping
    stations = scrape_radios()
    return jsonify(stations)

if __name__ == "__main__":
    # Para desenvolvimento
    app.run(host="0.0.0.0", port=5000, debug=True)


