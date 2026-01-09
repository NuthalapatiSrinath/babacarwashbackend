const OneWashPaymentsModel = require('../../models/onewash-payments.model')
const TransactionsModel = require('../../models/transactions.model')
const CounterService = require('../../../utils/counters')
const CommonHelper = require('../../../helpers/common.helper')
const service = module.exports

service.list = async (userInfo, query) => {
    const paginationData = CommonHelper.paginationData(query)
    const findQuery = { worker: userInfo._id, status: 'pending', isDeleted: false }
    const counts = {
        pending: await OneWashPaymentsModel.countDocuments({ ...findQuery, status: 'pending' }),
        completed: await OneWashPaymentsModel.countDocuments({ ...findQuery, status: 'completed', settled: 'pending' }),
    }
    const completedAmount = await OneWashPaymentsModel.find({ ...findQuery, status: 'completed', settled: 'pending' }, { amount_paid: 1 }).lean()
    const total = await OneWashPaymentsModel.countDocuments(findQuery)
    const data = await OneWashPaymentsModel.find(findQuery)
        .sort({ _id: -1 })
        .skip(paginationData.skip)
        .limit(paginationData.limit)
        .populate([
            { path: 'mall', model: 'malls' },
            { path: 'building', model: 'buildings' },
        ])
        .lean()

    return { total, data: data.map(e => { e.onewash = true; return e }), counts: { ...counts, completedAmount: completedAmount.reduce((p, c) => p + c.amount_paid, 0) } }

}

service.info = async (userInfo, id) => {
    return OneWashPaymentsModel.findOne({ _id: id, isDeleted: false }).lean()
}

service.create = async (userInfo, payload) => {
    const id = await CounterService.id("customers")
    const data = { createdBy: userInfo._id, updatedBy: userInfo._id, id, ...payload }
    await new OneWashPaymentsModel(data).save()
}

service.update = async (userInfo, id, payload) => {
    await OneWashPaymentsModel.updateOne({ _id: id }, { $set: payload })
}

service.delete = async (userInfo, id, payload) => {
    return await OneWashPaymentsModel.updateOne({ _id: id }, { isDeleted: true, deletedBy: userInfo._id })
}

service.undoDelete = async (userInfo, id) => {
    return await OneWashPaymentsModel.updateOne({ _id: id }, { isDeleted: false, updatedBy: userInfo._id })
}

service.collectPayment = async (userInfo, id, payload) => {
    const paymentData = await OneWashPaymentsModel.findOne({ _id: id }).lean()
    const pendingAmount = paymentData.amount_charged - paymentData.amount_paid
    if (Number(payload.amount) > pendingAmount) {
        throw "EXCESS-AMOUNT"
    }
    await OneWashPaymentsModel.updateOne({ _id: id }, {
        $inc: { amount_paid: Number(payload.amount) },
        $set: { status: (pendingAmount - Number(payload.amount)) == 0 ? 'completed' : 'pending' }
    })
    await new TransactionsModel({ payment: id, amount: Number(payload.amount), createdBy: userInfo._id, updatedBy: userInfo._id }).save()
}

service.settlePayment = async (userInfo) => {
    await OneWashPaymentsModel.updateMany({ worker: userInfo._id, status: 'completed' }, { $set: { settled: 'completed' } })
}
