// @flow

import { assert, expect } from 'chai'
import { describe, it } from 'mocha'

import { makeFakeIos } from '../../../src/index.js'
import {
  type ExchangePair,
  exchangeCache as reducer
} from '../../../src/modules/exchange/exchange-reducer.js'
import { getExchangeRate } from '../../../src/modules/exchange/exchange-selectors.js'
import { makeCoreRoot } from '../../../src/modules/root.js'
import {
  brokenExchangePlugin,
  fakeExchangePlugin
} from '../../fake-plugins/fake-exchange.js'

const contextOptions = {
  apiKey: '',
  appId: ''
}

// A hypothetical collection of currency pairs.
// The fiat currencies would start with `iso:` in a real exchange-rate cache.
function makePairs () {
  const now = Date.now() / 1000

  return [
    {
      fromCurrency: 'BTC',
      rate: 2500,
      source: 'simpleSource',
      toCurrency: 'USD',
      timestamp: now - 10
    },
    {
      fromCurrency: 'BTC',
      rate: 2600,
      source: 'complexSource',
      toCurrency: 'EUR',
      timestamp: now - 30
    },
    {
      fromCurrency: 'BTC',
      rate: 260000,
      source: 'complexSource',
      toCurrency: 'JPY',
      timestamp: now - 30
    },
    {
      fromCurrency: 'USD',
      rate: 1.1,
      source: 'complexSource',
      toCurrency: 'EUR',
      timestamp: now - 30
    },
    {
      fromCurrency: 'EUR',
      rate: 0.85,
      source: 'extraSource',
      toCurrency: 'USD',
      timestamp: now - 10
    }
  ]
}

// The expected uniqueness cache for the exchange rates:
const ids = {
  'simpleSource,BTC,USD': 0,
  'complexSource,BTC,EUR': 1,
  'complexSource,BTC,JPY': 2,
  'complexSource,USD,EUR': 3,
  'extraSource,EUR,USD': 4
}

// The expected currency lookup table for the exchange rates:
const routes = {
  BTC: { EUR: [1], USD: [0], JPY: [2] },
  EUR: { BTC: [1], USD: [3, 4] },
  USD: { BTC: [0], EUR: [3, 4] },
  JPY: { BTC: [2] }
}

function addPairs (pairs: Array<ExchangePair>) {
  return { type: 'EXCHANGE_PAIRS_FETCHED', payload: pairs }
}

describe('exchange cache reducer', function () {
  it('add currency pairs', function () {
    const pairs = makePairs()

    // Add the first currency pair:
    let state = reducer(void 0, addPairs(pairs.slice(0, 1)))
    assert.deepEqual(state.rates.pairs, pairs.slice(0, 1))

    // Add the rest:
    state = reducer(state, addPairs(pairs.slice(1)))
    assert.deepEqual(state.rates.pairs, pairs)
    assert.deepEqual(state.rates.ids, ids)
    assert.deepEqual(state.rates.routes, routes)
  })

  it('preserve ordering', function () {
    const pairs = makePairs()

    // Add a middle currency , with adjustments:
    const easyPairs = [{ ...pairs[1], rate: 2400 }]
    let state = reducer(void 0, addPairs(easyPairs))
    assert.deepEqual(state.rates.pairs, easyPairs)

    // Add everything:
    const expected = [...pairs]
    expected[0] = pairs[1]
    expected[1] = pairs[0]
    state = reducer(state, addPairs(pairs))
    assert.deepEqual(state.rates.pairs, expected)
  })

  it('find the shortest route', function () {
    const pairs = makePairs()
    const state: any = { exchangeCache: reducer(void 0, addPairs(pairs)) }
    const getPairCost = (source, age, inverse) => 1

    assert.equal(getExchangeRate(state, 'BTC', 'BTC', getPairCost), 1)
    assert.equal(getExchangeRate(state, 'BTC', 'USD', getPairCost), 2500)
    assert.equal(
      getExchangeRate(state, 'JPY', 'USD', getPairCost),
      (1 / 260000) * 2500 // 0.0096
    )
  })

  it('find a route using the preferred exchange', function () {
    const pairs = makePairs()
    const state: any = { exchangeCache: reducer(void 0, addPairs(pairs)) }
    const getPairCost = source => (source === 'complexSource' ? 1 : 10)

    assert.equal(
      getExchangeRate(state, 'JPY', 'USD', getPairCost),
      ((1 / 260000) * 2600) / 1.1 // 0.0091
    )
  })

  it('find the freshest route', function () {
    const pairs = makePairs()
    const state: any = { exchangeCache: reducer(void 0, addPairs(pairs)) }
    const getPairCost = (source, age) => age

    assert.equal(
      getExchangeRate(state, 'BTC', 'EUR', getPairCost),
      2500 / 0.85 // 2941
    )
  })

  it('missing routes return zero', function () {
    const pairs = makePairs()
    const state: any = { exchangeCache: reducer(void 0, addPairs(pairs)) }

    assert.equal(getExchangeRate(state, 'NONE', 'EUR', pair => 1), 0)
  })
})

describe('exchange pixie', function () {
  it('adds plugins', async function () {
    const coreRoot = makeCoreRoot(makeFakeIos(1)[0], {
      ...contextOptions,
      plugins: [fakeExchangePlugin]
    })

    // Wait for the plugins to appear:
    const output = await new Promise(resolve => {
      const unsubscribe = coreRoot.redux.subscribe(() => {
        if (coreRoot.output.exchange.plugins != null) {
          unsubscribe()
          resolve(coreRoot.output.exchange)
        }
      })
    })

    expect(output.plugins.length).equals(1)
    expect(output.plugins[0].exchangeInfo.exchangeName).equals('FakeExchange')
  })

  it('fetches exchange rates', async function () {
    let updateCalled = false
    const coreRoot = makeCoreRoot(makeFakeIos(1)[0], {
      ...contextOptions,
      callbacks: {
        onExchangeUpdate () {
          updateCalled = true
        }
      },
      plugins: [brokenExchangePlugin, fakeExchangePlugin]
    })

    await new Promise(resolve => {
      const unsubscribe = coreRoot.redux.subscribe(() => {
        const state = coreRoot.redux.getState()
        if (state.exchangeCache.rates.pairs.length > 0) {
          unsubscribe()
          resolve()
        }
      })
    })
    expect(updateCalled).equals(true)

    const state = coreRoot.redux.getState()
    const rate = getExchangeRate(state, 'BTC', 'iso:EUR', pair => 1)
    return assert(rate > 2274 && rate < 2277)
  })
})
