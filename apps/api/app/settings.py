from pydantic_settings import BaseSettings, SettingsConfigDict
import secrets

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    DATABASE_URL: str
    REDIS_URL: str | None = None
    API_ADMIN_KEY: str | None = None  # Deprecated, will be removed

    PREVIEW_BASE_URL: str | None = None
    PREVIEW_BUCKET: str | None = None

    # JWT Settings
    JWT_SECRET: str = secrets.token_urlsafe(32)  # Will be overridden by env
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # SMTP Settings (for password reset)
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str = "FluidManager <noreply@fluidifia.com>"
    SMTP_USE_TLS: bool = True

    # Frontend URL (for password reset links)
    FRONTEND_URL: str = "https://manager.fluidifia.com"

settings = Settings()
