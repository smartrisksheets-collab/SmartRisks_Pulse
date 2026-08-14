from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    event_key: str
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = None