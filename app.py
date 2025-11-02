# -*- coding: utf-8 -*-
import os, json, tempfile, subprocess, base64, logging, requests
from flask import Flask, render_template, jsonify, request
from bs4 import BeautifulSoup
from urllib.parse import urlencode

# ──────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
app = Flask(__name__)

# Configurações principais
RADIO_URL = "https://onlineradiobox.com/ao/"
TMP_DIR = tempfile.gettempdir()  # /tmp no Vercel
FFMPEG_BIN = "ffmpeg"
LASTFM_API_KEY = os.getenv("LASTFM_API_KEY", "")
BROWSERLESS_KEY = os.getenv("BROWSERLESS_KEY")  # token de https://www.browserless.io/

# ──────────────────────────────────────────────────────────────
def normalize_img(img):
    if not img:
        return None
    img = img.strip()
    if img.startswith("//"): return "https:" + img
    if img.startswith("http://"): return img.replace("http://", "https://")
    return img


# 🔹 Scraping das rádios angolanas
def scrape_radios():
    stations = []
    try:
        r = requests.get(RADIO_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        for btn in soup.select("button.b-play.station_play, button.station_play"):
            name = btn.get("radioname") or btn.get("radioName")
            stream = btn.get("stream")
            img = btn.get("radioimg") or btn.get("radioImg")
            if name and stream:
                stations.append({
                    "name": name.strip(),
                    "stream": stream.strip(),
                    "img": normalize_img(img)
                })
        logging.info(f"Encontradas {len(stations)} rádios.")
    except Exception as e:
        logging.exception("Erro no scraping: %s", e)
    return stations


# 🔹 Gravação temporária do stream
def record_stream(stream_url, seconds=10):
    out = os.path.join(TMP_DIR, "sample.mp3")
    cmd = [
        FFMPEG_BIN, "-y", "-i", stream_url, "-t", str(seconds),
        "-acodec", "libmp3lame", "-ar", "44100", "-ac", "2",
        out, "-loglevel", "error"
    ]
    try:
        subprocess.run(cmd, check=True, timeout=seconds + 10)
        return out
    except Exception as e:
        logging.error("ffmpeg erro: %s", e)
        return None


# 🔹 Reconhecimento via Browserless (ShazamIO Node)
def recognize_browserless(file_path):
    """Usa Browserless (Playwright) para correr JS que identifica a música."""
    if not BROWSERLESS_KEY:
        return None
    try:
        with open(file_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")

        payload = {
            "code": f"""
                const fs = require('fs');
                const b64 = `{b64}`;
                const buf = Buffer.from(b64, 'base64');
                fs.writeFileSync('/tmp/sample.mp3', buf);
                const {{ Shazam }} = await import('shazamio');
                const shazam = new Shazam();
                const out = await shazam.recognizeSong('/tmp/sample.mp3');
                return out;
            """
        }

        url = f"https://chrome.browserless.io/playwright?token={BROWSERLESS_KEY}"
        r = requests.post(url, json=payload, timeout=90)
        if r.ok:
            j = r.json()
            track = j.get("track", {})
            if track:
                return {"artist": track.get("subtitle"), "title": track.get("title")}
        else:
            logging.error("Browserless status %s: %s", r.status_code, r.text)
    except Exception as e:
        logging.error("Erro Browserless: %s", e)
    return None


# 🔹 iTunes cover
def itunes_cover(artist, title):
    try:
        q = f"{artist} {title}".strip()
        url = "https://itunes.apple.com/search?" + urlencode({"term": q, "limit": 1, "media": "music"})
        r = requests.get(url, timeout=10)
        if r.ok:
            j = r.json()
            if j.get("resultCount"):
                art = j["results"][0].get("artworkUrl100")
                return art.replace("100x100", "600x600") if art else None
    except Exception:
        pass
    return None


# 🔹 Letras
def get_lyrics(artist, title):
    try:
        url = f"https://api.lyrics.ovh/v1/{artist}/{title}"
        r = requests.get(url, timeout=10)
        if r.ok:
            return r.json().get("lyrics")
    except Exception:
        pass
    return None


# 🔹 Biografia
def get_bio(artist):
    if not LASTFM_API_KEY:
        return None
    try:
        params = {
            "method": "artist.getinfo",
            "artist": artist,
            "api_key": LASTFM_API_KEY,
            "format": "json"
        }
        r = requests.get("https://ws.audioscrobbler.com/2.0/", params=params, timeout=10)
        j = r.json()
        return j.get("artist", {}).get("bio", {}).get("summary")
    except Exception:
        return None


# 🔹 Top 10 músicas
def get_top(artist):
    if not LASTFM_API_KEY:
        return []
    try:
        params = {
            "method": "artist.gettoptracks",
            "artist": artist,
            "api_key": LASTFM_API_KEY,
            "format": "json",
            "limit": 10
        }
        r = requests.get("https://ws.audioscrobbler.com/2.0/", params=params, timeout=10)
        j = r.json()
        tracks = j.get("toptracks", {}).get("track", [])
        return [{"name": t.get("name"), "url": t.get("url")} for t in tracks]
    except Exception:
        return []


# ──────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/stations")
def stations():
    return jsonify(scrape_radios())


@app.route("/analyze", methods=["POST"])
def analyze():
    """Grava o stream temporariamente e usa Browserless para identificar."""
    data = request.get_json(force=True)
    stream = data.get("stream")
    station_name = data.get("station_name", "")
    if not stream:
        return jsonify({"error": "stream required"}), 400

    path = record_stream(stream)
    if not path:
        return jsonify({"error": "ffmpeg failed"}), 500

    info = recognize_browserless(path) or {}
    artist = info.get("artist")
    title = info.get("title")

    # extras
    cover = itunes_cover(artist, title) if artist and title else None
    lyrics = get_lyrics(artist, title) if artist and title else None
    bio = get_bio(artist) if artist else None
    top = get_top(artist) if artist else []

    # limpeza
    try:
        os.remove(path)
    except Exception:
        pass

    return jsonify({
        "station": station_name,
        "artist": artist,
        "title": title,
        "cover": cover,
        "lyrics": lyrics,
        "bio": bio,
        "top": top
    })


# ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True, port=5000)
