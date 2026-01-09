const dotenv = require('dotenv')
const { parsed } = dotenv.config()

const config = {
    env: parsed.ENV,
    port: Number(parsed.PORT),
    database: {
        mongo: {
            uri: parsed.MONGO_URI,
            debug: false,
            options: {
                authSource: "admin",
                useNewUrlParser: true,
                useUnifiedTopology: true,
                useCreateIndex: true,
                useFindAndModify: false
            }
        }
    },
    keys: {
        secret: parsed.SECRET_KEY
    },
    AWS: {
        id: parsed.AWS_ACCESS_KEY_ID,
        key: parsed.AWS_SECRET_KET,
        bucket: "bcw"
    },
    smtp: {
        host: parsed.SMTP_HOST,
        username: parsed.SMTP_USERNAME,
        password: parsed.SMTP_PASSWORD,
        email: parsed.SMTP_USERNAME
    },

}

module.exports = config