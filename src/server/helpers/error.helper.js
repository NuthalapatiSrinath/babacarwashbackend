class CustomError extends Error {
    constructor(message, code, statusCode) {
        super(message)
        this.code = code
        this.statusCode = statusCode || 500
    }
}

const ERROR_TYPES = {
    INVALID_AUTH: new CustomError('Invalid email or password', 'INVALID_AUTH', 401),
    AUTH_TOKEN_REQUIRED: new CustomError('Access token header required', 'AUTH_TOKEN_REQUIRED'),
    INVALID_AUTH_TOKEN: new CustomError('Invalid access token', 'INVALID_AUTH_TOKEN'),
    USER_ALREADY_REGISTERED: new CustomError('User already registered', 'USER_ALREADY_REGISTERED'),
    USER_NOT_FOUND: new CustomError('User not found', 'USER_NOT_FOUND', 404),
    USER_NOT_ROOT: new CustomError('Incorrect root email provided', 'USER_NOT_ROOT'),
    CHILD_NOT_FOUND: new CustomError('a child account specified was not found. please ensure that the email passed in child is a root account', 'CHILD_USER_NOT_FOUND'),
    ACCOUNT_USERS_EXISTS: new CustomError('delete child accounts first', 'ACCOUNT_USERS_EXISTS'),
    USER_SINGUP_INVITED: new CustomError('This email id has already been registered as a member of an existing account on Neo. Please check your inbox for the link to Join.', 'USER_SINGUP_INVITED'),
    USER_BLOCKED: new CustomError('Your account has been blocked, please contact us or write to us at support@peacebruh.com', 'USER_BLOCKED'),
    SAME_PASSWORD: new CustomError('Old password and new password cannot be same', 'SAME_PASSWORD'),
    RECORD_NOT_FOUND: new CustomError('Oops, The id is not found in our database', 'RECORD_NOT_FOUND', 404)
}

const errorHelper = (error) => {
    return ERROR_TYPES[error] ? ERROR_TYPES[error] : error
}

module.exports = errorHelper 