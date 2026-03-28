from flask import Flask, render_template

from config import OUTPUT_DIR
from db import init_db


def create_app():
    app = Flask(__name__)

    # Disable static file caching in development
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

    # Ensure directories exist
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "General").mkdir(exist_ok=True)

    # Initialize database
    init_db()

    # Register blueprints
    from blueprints.tts import bp as tts_bp
    from blueprints.knowledge import bp as knowledge_bp
    from blueprints.editor import bp as editor_bp
    from blueprints.vocabulary import bp as vocabulary_bp
    from blueprints.yki import bp as yki_bp
    from blueprints.speaking import bp as speaking_bp
    from blueprints.reading import bp as reading_bp
    from blueprints.listening import bp as listening_bp
    from blueprints.writing import bp as writing_bp
    app.register_blueprint(tts_bp)
    app.register_blueprint(knowledge_bp)
    app.register_blueprint(editor_bp)
    app.register_blueprint(vocabulary_bp)
    app.register_blueprint(yki_bp)
    app.register_blueprint(speaking_bp)
    app.register_blueprint(reading_bp)
    app.register_blueprint(listening_bp)
    app.register_blueprint(writing_bp)

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
