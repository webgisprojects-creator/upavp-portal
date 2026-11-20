// Map images come from GeoServer through nginx. One dropped or timed-out request used to switch the layer to the red
// "failed to load" banner at once. This loader fetches the image itself and retries transient failures (network error,
// HTTP 5xx, 408, 429) a couple of times before OpenLayers is allowed to report the failure.
//
// Not retried: a 4xx answer or a 200 that is not an image (GeoServer's XML "ServiceException", e.g. a missing layer or a style
// that names a column that no longer exists). Those do not fix themselves; they fall through to OpenLayers and show the banner.
export const RETRY_DELAYS_MS = [700, 1800]

const defaultWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function isTransient(status) {
  return status >= 500 || status === 408 || status === 429
}

export function createRetryingImageLoader({
  fetchImpl = (...args) => globalThis.fetch?.(...args),
  delays = RETRY_DELAYS_MS,
  wait = defaultWait,
  origin = globalThis.location?.origin,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
} = {}) {
  // Same signature as ol/source/ImageWMS `imageLoadFunction`: (imageWrapper, src)
  return function imageLoadFunction(image, src) {
    const img = image.getImage()

    let sameOrigin = false
    try {
      sameOrigin = Boolean(origin) && new URL(src, origin).origin === origin
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin) {
      img.src = src // cross-origin URL: plain loading, no CORS surprises
      return
    }

    ;(async () => {
      for (let attempt = 0; attempt <= delays.length; attempt += 1) {
        let transient = true
        try {
          const response = await fetchImpl(src)
          const type = response.headers?.get('Content-Type') ?? ''
          if (response.ok && type.startsWith('image/')) {
            const url = createObjectURL(await response.blob())
            const release = () => revokeObjectURL(url)
            img.addEventListener('load', release, { once: true })
            img.addEventListener('error', release, { once: true })
            img.src = url
            return
          }
          transient = isTransient(response.status)
        } catch {
          transient = true // network error: worth another try
        }
        if (!transient || attempt === delays.length) break
        await wait(delays[attempt])
      }
      // Retries used up (or not retryable): let OpenLayers load the original URL so it reports the failure exactly as before.
      img.src = src
    })()
  }
}

export const retryingImageLoader = createRetryingImageLoader()
