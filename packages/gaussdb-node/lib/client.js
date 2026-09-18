'use strict'

const EventEmitter = require('events').EventEmitter
const utils = require('./utils')
const sasl = require('./crypto/sasl')
const TypeOverrides = require('./type-overrides')

const ConnectionParameters = require('./connection-parameters')
const Query = require('./query')
const defaults = require('./defaults')
const Connection = require('./connection')
const crypto = require('./crypto/utils')
const HostChooser = require('./host-chooser')
const HostStatusTracker = require('./host-status-tracker')
const { clearTimeout } = require('timers')
const HostStatus = HostStatusTracker.HostStatus

class Client extends EventEmitter {
  constructor(config) {
    super()

    this.connectionParameters = new ConnectionParameters(config)
    this.user = this.connectionParameters.user
    this.database = this.connectionParameters.database
    this.port = this.connectionParameters.port
    this.host = this.connectionParameters.host

    // "hiding" the password so it doesn't show up in stack traces
    // or if the client is console.logged
    Object.defineProperty(this, 'password', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: this.connectionParameters.password,
    })

    this.replication = this.connectionParameters.replication

    const c = config || {}

    this._Promise = c.Promise || global.Promise
    this._types = new TypeOverrides(c.types)
    this._ending = false
    this._ended = false
    this._connecting = false
    this._connected = false
    this._connectionError = false
    this._queryable = true
    this._roleProbePending = false
    this._skipDueToRole = false

    this.enableChannelBinding = Boolean(c.enableChannelBinding) // set true to use SCRAM-SHA-256-PLUS when offered
    this._connectionOptions = {
      stream: c.stream,
      ssl: this.connectionParameters.ssl,
      keepAlive: c.keepAlive || false,
      keepAliveInitialDelayMillis: c.keepAliveInitialDelayMillis || 0,
      encoding: this.connectionParameters.client_encoding || 'utf8',
    }
    this._clientProvidedConnection = Boolean(c.connection)
    this.connection = c.connection || new Connection(this._connectionOptions)
    this.queryQueue = []
    this.binary = c.binary || defaults.binary
    this.processID = null
    this.secretKey = null
    this.ssl = this.connectionParameters.ssl || false
    // As with Password, make SSL->Key (the private key) non-enumerable.
    // It won't show up in stack traces
    // or if the client is console.logged
    if (this.ssl && this.ssl.key) {
      Object.defineProperty(this.ssl, 'key', {
        enumerable: false,
      })
    }

