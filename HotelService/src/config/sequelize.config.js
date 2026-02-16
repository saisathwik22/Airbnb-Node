
// this line will tell nodejs to dynamically compile and run TS file on the go.
require('ts-node/register')

const config = require('./db.config')
module.exports = config;