from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    DATABASE_URL: str
    REDIS_URL: str | None = None
    API_ADMIN_KEY: str | None = None

    PREVIEW_BASE_URL: str | None = None
    PREVIEW_BUCKET: str | None = None

settings = Settings()
