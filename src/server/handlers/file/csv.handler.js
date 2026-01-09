const fastCsv = require('fast-csv');
const fs = require('fs')

exports.read = function (path) {
    return fs.createReadStream(path).pipe(fastCsv.parse({ headers: true }))
}

exports.write = (writeData, outputPath) => new Promise(function (resolve, reject) {
    fastCsv.writeToPath(outputPath, writeData).on('error', (error) => {
        return reject(error)
    }).on('finish', () => {
        return resolve()
    })
})

exports.writeToBuffer = function (data, options) {
    return fastCsv.writeToBuffer(data, options)
}