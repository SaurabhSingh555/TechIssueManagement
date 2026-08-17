"""Application configuration — all values come from environment variables."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""  # BACKEND ONLY — never expose to the frontend

    # Postgres (Supabase session pooler recommended)
    database_url: str = ""

    # SMTP for notification emails
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@yourcompany.com"

    # Frontend / CORS
    frontend_url: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173"

    # AI issue similarity (embeddings). Leave blank to use the built-in local
    # embedding engine (no external service needed). API keys NEVER reach the frontend.
    embedding_api_url: str = ""          # e.g. https://api.openai.com/v1 (OpenAI-compatible)
    embedding_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 256      # must match the pgvector column in migration_ai_similarity.sql
    similarity_high_threshold: float = 0.90     # "Very Similar Issue"
    similarity_medium_threshold: float = 0.75   # "Potentially Similar Issue"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_username and self.smtp_password)


settings = Settings()
