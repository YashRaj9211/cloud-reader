def response_wrapper(data, message, status_code=None, error=None):
    return {
        "data": data,
        "message": message,
        "status_code": status_code,
        "error": error
    }