"""Where the project's data lives: the project folder, one level above this backend/ folder.

The code sits in backend/, but the models, the History database and the files you can edit stay at the top of the
project, beside frontend/, so moving the code never moves your data.
"""

from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_DIR / "models"
FRONTEND_DIST = PROJECT_DIR / "frontend" / "dist"
