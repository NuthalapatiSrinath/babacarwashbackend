module.exports = (app) => {

    app.use('/api', require('./controllers'))
    app.use('/api/customer', require('./customer'))
    app.use('/api/staff', require('./staff'));

    app.route('/heartbeat').get(function (req, res) {
        res.status(200).json({
            statusCode: 200,
            message: 'Server is running successfully!'
        })
    })

}