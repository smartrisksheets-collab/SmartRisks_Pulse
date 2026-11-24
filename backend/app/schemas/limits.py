"""Shared size limits for request fields.

Pydantic rejects an oversized value with a clear 422 before any service code,
database write or PDF build runs.
"""

from typing import Annotated

from pydantic import Field

Tiny = Annotated[str, Field(max_length=64)]           # ids, codes, enum-like values
Short = Annotated[str, Field(max_length=200)]         # names, labels, single lines
Medium = Annotated[str, Field(max_length=1000)]       # URLs, short notes
Long = Annotated[str, Field(max_length=4000)]         # policy text, free text
Password = Annotated[str, Field(max_length=128)]
TokenText = Annotated[str, Field(max_length=4096)]    # JWTs and OAuth tokens
Recipients = Annotated[str, Field(max_length=2000)]   # comma separated email lists
Email = Annotated[str, Field(max_length=320)]

LookupItem = Annotated[str, Field(max_length=200)]
LookupList = Annotated[list[LookupItem], Field(max_length=500)]
