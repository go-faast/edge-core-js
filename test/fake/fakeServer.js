import url from 'url'

import * as packages from './packages.js'

function makeReply (results) {
  const reply = {
    'status_code': 0,
    'results': results
  }
  return JSON.stringify(reply)
}

const authLevel = {
  none: 'none',
  recovery2Id: 'recovery2Id',
  full: 'full'
}

export function FakeServer () {
  this.db = {}
  this.repos = {}
}

FakeServer.prototype.populateRepos = function () {
  this.repos = packages.repos
}

FakeServer.prototype.populate = function () {
  this.populateRepos()
  this.db.userId = packages.users['js test 0']
  this.db.passwordAuth = packages.passwordAuth
  this.db.passwordAuthBox = packages.passwordAuthBox
  this.db.passwordBox = packages.passwordBox
  this.db.passwordKeySnrp = packages.passwordKeySnrp
  this.db.pin2Id = packages.pin2Id
  this.db.pin2Auth = packages.pin2Auth
  this.db.pin2Box = packages.pin2Box
  this.db.pin2KeyBox = packages.pin2KeyBox
  this.db.recovery2Id = packages.recovery2Id
  this.db.recovery2Auth = packages.recovery2Auth
  this.db.recovery2Box = packages.recovery2Box
  this.db.recovery2KeyBox = packages.recovery2KeyBox
  this.db.question2Box = packages.question2Box
  this.db.syncKeyBox = packages.syncKeyBox
  this.db.rootKeyBox = packages.rootKeyBox
  this.db.pinKeyBox = packages.pinKeyBox
}

FakeServer.prototype.authCheck = function (body) {
  // Password login:
  if (this.db.userId && this.db.userId === body['userId'] &&
      this.db.passwordAuth && this.db.passwordAuth === body['passwordAuth']) {
    return authLevel.full
  }

  // PIN2 login:
  if (this.db.pin2Id && this.db.pin2Id === body['pin2Id'] &&
      this.db.pin2Auth && this.db.pin2Auth === body['pin2Auth']) {
    return authLevel.full
  }

  // Recovery2 login:
  if (this.db.recovery2Id && this.db.recovery2Id === body['recovery2Id']) {
    // Check answers:
    const recovery2Auth = body['recovery2Auth']
    if (recovery2Auth instanceof Array &&
        recovery2Auth.length === this.db.recovery2Auth.length) {
      for (let i = 0; i < recovery2Auth.length; ++i) {
        if (recovery2Auth[i] !== this.db.recovery2Auth[i]) {
          return authLevel.recovery2Id
        }
      }
      return authLevel.full
    }
    return authLevel.recovery2Id
  }

  return authLevel.none
}

