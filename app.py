import os

from flask import Flask, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

app = Flask(__name__, static_folder=None)


@app.route("/")
@app.route("/<path:path>")
def serve_static(path="index.html"):
    full_path = os.path.join(PUBLIC_DIR, path)
    if os.path.isfile(full_path):
        return send_from_directory(PUBLIC_DIR, path)
    return send_from_directory(PUBLIC_DIR, "index.html")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
