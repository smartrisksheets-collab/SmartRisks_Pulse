class QuotaExceededError(Exception): pass
class WorkspaceLimitError(Exception): pass
class PermissionDeniedError(Exception): pass
class ResourceNotFoundError(Exception): pass
class TrialExpiredError(Exception): pass
class PlanExpiredError(Exception): pass
class DuplicateResourceError(Exception): pass
class InvalidCredentialsError(Exception): pass
class InvalidTokenError(Exception): pass
class InvalidPINError(Exception): pass
class ValidationError(ValueError):
    """A user mistake, sent to the user as 422 with this message.

    Subclasses ValueError so existing `except ValueError` blocks keep catching
    it. A plain ValueError is no longer sent to the user: it is logged and
    answered with the generic 500 message.
    """
class ServerError(Exception): pass