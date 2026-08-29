from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    FRONTEND_URL: str = "http://localhost:5173"

    @property
    def allowed_origins(self) -> list[str]:
        return [u.strip() for u in self.FRONTEND_URL.split(",") if u.strip()]

    # Billing
    TRIAL_DURATION_DAYS: int = 14
    PAID_DURATION_DAYS: int = 365
    EXPIRY_REMINDER_DAYS: int = 30

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

    # Heartbeat
    PRESENCE_WINDOW_SECONDS: int = 110

    # Defaults
    DEFAULT_CURRENCY: str = "₦"
    DEFAULT_MODULES: list[str] = ["risk"]
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