    this._connectionTimeoutMillis = c.connectionTimeoutMillis || 0
    this._connectErrorHandler = null
    this._activeHostSpec = null
  }

  _errorAllQueries(err) {
    const enqueueError = (query) => {
      process.nextTick(() => {
        query.handleError(err, this.connection)
      })
    }

    if (this.activeQuery) {
      enqueueError(this.activeQuery)
      this.activeQuery = null
    }

    this.queryQueue.forEach(enqueueError)
    this.queryQueue.length = 0
  }

  _connect(callback) {
    this._connectionCallback = callback

    if (this._connecting || this._connected) {
      const err = new Error('Client has already been connected. You cannot reuse a client.')
      process.nextTick(() => {
        callback(err)
      })
      return
    }
    this._connecting = true

    if (this._connectionTimeoutMillis > 0) {
      this.connectionTimeoutHandle = setTimeout(() => {
        const activeConnection = this.connection
        if (activeConnection) {
          activeConnection._ending = true
          if (activeConnection.stream) {
            activeConnection.stream.destroy(new Error('timeout expired'))
          }
        }
      }, this._connectionTimeoutMillis)

      if (this.connectionTimeoutHandle.unref) {
        this.connectionTimeoutHandle.unref()
      }
    }

    const params = this.connectionParameters
    const hasHosts = Array.isArray(params.hosts) && params.hosts.length > 0
    const loadBalanceEnabled = Boolean(params.loadBalanceMode)
    const isDomainSocket = this.host && this.host.indexOf('/') === 0

    if (hasHosts && loadBalanceEnabled && !isDomainSocket) {
      this._connectWithLoadBalance()
    } else if (hasHosts && !loadBalanceEnabled && !isDomainSocket) {
      this._setActiveHost(params.hosts[0])
      this._startConnection()
    } else {
      this._startConnection()
    }
  }

  _startConnection() {
    const self = this
    const con = this.connection

    if (this.host && this.host.indexOf('/') === 0) {
      // TODO: is GaussDB using domain sockets?
      con.connect(this.host + '/.s.PGSQL.' + this.port)
    } else {
      con.connect(this.port, this.host)
    }

    // once connection is established send startup message
    con.on('connect', function () {
      if (self.ssl) {
        con.requestSsl()
      } else {
        con.startup(self.getStartupConf())
      }
    })

    con.on('sslconnect', function () {
      con.startup(self.getStartupConf())
    })

    this._attachListeners(con)

    const activeConnection = con
    con.once('end', () => {
      if (activeConnection !== this.connection) {
        return
      }
      const error = this._ending ? new Error('Connection terminated') : new Error('Connection terminated unexpectedly')

      if (this._connecting && this._connectErrorHandler) {
        return this._connectErrorHandler(error)
      }

      clearTimeout(this.connectionTimeoutHandle)
      this._errorAllQueries(error)
      this._ended = true

      if (!this._ending) {
        // if the connection is ended without us calling .end()
        // on this client then we have an unexpected disconnection
        // treat this as an error unless we've already emitted an error
        // during connection.
        if (this._connecting && !this._connectionError) {
          if (this._connectionCallback) {
            this._connectionCallback(error)
          } else {
            this._handleErrorEvent(error)
          }
        } else if (!this._connectionError) {
          this._handleErrorEvent(error)
        }
      }

      process.nextTick(() => {
        this.emit('end')
      })
    })
  }

  _setActiveHost(hostSpec) {
    if (!hostSpec) {
      return
    }
    this.host = hostSpec.host
    this.port = hostSpec.port
    this._activeHostSpec = hostSpec

    if (this.connectionParameters) {
      this.connectionParameters.host = hostSpec.host
      this.connectionParameters.port = hostSpec.port
    }
  }

  _connectWithLoadBalance() {
    const params = this.connectionParameters
    const chooser = new HostChooser(
      params.hosts,
      params.loadBalanceMode,
      params.targetServerType,
      params.hostRecheckSeconds
    )
    const orderedHosts = Array.from(chooser.getHostIterator())

    if (orderedHosts.length === 0) {
      return this._finalizeConnectFailure(new Error('No hosts to connect'))
    }

    if (this._clientProvidedConnection) {
      orderedHosts.splice(1)
    }

    let lastError = null

    const tryNextHost = () => {
      const hostSpec = orderedHosts.shift()
      if (!hostSpec) {
        return this._finalizeConnectFailure(lastError || new Error('No hosts to connect'))
      }

      this._connectionError = false
      this._setActiveHost(hostSpec)

      if (!this._clientProvidedConnection) {
        this.connection = new Connection(this._connectionOptions)
      }

      this._connectErrorHandler = (err) => {
        if (this._connectionError) {
          return
        }
        this._connectionError = true
        lastError = err
        if (!this._skipDueToRole) {
          HostStatusTracker.updateHostStatus(hostSpec, HostStatus.CONNECT_FAIL)
        }
        this._skipDueToRole = false

        if (this.connection && this.connection.stream) {
          this.connection.stream.destroy()
        }

        if (this._clientProvidedConnection) {
          return this._finalizeConnectFailure(lastError)
        }

        process.nextTick(tryNextHost)
      }

      this._startConnection()
    }

    tryNextHost()
  }

  _finalizeConnectFailure(err) {
    this._connectErrorHandler = null
    this._connecting = false
    this._connectionError = true
    clearTimeout(this.connectionTimeoutHandle)

    if (this._connectionCallback) {
      const callback = this._connectionCallback
      this._connectionCallback = null
      return callback(err)
    }
    this.emit('error', err)
  }

  connect(callback) {
    if (callback) {
      this._connect(callback)
      return
    }

    return new this._Promise((resolve, reject) => {
      this._connect((error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  _attachListeners(con) {
    const handleError = (err) => this._handleErrorEvent(err, con)
    const handleErrorMessage = (msg) => this._handleErrorMessage(msg, con)
    const handleReadyForQuery = (msg) => this._handleReadyForQuery(msg, con)

    // password request handling
    con.on('authenticationCleartextPassword', this._handleAuthCleartextPassword.bind(this))
    // password request handling
    con.on('authenticationMD5Password', this._handleAuthMD5Password.bind(this))
    // password request handling
    con.on('authenticationSHA256Password', this._handleAuthSHA256Password.bind(this))
    // password request handling (SASL)
    con.on('authenticationSASL', this._handleAuthSASL.bind(this))
    con.on('authenticationSASLContinue', this._handleAuthSASLContinue.bind(this))
    con.on('authenticationSASLFinal', this._handleAuthSASLFinal.bind(this))
    con.on('backendKeyData', this._handleBackendKeyData.bind(this))
    con.on('error', handleError)
    con.on('errorMessage', handleErrorMessage)
    con.on('readyForQuery', handleReadyForQuery)
    con.on('notice', this._handleNotice.bind(this))
    con.on('rowDescription', this._handleRowDescription.bind(this))
    con.on('dataRow', this._handleDataRow.bind(this))
    con.on('portalSuspended', this._handlePortalSuspended.bind(this))
    con.on('emptyQuery', this._handleEmptyQuery.bind(this))
    con.on('commandComplete', this._handleCommandComplete.bind(this))
    con.on('parseComplete', this._handleParseComplete.bind(this))
    con.on('copyInResponse', this._handleCopyInResponse.bind(this))
    con.on('copyData', this._handleCopyData.bind(this))
    con.on('notification', this._handleNotification.bind(this))
  }

  // TODO(bmc): deprecate pgpass "built in" integration since this.password can be a function
  // it can be supplied by the user if required - this is a breaking change!
  _checkPgPass(cb) {
    const con = this.connection
    if (typeof this.password === 'function') {
      this._Promise
        .resolve()
        .then(() => this.password())
        .then((pass) => {
          if (pass !== undefined) {
            if (typeof pass !== 'string') {
              con.emit('error', new TypeError('Password must be a string'))
              return
            }
            this.connectionParameters.password = this.password = pass
          } else {
            this.connectionParameters.password = this.password = null
          }
          cb()
        })
        .catch((err) => {
          con.emit('error', err)
        })
    } else if (this.password !== null) {
      cb()
    } else {
      try {
        const pgPass = require('pgpass')
        pgPass(this.connectionParameters, (pass) => {
          if (undefined !== pass) {
            this.connectionParameters.password = this.password = pass
          }
          cb()
        })
      } catch (e) {
        this.emit('error', e)
      }
    }
  }

  _handleAuthCleartextPassword(msg) {
    this._checkPgPass(() => {
      this.connection.password(this.password)
    })
  }

  _handleAuthMD5Password(msg) {
    this._checkPgPass(async () => {
      try {
        const hashedPassword = await crypto.gaussdbMd5PasswordHash(this.user, this.password, msg.salt)
        this.connection.password(hashedPassword)
      } catch (e) {
        this.emit('error', e)
      }
    })
  }

  _handleAuthSHA256Password(msg) {
    this._checkPgPass(async () => {
      try {
        const hashedPassword = await crypto.gaussdbSha256PasswordHash(
          this.user,
          this.password,
          msg.data,
          this.connectionParameters.sha256Iterations
        )
        this.connection.password(hashedPassword)
      } catch (e) {
        this.emit('error', e)
      }
    })
  }

  _handleAuthSASL(msg) {
    this._checkPgPass(() => {
      try {
        this.saslSession = sasl.startSession(msg.mechanisms, this.enableChannelBinding && this.connection.stream)
        this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism, this.saslSession.response)
      } catch (err) {
        this.connection.emit('error', err)
      }
    })
  }

  async _handleAuthSASLContinue(msg) {
    try {
      await sasl.continueSession(
        this.saslSession,
        this.password,
        msg.data,
        this.enableChannelBinding && this.connection.stream
      )
      this.connection.sendSCRAMClientFinalMessage(this.saslSession.response)
    } catch (err) {
      this.connection.emit('error', err)
    }
  }

  _handleAuthSASLFinal(msg) {
    try {
      sasl.finalizeSession(this.saslSession, msg.data)
      this.saslSession = null
    } catch (err) {
      this.connection.emit('error', err)
    }
  }

  _handleBackendKeyData(msg) {
    this.processID = msg.processID
    this.secretKey = msg.secretKey
  }

  _handleReadyForQuery(msg, connection) {
    if (connection && connection !== this.connection) {
      return
    }
    if (this._connecting) {
      const targetType = this.connectionParameters.targetServerType
      if (targetType && targetType !== 'any' && !this._roleProbePending) {
        if (this._activeHostSpec) {
          HostStatusTracker.updateHostStatus(this._activeHostSpec, HostStatus.CONNECT_OK)
        }
        this._roleProbePending = true
        this.query('SELECT pg_is_in_recovery() AS is_in_recovery', (err, result) => {
          this._roleProbePending = false
          if (err) {
            this._skipToNextHostDuringConnect(err)
            return
          }
          const isInRecovery = result && result.rows && result.rows[0] ? result.rows[0].is_in_recovery : null
          const role =
            isInRecovery === true || isInRecovery === 't'
              ? HostStatus.SLAVE
              : isInRecovery === false || isInRecovery === 'f'
              ? HostStatus.MASTER
              : null
          if (role === null) {
            this._skipToNextHostDuringConnect(new Error('Failed to determine server role: unexpected probe result'))
            return
          }
          if (this._activeHostSpec) {
            HostStatusTracker.updateHostStatus(this._activeHostSpec, role)
          }
          if (!this._isRoleAcceptable(role, targetType)) {
            const hostLabel = this._activeHostSpec
              ? `${this._activeHostSpec.host}:${this._activeHostSpec.port}`
              : 'host'
            this._skipToNextHostDuringConnect(
              new Error(
                `Host ${hostLabel} is ${
                  role === HostStatus.MASTER ? 'primary' : 'standby'
                }, does not satisfy targetServerType='${targetType}'`
              )
            )
            return
          }
          this._finalizeConnectSuccess()
        })
      } else if (!this._roleProbePending) {
        this._finalizeConnectSuccess()
      }
    }
    const { activeQuery } = this
    this.activeQuery = null
    this.readyForQuery = true
    if (activeQuery) {
      activeQuery.handleReadyForQuery(this.connection)
    }
    this._pulseQueryQueue()
  }

  _finalizeConnectSuccess() {
    this._connecting = false
    this._connected = true
    clearTimeout(this.connectionTimeoutHandle)
    this._connectErrorHandler = null

    if (this._activeHostSpec && !this._roleProbePending) {
      const targetType = this.connectionParameters.targetServerType
      if (!targetType || targetType === 'any') {
        HostStatusTracker.updateHostStatus(this._activeHostSpec, HostStatus.CONNECT_OK)
      }
    }

    if (this._connectionCallback) {
      this._connectionCallback(null, this)
      this._connectionCallback = null
    }
    this.emit('connect')
  }

  _isRoleAcceptable(role, targetType) {
    if (!targetType || targetType === 'any') {
      return true
    }
    if (targetType === 'master') {
      return role === HostStatus.MASTER
    }
    if (targetType === 'slave') {
      return role === HostStatus.SLAVE
    }
    if (targetType === 'preferSlave') {
      return role === HostStatus.SLAVE || role === HostStatus.MASTER
    }
    return true
  }

  _skipToNextHostDuringConnect(err) {
    this._skipDueToRole = true
    if (this.connection && this.connection.stream) {
      this.connection.stream.destroy()
    }
    const handler = this._connectErrorHandler
    if (handler) {
      this._connecting = true
      handler(err)
    } else {
      this._handleErrorWhileConnecting(err)
    }
  }

  // if we receieve an error event or error message
  // during the connection process we handle it here
  _handleErrorWhileConnecting(err) {
    const errMsg = (err && err.message) || ''
    if (
      errMsg.includes('unsupported frontend protocol') &&
      errMsg.includes('3.51') &&
      !this._protocolFallbackAttempted
    ) {
      this._protocolFallbackAttempted = true
      this._connectionError = false
      const oldCon = this.connection
      if (oldCon) {
        oldCon.removeAllListeners()
        if (oldCon.stream) {
          oldCon.stream.destroy()
        }
      }
      this.saslSession = null
      this.connection = new Connection({ ...this._connectionOptions, protocolMinor: 0 })
      this._startConnection()
      return
    }

    if (this._connectionError) {
      // TODO(bmc): this is swallowing errors - we shouldn't do this
      return
    }
    this._connectionError = true
    this._connecting = false
    clearTimeout(this.connectionTimeoutHandle)

    if (this.connection && this.connection.stream) {
      this.connection.stream.destroy()
    }

    if (this._connectionCallback) {
      const callback = this._connectionCallback
      this._connectionCallback = null
      return callback(err)
    }
    this.emit('error', err)
  }

  // if we're connected and we receive an error event from the connection
  // this means the socket is dead - do a hard abort of all queries and emit
  // the socket error on the client as well
  _handleErrorEvent(err, connection) {
    if (connection && connection !== this.connection) {
      return
    }
    if (this._connecting) {
      return this._handleErrorWhileConnecting(err)
    }
    this._queryable = false
    this._errorAllQueries(err)
    this.emit('error', err)
  }

  // handle error messages from the postgres backend
  _handleErrorMessage(msg, connection) {
    if (connection && connection !== this.connection) {
      return
    }
    if (this._connecting) {
      return this._handleErrorWhileConnecting(msg)
    }
    const activeQuery = this.activeQuery

    if (!activeQuery) {
      this._handleErrorEvent(msg)
      return
    }

    this.activeQuery = null
    activeQuery.handleError(msg, this.connection)
  }

  _handleRowDescription(msg) {
    // delegate rowDescription to active query
    this.activeQuery.handleRowDescription(msg)
  }

  _handleDataRow(msg) {
    // delegate dataRow to active query
    this.activeQuery.handleDataRow(msg)
  }

  _handlePortalSuspended(msg) {
    // delegate portalSuspended to active query
    this.activeQuery.handlePortalSuspended(this.connection)
  }

  _handleEmptyQuery(msg) {
    // delegate emptyQuery to active query
    this.activeQuery.handleEmptyQuery(this.connection)
  }

  _handleCommandComplete(msg) {
    if (this.activeQuery == null) {
      const error = new Error('Received unexpected commandComplete message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // delegate commandComplete to active query
    this.activeQuery.handleCommandComplete(msg, this.connection)
  }

  _handleParseComplete() {
    if (this.activeQuery == null) {
      const error = new Error('Received unexpected parseComplete message from backend.')
      this._handleErrorEvent(error)
      return
    }
    // if a prepared statement has a name and properly parses
    // we track that its already been executed so we don't parse
    // it again on the same client
    if (this.activeQuery.name) {
      this.connection.parsedStatements[this.activeQuery.name] = this.activeQuery.text
    }
  }

  _handleCopyInResponse(msg) {
    this.activeQuery.handleCopyInResponse(this.connection)
  }

  _handleCopyData(msg) {
    this.activeQuery.handleCopyData(msg, this.connection)
  }

  _handleNotification(msg) {
    this.emit('notification', msg)
  }

  _handleNotice(msg) {
    this.emit('notice', msg)
  }

  getStartupConf() {
    const params = this.connectionParameters

    const data = {
      user: params.user,
      database: params.database,
    }

    const appName = params.application_name || params.fallback_application_name
    if (appName) {
      data.application_name = appName
    }
    if (params.replication) {
      data.replication = '' + params.replication
    }
    if (params.statement_timeout) {
      data.statement_timeout = String(parseInt(params.statement_timeout, 10))
    }
    if (params.lock_timeout) {
      data.lock_timeout = String(parseInt(params.lock_timeout, 10))
    }
    if (params.idle_in_transaction_session_timeout) {
      data.idle_in_transaction_session_timeout = String(parseInt(params.idle_in_transaction_session_timeout, 10))
    }
    if (params.options) {
      data.options = params.options
    }

    return data
  }

  cancel(client, query) {
    if (client.activeQuery === query) {
      const con = this.connection

      if (this.host && this.host.indexOf('/') === 0) {
        // TODO: is GaussDB using domain sockets?
        con.connect(this.host + '/.s.PGSQL.' + this.port)
      } else {
        con.connect(this.port, this.host)
      }

      // once connection is established send cancel message
      con.on('connect', function () {
        con.cancel(client.processID, client.secretKey)
      })
    } else if (client.queryQueue.indexOf(query) !== -1) {
      client.queryQueue.splice(client.queryQueue.indexOf(query), 1)
    }
  }

  setTypeParser(oid, format, parseFn) {
    return this._types.setTypeParser(oid, format, parseFn)
  }

  getTypeParser(oid, format) {
    return this._types.getTypeParser(oid, format)
  }

  // escapeIdentifier and escapeLiteral moved to utility functions & exported
  // on PG
  // re-exported here for backwards compatibility
  escapeIdentifier(str) {
    return utils.escapeIdentifier(str)
  }

  escapeLiteral(str) {
    return utils.escapeLiteral(str)
  }

  _pulseQueryQueue() {
    if (this.readyForQuery === true) {
      this.activeQuery = this.queryQueue.shift()
      if (this.activeQuery) {
        this.readyForQuery = false
        this.hasExecuted = true

        const queryError = this.activeQuery.submit(this.connection)
        if (queryError) {
          process.nextTick(() => {
            this.activeQuery.handleError(queryError, this.connection)
            this.readyForQuery = true
            this._pulseQueryQueue()
          })
        }
      } else if (this.hasExecuted) {
        this.activeQuery = null
        this.emit('drain')
      }
    }
  }

  query(config, values, callback) {
    // can take in strings, config object or query object
    let query
    let result
    let readTimeout
    let readTimeoutTimer
    let queryCallback

    if (config === null || config === undefined) {
      throw new TypeError('Client was passed a null or undefined query')
    } else if (typeof config.submit === 'function') {
      readTimeout = config.query_timeout || this.connectionParameters.query_timeout
      result = query = config
      if (typeof values === 'function') {
        query.callback = query.callback || values
      }
    } else {
      readTimeout = config.query_timeout || this.connectionParameters.query_timeout
      query = new Query(config, values, callback)
      if (!query.callback) {
        result = new this._Promise((resolve, reject) => {
          query.callback = (err, res) => (err ? reject(err) : resolve(res))
        }).catch((err) => {
          // replace the stack trace that leads to `TCP.onStreamRead` with one that leads back to the
          // application that created the query
          Error.captureStackTrace(err)
          throw err
        })
      }
    }

    if (readTimeout) {
      queryCallback = query.callback

      readTimeoutTimer = setTimeout(() => {
        const error = new Error('Query read timeout')

        process.nextTick(() => {
          query.handleError(error, this.connection)
        })

        queryCallback(error)

        // we already returned an error,
        // just do nothing if query completes
        query.callback = () => {}

        // Remove from queue
        const index = this.queryQueue.indexOf(query)
        if (index > -1) {
          this.queryQueue.splice(index, 1)
        }

        this._pulseQueryQueue()
      }, readTimeout)

      query.callback = (err, res) => {
        clearTimeout(readTimeoutTimer)
        queryCallback(err, res)
      }
    }

    if (this.binary && !query.binary) {
      query.binary = true
    }

    if (query._result && !query._result._types) {
      query._result._types = this._types
    }

    if (!this._queryable) {
      process.nextTick(() => {
        query.handleError(new Error('Client has encountered a connection error and is not queryable'), this.connection)
      })
      return result
    }

    if (this._ending) {
      process.nextTick(() => {
        query.handleError(new Error('Client was closed and is not queryable'), this.connection)
      })
      return result
    }

    this.queryQueue.push(query)
    this._pulseQueryQueue()
    return result
  }

  ref() {
    this.connection.ref()
  }

  unref() {
    this.connection.unref()
  }

  end(cb) {
    this._ending = true

    // if we have never connected, then end is a noop, callback immediately
    if (!this.connection._connecting || this._ended) {
      if (cb) {
        cb()
      } else {
        return this._Promise.resolve()
      }
    }

    if (this.activeQuery || !this._queryable) {
      // if we have an active query we need to force a disconnect
      // on the socket - otherwise a hung query could block end forever
      this.connection.stream.destroy()
    } else {
      this.connection.end()
    }

    if (cb) {
      this.connection.once('end', cb)
    } else {
      return new this._Promise((resolve) => {
        this.connection.once('end', resolve)
      })
    }
  }
}

// expose a Query constructor
Client.Query = Query

module.exports = Client
