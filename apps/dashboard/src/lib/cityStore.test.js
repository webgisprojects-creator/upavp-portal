import { describe, expect, it } from 'vitest'
import { resolveInitialCity } from './cityStore.js'

const validCities = ['katra', 'majhola', 'lucknow']

describe('which city opens', () => {
  it('uses the city in the address first', () => {
    expect(resolveInitialCity({ search: '?city=lucknow', stored: 'katra', validCities })).toBe('lucknow')
  })

  it('falls back to the last city used in this browser (a refresh, or coming back from the login page)', () => {
    expect(resolveInitialCity({ search: '', stored: 'majhola', validCities })).toBe('majhola')
  })

  it('ignores a city that does not exist and uses the default', () => {
    expect(resolveInitialCity({ search: '?city=atlantis', stored: 'nowhere', validCities })).toBe('katra')
    expect(resolveInitialCity({ validCities })).toBe('katra')
  })

  it('prefers a valid stored city over an invalid address value', () => {
    expect(resolveInitialCity({ search: '?city=atlantis', stored: 'lucknow', validCities })).toBe('lucknow')
  })
})
