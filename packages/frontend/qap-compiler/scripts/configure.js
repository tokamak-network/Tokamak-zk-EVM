module.exports.S_MAX = 256

const listPublic = new Map()
listPublic.set('bufferPubOut', 'outUser')
listPublic.set('bufferPubIn', 'inUser')
listPublic.set('bufferBlockIn', 'inBlock')
listPublic.set('bufferEVMIn', 'inFunction')

module.exports.LIST_PUBLIC = listPublic