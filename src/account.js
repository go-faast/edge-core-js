import * as loginPassword from './login/password.js'
import * as loginPin2 from './login/pin2.js'
import * as loginRecovery2 from './login/recovery2.js'
import {Repo} from './util/repo.js'
import * as server from './login/server.js'
import {Wallet} from './wallet.js'
import {WalletList} from './util/walletList.js'

/**
 * This is a thin shim object,
 * which wraps the core implementation in a more OOP-style API.
 */
export function Account (ctx, login) {
  this.ctx = ctx
  this.login = login
  this.keys = login.accountFind(ctx.accountType)
  this.repoInfo = this.keys // Deprecated name
  this.loggedIn = true
  this.edgeLogin = false
  this.pinLogin = false
  this.passwordLogin = false
  this.newAccount = false
  this.recoveryLogin = false
  this.username = login.username

  this.repo = new Repo(ctx, new Buffer(this.keys.dataKey, 'hex'), new Buffer(this.keys.syncKey, 'hex'))
  this.walletList = new WalletList(this.repo)
}

Account.prototype.logout = function () {
  this.login = null
  this.loggedIn = false
}

Account.prototype.passwordOk = function (password) {
  return loginPassword.check(this.ctx, this.login, password)
}
Account.prototype.checkPassword = Account.prototype.passwordOk

Account.prototype.passwordSetup = function (password, callback) {
  return loginPassword.setup(this.ctx, this.login, password, callback)
}
Account.prototype.changePassword = Account.prototype.passwordSetup

Account.prototype.pinSetup = function (pin, callback) {
  return loginPin2.setup(this.ctx, this.login, pin, callback)
}
Account.prototype.changePIN = Account.prototype.pinSetup

Account.prototype.recovery2Set = function (questions, answers, callback) {
  return loginRecovery2.setup(this.ctx, this.login, questions, answers, callback)
}

Account.prototype.setupRecovery2Questions = Account.prototype.recovery2Set

Account.prototype.isLoggedIn = function () {
  return this.loggedIn
}

Account.prototype.sync = function (callback) {
  const account = this
  this.repo.sync(function (err, changed) {
    if (err) return callback(err)
    if (changed) {
      account.walletList.load()
    }
    callback(null, changed)
  })
}

Account.prototype.listWalletIds = function () {
  return this.walletList.listIds()
}

Account.prototype.getWallet = function (id) {
  return new Wallet(this.walletList.getType(id), this.walletList.getKeys(id))
}

/**
 * Gets the first wallet in an account (the first by sort order).
 * If type is a string, finds the first wallet with the same type.
 * Might return null if there are no wallets.
 */
Account.prototype.getFirstWallet = function (type) {
  const ids = this.walletList.listIds()

  for (let i = 0; i < ids.length; ++i) {
    if (type == null || this.walletList.getType(ids[i]) === type) {
      return this.getWallet(ids[i])
    }
  }
  return null
}

/**
 * Creates a new wallet repo, and attaches it to the account.
 * @param keysJson An object with any user-provided keys
 * that should be stored along with the wallet. For example,
 * Airbitz Bitcoin wallets would place their `bitcoinKey` here.
 */
Account.prototype.createWallet = function (type, keysJson, callback) {
  const account = this
  server.repoCreate(account.ctx, account.login, keysJson, function (err, keysJson) {
    if (err) return callback(err)
    const id = account.walletList.addWallet(type, keysJson)
    account.sync(function (err, dirty) {
      if (err) return callback(err)
      server.repoActivate(account.ctx, account.login, keysJson, function (err) {
        if (err) return callback(err)
        callback(null, id)
      })
    })
  })
}