FakeServer.prototype.request = function (method, uri, body, callback) {
  const path = url.parse(uri).pathname
  const results = {}

  // Account lifetime v1: ----------------------------------------------------

  if (path === '/api/v1/account/available') {
    if (this.db.userId && this.db.userId === body['l1']) {
      return callback(null, 500, '{"status_code":3}')
    }
    return callback(null, 200, makeReply(results))
  }

  if (path === '/api/v1/account/create') {
    const carePackage = JSON.parse(body['care_package'])
    this.db.passwordKeySnrp = carePackage['SNRP2']

    const loginPackage = JSON.parse(body['login_package'])
    this.db.passwordAuthBox = loginPackage['ELP1']
    this.db.passwordBox = loginPackage['EMK_LP2']
    this.db.syncKeyBox = loginPackage['ESyncKey']
    this.repos[body['repo_account_key']] = {}

    return callback(null, 200, makeReply(results))
  }

  if (path === '/api/v1/account/upgrade') {
    this.db.rootKeyBox = body['rootKeyBox']
    return callback(null, 200, makeReply(results))
  }

  if (path === '/api/v1/account/activate') {
    return callback(null, 200, makeReply(results))
  }

  // Login v1: ---------------------------------------------------------------

  if (path === '/api/v1/account/carepackage/get') {
    if (!this.db.userId || this.db.userId !== body['l1']) {
      return callback(null, 500, '{"status_code":3}')
    }

    results['care_package'] = JSON.stringify({
      'SNRP2': this.db.passwordKeySnrp
    })
    return callback(null, 200, makeReply(results))
  }

  if (path === '/api/v1/account/loginpackage/get') {
    body['userId'] = body['l1']
    body['passwordAuth'] = body['lp1']
    if (!this.authCheck(body)) {
      return callback(null, 500, '{"status_code":3}')
    }

    results['login_package'] = JSON.stringify({
      'ELP1': this.db.passwordAuthBox,
      'EMK_LP2': this.db.passwordBox,
      'ESyncKey': this.db.syncKeyBox
    })
    if (this.db.rootKeyBox) {
      results['rootKeyBox'] = this.db.rootKeyBox
    }
    return callback(null, 200, makeReply(results))
  }

  // PIN login v1: -----------------------------------------------------------

  if (path === '/api/v1/account/pinpackage/update') {
    this.db.pinKeyBox = JSON.parse(body['pin_package'])
    return callback(null, 200, makeReply({}))
  }

  if (path === '/api/v1/account/pinpackage/get') {
    if (!this.db.pinKeyBox) {
      return callback(null, 500, '{"status_code":3}')
    }

    results['pin_package'] = JSON.stringify(this.db.pinKeyBox)
    return callback(null, 200, makeReply(results))
  }

  // Repo server v1: ---------------------------------------------------------

  if (path === '/api/v1/wallet/create') {
    this.repos[body['repo_wallet_key']] = {}
    return callback(null, 200, makeReply({}))
  }

  if (path === '/api/v1/wallet/activate') {
    return callback(null, 200, makeReply({}))
  }

  // login v2: ---------------------------------------------------------------

  if (path === '/api/v2/login') {
    switch (this.authCheck(body)) {
      default:
        return callback(null, 500, '{"status_code":3}')

      case authLevel.recovery2Id:
        results['question2Box'] = this.db.question2Box
        return callback(null, 200, makeReply(results))

      case authLevel.full:
        const keys = [
          'passwordAuthBox',
          'passwordBox',
          'passwordKeySnrp',
          'pin2Box',
          'pin2KeyBox',
          'recovery2Box',
          'recovery2KeyBox',
          'rootKeyBox',
          'syncKeyBox',
          'repos'
        ]
        for (let i = 0; i < keys.length; ++i) {
          if (this.db[keys[i]]) {
            results[keys[i]] = this.db[keys[i]]
          }
        }
        return callback(null, 200, makeReply(results))
    }
  }

  if (path === '/api/v2/login/password') {
    if (!this.authCheck(body)) {
      return callback(null, 500, '{"status_code":3}')
    }

    switch (method) {
      case 'PUT':
        const data = body['data']
        if (!data['passwordAuth'] || !data['passwordKeySnrp'] ||
            !data['passwordBox'] || !data['passwordAuthBox']) {
          return callback(null, 500, '{"status_code":3}')
        }

        this.db.passwordAuth = data['passwordAuth']
        this.db.passwordKeySnrp = data['passwordKeySnrp']
        this.db.passwordBox = data['passwordBox']
        this.db.passwordAuthBox = data['passwordAuthBox']

        return callback(null, 200, makeReply(results))
    }
  }

  if (path === '/api/v2/login/pin2') {
    if (!this.authCheck(body)) {
      return callback(null, 500, '{"status_code":3}')
    }

    switch (method) {
      case 'PUT':
        const data = body['data']
        if (!data['pin2Id'] || !data['pin2Auth'] ||
            !data['pin2Box'] || !data['pin2KeyBox']) {
          return callback(null, 500, '{"status_code":5}')
        }

        this.db.pin2Id = data['pin2Id']
        this.db.pin2Auth = data['pin2Auth']
        this.db.pin2Box = data['pin2Box']
        this.db.pin2KeyBox = data['pin2KeyBox']

        return callback(null, 200, makeReply(results))
    }
  }

  if (path === '/api/v2/login/recovery2') {
    if (!this.authCheck(body)) {
      return callback(null, 500, '{"status_code":3}')
    }

    switch (method) {
      case 'PUT':
        const data = body['data']
        if (!data['recovery2Id'] || !data['recovery2Auth'] ||
            !data['question2Box'] || !data['recovery2Box'] ||
            !data['recovery2KeyBox']) {
          return callback(null, 500, '{"status_code":5}')
        }

        this.db.recovery2Id = data['recovery2Id']
        this.db.recovery2Auth = data['recovery2Auth']
        this.db.question2Box = data['question2Box']
        this.db.recovery2Box = data['recovery2Box']
        this.db.recovery2KeyBox = data['recovery2KeyBox']

        return callback(null, 200, makeReply(results))
    }
  }

  if (path === '/api/v2/login/repos') {
    if (!this.authCheck(body)) {
      return callback(null, 500, '{"status_code":3}')
    }

    switch (method) {
      case 'POST':
        const data = body['data']
        if (!data['type'] || !data['info']) {
          return callback(null, 500, '{"status_code":5}')
        }

        if (this.db.repos) {
          this.db.repos.push(data)
        } else {
          this.db.repos = [data]
        }

        return callback(null, 200, makeReply(results))
    }
  }

  // lobby: ------------------------------------------------------------------

  if (path === '/api/v2/lobby') {
    results['id'] = 'IMEDGELOGIN'
    this.db.lobby = body['data']
    return callback(null, 200, makeReply(results))
  }

  if (path === '/api/v2/lobby/IMEDGELOGIN') {
    switch (method) {
      case 'GET':
        return callback(null, 200, makeReply(this.db.lobby))
      case 'PUT':
        this.db.lobby = body['data']
        return callback(null, 200, makeReply(results))
    }
  }

  // sync: -------------------------------------------------------------------

  if (path.search('^/api/v2/store/') !== -1) {
    const elements = path.split('/')
    const syncKey = elements[4]
    // const hash = elements[5]

    const repo = this.repos[syncKey]
    if (!repo) {
      return callback(null, 404, 'Cannot find repo ' + syncKey)
    }

    switch (method) {
      case 'POST':
        const changes = body['changes']
        for (let change in changes) {
          if (changes.hasOwnProperty(change)) {
            repo[change] = changes[change]
          }
        }
        results.changes = changes
        results.hash = '1111111111111111111111111111111111111111'
        return callback(null, 200, JSON.stringify(results))

      case 'GET':
        results.changes = repo
        return callback(null, 200, JSON.stringify(results))
    }
  }

  callback(null, 400, '')
}

/**
 * Makes a stand-alone request function that is bound to `this`.
 */
FakeServer.prototype.bindRequest = function () {
  const server = this
  return function () {
    FakeServer.prototype.request.apply(server, arguments)
  }
}
