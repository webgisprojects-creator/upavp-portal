export function errorHandler(error, _req, res, _next) {
  console.error('Search API error:', error.code || error.name, error.message)
  const status = error.status || (error.code === 'ECONNREFUSED' ? 503 : 500)
  res.status(status).json({
    error: error.status ? error.message : 'Database request failed. Check the backend logs.',
  })
}
