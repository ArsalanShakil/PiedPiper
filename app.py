from flask import Flask, render_template

from config import OUTPUT_DIR
from db import init_db


def create_app():
    app = Flask(__name__)

    # Ensure directories exist
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "General").mkdir(exist_ok=True)

    # Initialize database
    init_db()

    # Register blueprints
    from blueprints.tts import bp as tts_bp
    from blueprints.knowledge import bp as knowledge_bp
    app.register_blueprint(tts_bp)
    app.register_blueprint(knowledge_bp)

    # SPA entry point
    @app.route("/")
    def index():
        return render_template("index.html")

    # Serve partials for SPA router
    @app.route("/partials/<name>")
    def partial(name):
        return render_template(f"partials/{name}")

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5123)
