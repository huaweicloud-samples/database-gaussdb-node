'use strict'

const dns = require('dns')

const defaults = require('./defaults')

const parse = require('gaussdb-connection-string').parse // parses a connection string

const HostSpec = require('./host-spec')

const val = function (key, config, envVar) {
  if (envVar === undefined) {
    envVar = process.env['GAUSS' + key.toUpperCase()]
  } else if (envVar === false) {
    // do nothing ... use false
  } else {
    envVar = process.env[envVar]
  }

  return config[key] || envVar || defaults[key]
}

const readSSLConfigFromEnvironment = function () {
  switch (process.env.GAUSSSSLMODE) {
    case 'disable':
      return false
    case 'prefer':
    case 'require':
    case 'verify-ca':
    case 'verify-full':
      return true
    case 'no-verify':
      return { rejectUnauthorized: false }
  }
  return defaults.ssl
}

// Convert arg to a string, surround in single quotes, and escape single quotes and backslashes
const quoteParamValue = function (value) {
  return "'" + ('' + value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}

const add = function (params, config, paramName) {
  const value = config[paramName]
  if (value !== undefined && value !== null) {
    params.push(paramName + '=' + quoteParamValue(value))
  }
}

class ConnectionParameters {
  constructor(config) {
    // if a string is passed, it is a raw connection string so we parse it into a config
    config = typeof config === 'string' ? parse(config) : config || {}

    // if the config has a connectionString defined, parse IT into the config we use
    // this will override other default values with what is stored in connectionString
    if (config.connectionString) {
      config = Object.assign({}, config, parse(config.connectionString))
    }

    this.user = val('user', config)
    this.database = val('database', config)

    if (this.database === undefined) {
      this.database = this.user
    }

    this.port = parseInt(val('port', config), 10)
    this.host = val('host', config)

    // "hiding" the password so it doesn't show up in stack traces
    // or if the client is console.logged
    Object.defineProperty(this, 'password', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: val('password', config),
    })

    this.binary = val('binary', config)
    this.options = val('options', config)

    this.ssl = typeof config.ssl === 'undefined' ? readSSLConfigFromEnvironment() : config.ssl

    if (typeof this.ssl === 'string') {
      if (this.ssl === 'true') {
        this.ssl = true
      }
    }
    // support passing in ssl=no-verify via connection string
    if (this.ssl === 'no-verify') {
      this.ssl = { rejectUnauthorized: false }
    }
    if (this.ssl && this.ssl.key) {
      Object.defineProperty(this.ssl, 'key', {
        enumerable: false,
      })
    }

    this.client_encoding = val('client_encoding', config)
    this.replication = val('replication', config)

    // GaussDB SHA256 auth PBKDF2 iteration count: number or 'server'
    const sha256Iterations = val('sha256Iterations', config)
    if (sha256Iterations === 'server' || sha256Iterations === undefined) {
      this.sha256Iterations = sha256Iterations
    } else {
      const parsed = parseInt(sha256Iterations, 10)
      this.sha256Iterations = Number.isNaN(parsed) ? sha256Iterations : parsed
    }

    // a domain socket begins with '/'
    this.isDomainSocket = !(this.host || '').indexOf('/')

    this.application_name = val('application_name', config, 'GAUSSAPPNAME')
    this.fallback_application_name = val('fallback_application_name', config, false)
    this.statement_timeout = val('statement_timeout', config, false)
    this.lock_timeout = val('lock_timeout', config, false)
    this.idle_in_transaction_session_timeout = val('idle_in_transaction_session_timeout', config, false)
    this.query_timeout = val('query_timeout', config, false)

    if (config.connectionTimeoutMillis === undefined) {
      this.connect_timeout = process.env.GAUSSCONNECT_TIMEOUT || 0
    } else {
      this.connect_timeout = Math.floor(config.connectionTimeoutMillis / 1000)
    }

    if (config.keepAlive === false) {
      this.keepalives = 0
    } else if (config.keepAlive === true) {
      this.keepalives = 1
    }

    if (typeof config.keepAliveInitialDelayMillis === 'number') {
      this.keepalives_idle = Math.floor(config.keepAliveInitialDelayMillis / 1000)
    }

    // Parse multi-host configuration
    this.hosts = this._parseHosts(config)

    // Parse loadBalanceHosts parameter and map to mode
    this.loadBalanceMode = this._parseLoadBalanceMode(config)

    // Parse targetServerType parameter
    this.targetServerType = val('targetServerType', config)

    // Parse hostRecheckSeconds parameter
    const hostRecheckSeconds = val('hostRecheckSeconds', config)
    this.hostRecheckSeconds =
      typeof hostRecheckSeconds === 'number' ? hostRecheckSeconds : parseInt(hostRecheckSeconds, 10)
  }

  /**
   * Parse hosts configuration from multiple sources
   * Priority: config.hosts > connectionString parsed hosts > config.host/port arrays > config.host/port single
   * @param {object} config - Configuration object
   * @returns {HostSpec[]} Array of HostSpec instances
   * @private
   */
  _parseHosts(config) {
    const hosts = []

    // Priority 1: config.hosts (array of {host, port} objects)
    if (config.hosts && Array.isArray(config.hosts)) {
      for (const hostInfo of config.hosts) {
        const host = hostInfo.host || 'localhost'
        const port = hostInfo.port || this.port || defaults.port
        hosts.push(new HostSpec(host, port))
      }
      return hosts
    }

    // Priority 2: connectionString parsed hosts (already in config from parse())
    // This is already handled by the connection string parser

    // Priority 3: config.host and config.port as arrays
    if (Array.isArray(config.host)) {
      const hostArray = config.host
      const portArray = Array.isArray(config.port) ? config.port : []
      const defaultPort = this.port || defaults.port

      for (let i = 0; i < hostArray.length; i++) {
        const host = hostArray[i]
        const port = portArray[i] || defaultPort
        hosts.push(new HostSpec(host, port))
      }
      return hosts
    }

    // Priority 4: Single host/port (backward compatibility)
    if (this.host) {
      hosts.push(new HostSpec(this.host, this.port))
    }

    return hosts
  }

  /**
   * Parse and map loadBalanceHosts parameter value
   * Maps JDBC autoBalance values to Node.js loadBalanceMode
   * @param {object} config - Configuration object
   * @returns {string|boolean} Parsed load balance mode
   * @private
   */
  _parseLoadBalanceMode(config) {
    const rawValue = val('loadBalanceHosts', config)

    // Handle boolean values
    if (rawValue === true || rawValue === 'true' || rawValue === '1') {
      return 'roundrobin' // true maps to roundrobin mode
    }

    if (rawValue === false || rawValue === 'false' || rawValue === '0' || rawValue === undefined) {
      return false // false means no load balancing
    }

    // Handle string values
    if (typeof rawValue === 'string') {
      const normalizedValue = rawValue.toLowerCase()

      // roundrobin mode
      if (normalizedValue === 'roundrobin' || normalizedValue === 'balance') {
        return 'roundrobin'
      }

      // shuffle mode
      if (normalizedValue === 'shuffle') {
        return 'shuffle'
      }

      // leastconn mode
      if (normalizedValue === 'leastconn') {
        return 'leastconn'
      }

      // priority mode
      if (normalizedValue.startsWith('priority')) {
        return normalizedValue // Return as-is, e.g., 'priority2'
      }
    }

    // Default: no load balancing
    return false
  }

  getLibpqConnectionString(cb) {
    const params = []
    add(params, this, 'user')
    add(params, this, 'password')
    add(params, this, 'port')
    add(params, this, 'application_name')
    add(params, this, 'fallback_application_name')
    add(params, this, 'connect_timeout')
    add(params, this, 'options')

    const ssl = typeof this.ssl === 'object' ? this.ssl : this.ssl ? { sslmode: this.ssl } : {}
    add(params, ssl, 'sslmode')
    add(params, ssl, 'sslca')
    add(params, ssl, 'sslkey')
    add(params, ssl, 'sslcert')
    add(params, ssl, 'sslrootcert')

    if (this.database) {
      params.push('dbname=' + quoteParamValue(this.database))
    }
    if (this.replication) {
      params.push('replication=' + quoteParamValue(this.replication))
    }
    if (this.host) {
      params.push('host=' + quoteParamValue(this.host))
    }
    if (this.isDomainSocket) {
      return cb(null, params.join(' '))
    }
    if (this.client_encoding) {
      params.push('client_encoding=' + quoteParamValue(this.client_encoding))
    }
    dns.lookup(this.host, function (err, address) {
      if (err) return cb(err, null)
      params.push('hostaddr=' + quoteParamValue(address))
      return cb(null, params.join(' '))
    })
  }
}

module.exports = ConnectionParameters
