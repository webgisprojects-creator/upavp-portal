// Remember the selected city across a page refresh (and let a link open straight at a city).
// Order of preference: ?city=lucknow in the address  >  the last city used in this browser  >  the default.
const STORAGE_KEY = 'upavp.dashboard.city'
const DEFAULT_CITY = 'katra'

/** Pure part (unit-tested): pick the city from what the address and the browser storage say. */
export function resolveInitialCity({ search = '', stored = null, validCities, fallback = DEFAULT_CITY }) {
  const fromAddress = new URLSearchParams(search).get('city')
  if (fromAddress && validCities.includes(fromAddress)) return fromAddress
  if (stored && validCities.includes(stored)) return stored
  return fallback
}

export function readInitialCity(validCities) {
  let stored = null
  try {
    stored = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // storage can be blocked (private window, strict settings): the address still works
  }
  return resolveInitialCity({ search: window.location.search, stored, validCities })
}

/** Keep the address (?city=...) and the browser storage in step with the selection, without adding history entries. */
export function rememberCity(city) {
  try {
    window.localStorage.setItem(STORAGE_KEY, city)
  } catch {
    // see above
  }
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('city', city)
    window.history.replaceState(window.history.state, '', url)
  } catch {
    // not fatal: the selection just will not be in the address
  }
}
