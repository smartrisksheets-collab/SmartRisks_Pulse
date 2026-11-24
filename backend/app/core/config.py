import logging
from datetime import date
from pathlib import Path
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


MIN_SECRET_LENGTH = 32
_EXAMPLE_SECRETS: frozenset[str] = frozenset({
    "change_this_to_a_long_random_string_minimum_32_chars",
})


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    SUPABASE_ANON_KEY: str = ""

    # JWT
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # External APIs
    ANTHROPIC_API_KEY: str = ""
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = ""
    GOOGLE_CLIENT_ID: str = ""

    # App
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    FRONTEND_URL: str = "http://localhost:5173"
    ADMIN_FRONTEND_URL: str = "http://localhost:5174"

    # Admin JWT (separate secret from main app)
    ADMIN_JWT_SECRET: str
    ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    @model_validator(mode="after")
    def _strong_secrets(self) -> "Settings":
        """Refuse to start production with a short or example signing secret.

        Other environments only log a warning, so a staging box with an old
        short secret keeps running while it is replaced.
        """
        weak = [
            name for name in ("JWT_SECRET", "ADMIN_JWT_SECRET")
            if len(getattr(self, name)) < MIN_SECRET_LENGTH
            or getattr(self, name) in _EXAMPLE_SECRETS
            or (name == "ADMIN_JWT_SECRET" and self.ADMIN_JWT_SECRET == self.JWT_SECRET)
        ]
        if weak and self.APP_ENV == "production":
            raise ValueError(
                f"{', '.join(weak)} must be at least {MIN_SECRET_LENGTH} random characters, "
                "not the example value, and the two secrets must differ."
            )
        if weak and self.APP_ENV not in ("test", "development"):
            logging.getLogger(__name__).critical("Weak signing secret: %s", ", ".join(weak))
        return self

    @property
    def allowed_origins(self) -> list[str]:
        origins = [u.strip() for u in self.FRONTEND_URL.split(",") if u.strip()]
        origins += [u.strip() for u in self.ADMIN_FRONTEND_URL.split(",") if u.strip()]
        return origins

    # Billing
    TRIAL_DURATION_DAYS: int = 14
    PAID_DURATION_DAYS: int = 365
    EXPIRY_REMINDER_DAYS: int = 30
    TRIAL_CLEANUP_START_DATE: date | None = None
    TRIAL_CLEANUP_DRY_RUN: bool = True

    # Per-workspace limits
    MAX_RISKS: int = 1000
    MAX_USERS: int = 25
    RISK_WARNING_THRESHOLD: float = 0.80

    # Per-account workspace ownership limits
    MAX_WORKSPACES_TRIAL: int = 1
    MAX_WORKSPACES_PAID: int = 3

    # Activity feed
    ACTIVITY_FEED_CAP: int = 200

    # Recycle bin
    RECYCLE_BIN_TTL_DAYS: int = 30

    # Failed-attempt lockouts (workspace PIN per member, admin sign-in per admin)
    PIN_MAX_ATTEMPTS: int = 5
    PIN_LOCK_MINUTES: int = 15
    ADMIN_LOGIN_MAX_ATTEMPTS: int = 5
    ADMIN_LOCK_MINUTES: int = 15

    # Ask Pulse: weekly email of questions help could not answer. Empty disables it.
    HELP_REPORT_EMAIL: str = "info@smartrisksheets.com"
    HELP_REPORT_DAYS: int = 7

    # Heartbeat
    PRESENCE_WINDOW_SECONDS: int = 110

    # Trusted reverse proxy IPs for rate-limit key resolution.
    # Comma-separated plain string. e.g. TRUSTED_PROXY_IPS=10.0.0.0/8
    TRUSTED_PROXY_IPS: str = ""

    @property
    def trusted_proxy_list(self) -> list[str]:
        return [ip.strip() for ip in self.TRUSTED_PROXY_IPS.split(",") if ip.strip()]

    # Defaults
    DEFAULT_CURRENCY: str = "₦"
    DEFAULT_MODULES: list[str] = ["risk", "incident"]
    DEFAULT_ROLE: str = "Analyst"
    DEFAULT_PLAN: str = "TRIAL"

    # Modules
    MODULE_RISK: str = "risk"
    MODULE_INCIDENT: str = "incident"
    VALID_MODULES: list[str] = ["risk", "incident"]

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent.parent / ".env",
        env_file_encoding="utf-8",
    )


settings = Settings()  # type: ignore[call-arg]
