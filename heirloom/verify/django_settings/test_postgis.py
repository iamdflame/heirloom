"""Django test settings for GIS CVEs: the local PostGIS container (docker heirloom-pg).

Read by the Django test venv, not by heirloom. The password comes from the
environment (the runner reads it from `docker inspect` per run; it is never
written to disk), and the database name is per run so concurrent runs never
share a test database.
"""

import os

_name = os.environ.get("HEIRLOOM_PG_NAME", "django")
_db = {
    "ENGINE": "django.contrib.gis.db.backends.postgis",
    "HOST": "127.0.0.1",
    "PORT": 5432,
    "USER": "postgres",
    "PASSWORD": os.environ["PGPASSWORD"],
}
DATABASES = {"default": {**_db, "NAME": _name}, "other": {**_db, "NAME": f"{_name}_other"}}
SECRET_KEY = "django_tests_secret_key"
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
DEFAULT_AUTO_FIELD = "django.db.models.AutoField"
USE_TZ = False
