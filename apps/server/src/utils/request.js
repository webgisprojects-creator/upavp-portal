import { createError } from './error.js'

export function requiredQuery(req, key) {
  const value = req.query[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw createError(`Query parameter "${key}" is required.`, 400)
  }
  return value.trim()
}
