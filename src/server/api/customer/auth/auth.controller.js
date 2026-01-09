const service = require('./auth.service')
const controller = module.exports

controller.signup = async (req, res) => {
    try {
        const { body } = req
        const data = await service.signup(body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {

        if (error == "ALREADY-REGISTERED") {
            return res.status(401).json({ status: false, message: "The mobile is already regsitered. Please sign in." })
        }

        console.error(error)
        return res.status(401).json({ status: false, message: 'Internal server error', error })
    }
}

controller.signin = async (req, res) => {
    try {
        const { body } = req
        const data = await service.signin(body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {

        if (error == 'UNAUTHORIZED') {
            return res.status(401).json({ statusCode: 401, message: 'Invalid mobile or password' })
        }

        console.error(error)
        return res.status(401).json({ statusCode: 500, message: 'Internal server error', error })

    }
}

controller.forgotPassword = async (req, res) => {
    try {
        const { body } = req
        const data = await service.forgotPassword(body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)

        if (error == "INVALID") {
            return res.status(401).json({ status: false, message: "Email is not registerd. Please try again" })
        }

        return res.status(401).json({ status: false, message: 'Internal server error', error })
    }
}

controller.resetPassword = async (req, res) => {
    try {
        const { body } = req
        if (!body.token) {
            return res.status(400).json({ statusCode: 200, message: 'Token is required' })
        }
        const data = await service.resetPassword(body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)

        if (error == "INVALID") {
            return res.status(401).json({ status: false, message: "Invalid token or expired" })
        }

        return res.status(401).json({ status: false, message: 'Internal server error', error })
    }
}

controller.forgotPassword = async (req, res) => {
    try {
        const { body } = req
        const data = await service.forgotPassword(body)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)

        if (error == "INVALID") {
            return res.status(401).json({ status: false, message: "Email is not registerd. Please try again" })
        }

        return res.status(401).json({ status: false, message: 'Internal server error', error })
    }
}

controller.me = async (req, res) => {
    try {
        const { user } = req
        const data = await service.me(user)
        return res.status(200).json({ statusCode: 200, message: 'success', data })
    } catch (error) {
        console.error(error)
        if (typeof (error) == "string") {
            return res.status(401).json({ status: false, message: error })
        }
        return res.status(401).json({ status: false, message: 'Internal server error', error })
    }
}