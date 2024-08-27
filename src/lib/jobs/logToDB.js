const { mongoDB } = require('../../../config')
const { logger } = require('@vtfk/logger')
const { getMongoClient } = require('../mongoClient')

const logToDB = async (type = 'info', data, request, context, requestor) => {
  if (!data) {
    logger('error', ['logToDB', 'Missing required parameter: data'])
    throw new Error('Missing required parameter: data')
  }
  if (Array.isArray(data)) data = data[0]
  try {
    // Get the information.
    const sessionId = context?.invocationId || 'unknown'
    const endpoint = context?.functionName || 'unknown'
    const method = request?.method || 'unknown'
    const origin = request?.headers?.get('origin') || 'unknown'
    const url = request?.url || request?.originalUrl || context?.request?.url || context?.request?.originalUrl || 'unknown'
    let startTimeStamp = context?.bindingData?.sys?.utcNow
    const endTimeStamp = new Date()
    let duration = 0
    if (startTimeStamp) {
      startTimeStamp = Date.parse(startTimeStamp)
      if (startTimeStamp) duration = endTimeStamp - new Date(startTimeStamp)
    }
    // Connect to the database
    const mongoClient = await getMongoClient()
    // Create the entry
    const logEntry = {
      type,
      message: data?.message || '',
      sessionId,
      origin,
      method,
      endpoint,
      url,
      request,
      requestor: { ...requestor },
      duration,
      data,
      startTimeStamp,
      endTimeStamp
    }
    // console.log(logEntry)
    // Save the entry
    await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.LOG_COLLECTION).insertOne(logEntry)
  } catch (error) {
    // Logger her
    logger('error', ['logToDB', 'An error occured while trying to log to the database', error?.message || error])
    throw new Error('An error occured while trying to log to the database')
  }
}

module.exports = {
  logToDB
}
