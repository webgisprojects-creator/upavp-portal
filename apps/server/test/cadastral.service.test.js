import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  getGataNumbers,
  getVillageSuggestions,
  searchCadastralFeatures,
} from '../src/services/cadastral.service.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('Planning cadastral searches use the published village and gata fields', async () => {
  const requests = []
  globalThis.fetch = async (input) => {
    requests.push(new URL(input))
    return new Response(
      JSON.stringify({
        features: [
          {
            properties: {
              vill_name: 'Uthrethiya',
              gata_no: '12',
              gata_no_: '12',
              gata_no_as: '12',
            },
          },
        ],
      }),
      { headers: { 'content-type': 'application/json' } },
    )
  }

  const layer = 'Planning:vrindavan_cadastral'
  assert.deepEqual(await getVillageSuggestions(layer, 'Uth'), ['Uthrethiya'])
  assert.deepEqual(await getVillageSuggestions(layer, ''), ['Uthrethiya'])
  assert.deepEqual(await getGataNumbers(layer, 'Uthrethiya'), ['12'])
  await searchCadastralFeatures(layer, 'Uthrethiya', '12')

  assert.equal(requests[0].searchParams.get('propertyName'), 'vill_name')
  assert.match(requests[0].searchParams.get('CQL_FILTER'), /^vill_name ILIKE /)
  assert.equal(requests[1].searchParams.get('propertyName'), 'vill_name')
  assert.equal(requests[1].searchParams.get('maxFeatures'), '100000')
  assert.equal(requests[1].searchParams.has('CQL_FILTER'), false)
  assert.equal(requests[2].searchParams.get('propertyName'), 'gata_no,gata_no_,gata_no_as')
  assert.match(requests[2].searchParams.get('CQL_FILTER'), /strTrim\(vill_name\)/)
  assert.equal(requests[3].searchParams.get('propertyName'), 'vill_name,gata_no,gata_no_,gata_no_as,geom')
  assert.match(requests[3].searchParams.get('CQL_FILTER'), /vill_name/)
})
