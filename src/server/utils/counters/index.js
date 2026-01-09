const model = require('./counters.model')
const service = module.exports

service.id = async (name) => {
    const data = await model.findOneAndUpdate({ name }, { $inc: { count: 1 } }, { upsert: true, new: true })
    return data.count
}