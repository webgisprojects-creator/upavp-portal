import { describe, expect, it, vi } from 'vitest'
import { createRetryingImageLoader } from './imageRetry.js'

const ORIGIN = 'https://portal.example'
const SRC = `${ORIGIN}/geoserver/wms?LAYERS=Planning:vrindavan_layout`

const imageResponse = () => ({ ok: true, status: 200, headers: { get: () => 'image/png' }, blob: async () => 'BLOB' })
const errorResponse = (status, type = 'text/html') => ({ ok: status < 400, status, headers: { get: () => type }, blob: async () => 'X' })

function setup(responses, overrides = {}) {
  const img = { src: '', addEventListener: vi.fn() }
  const image = { getImage: () => img }
  const queue = [...responses]
  const fetchImpl = vi.fn(async () => {
    const next = queue.shift()
    if (next instanceof Error) throw next
    return next
  })
  const wait = vi.fn(async () => {})
  const loader = createRetryingImageLoader({
    fetchImpl,
    wait,
    origin: ORIGIN,
    createObjectURL: () => 'blob:ok',
    revokeObjectURL: vi.fn(),
    ...overrides,
  })
  return { img, image, fetchImpl, wait, loader }
}

describe('retrying image loader', () => {
  it('loads the image on the first try without waiting', async () => {
    const { img, image, fetchImpl, wait, loader } = setup([imageResponse()])
    loader(image, SRC)
    await vi.waitFor(() => expect(img.src).toBe('blob:ok'))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })

  it('retries after two gateway timeouts and then succeeds (the 504s seen on 12 Nov)', async () => {
    const { img, image, fetchImpl, wait, loader } = setup([errorResponse(504), errorResponse(504), imageResponse()])
    loader(image, SRC)
    await vi.waitFor(() => expect(img.src).toBe('blob:ok'))
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(wait.mock.calls.map(([ms]) => ms)).toEqual([700, 1800])
  })

  it('retries a network error', async () => {
    const { img, image, fetchImpl, loader } = setup([new TypeError('Failed to fetch'), imageResponse()])
    loader(image, SRC)
    await vi.waitFor(() => expect(img.src).toBe('blob:ok'))
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('gives up after the retries and hands the original URL to OpenLayers (banner as before)', async () => {
    const { img, image, fetchImpl, loader } = setup([errorResponse(503), errorResponse(503), errorResponse(503)])
    loader(image, SRC)
    await vi.waitFor(() => expect(img.src).toBe(SRC))
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('does not retry a GeoServer XML error that answered 200 (missing layer / bad style)', async () => {
    const { img, image, fetchImpl, loader } = setup([{ ok: true, status: 200, headers: { get: () => 'application/vnd.ogc.se_xml' }, blob: async () => 'X' }])
    loader(image, SRC)
    await vi.waitFor(() => expect(img.src).toBe(SRC))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not retry a 404', async () => {
    const { img, image, fetchImpl, loader } = setup([errorResponse(404)])
    loader(image, SRC)
    await vi.waitFor(() => expect(img.src).toBe(SRC))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('leaves a cross-origin URL to the browser', () => {
    const { img, image, fetchImpl, loader } = setup([])
    loader(image, 'https://other.example/geoserver/wms?x=1')
    expect(img.src).toBe('https://other.example/geoserver/wms?x=1')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
