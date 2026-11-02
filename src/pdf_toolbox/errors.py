class ToolboxError(Exception):
    """Base error with a message suitable for the user interface."""


class DependencyError(ToolboxError):
    pass


class OperationError(ToolboxError):
    pass


class ValidationError(ToolboxError):
    pass


class CancelledError(ToolboxError):
    pass
