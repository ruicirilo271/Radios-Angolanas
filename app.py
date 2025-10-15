from flask import Flask, render_template, jsonify
import requests
from bs4 import BeautifulSoup
import json
import os

app = Flask(__name__)
STATIONS_FILE = os.path.join("static", "stations.json")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/stations")
def scrape_stations():
    url = "https://onlineradiobox.com/ao/"
    response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
    soup = BeautifulSoup(response.text, "html.parser")

    stations = []
    for btn in soup.select(".station_play"):
        name = btn.get("radioname")
        stream = btn.get("stream")
        if name and stream:
            stations.append({
                "name": name.strip(),
                "stream": stream.strip()
            })

    os.makedirs("static", exist_ok=True)
    with open(STATIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(stations, f, ensure_ascii=False, indent=2)

    return jsonify(stations)

if __name__ == "__main__":
    app.run(debug=True)


