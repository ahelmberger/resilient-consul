;(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory)
  } else if (typeof exports === 'object') {
    factory(exports)
    if (typeof module === 'object' && module !== null) {
      module.exports = exports = exports.resilientConsul
    }
  } else {
    factory(root)
  }
}(this, function (exports) {

  var requiredParams = ['service', 'servers']
  var consulParams = ['service', 'datacenter', 'protocol', 'tag', 'mapServers', 'onlyHealthy']
  
  exports.resilientConsul = function (params) {
    params = validateParams(params || {})

    // Use the built-in servers mapper, if required
    var mapServers = params.mapServers || (params.onlyHealthy 
      ? mapServersFromHealthEndpoint 
      : mapServersFromCatalogEndpoint)

    // Define Consul base path based on the lookup type
    var basePath = params.onlyHealthy 
      ? '/v1/health/service/' 
      : '/v1/catalog/service/'

    // Define the service specific base path
    params.basePath = basePath + params.service
    
    // Enable self discovery capatibility
    if (params.discoveryService) {
      params.refreshPath = basePath + params.discoveryService
      params.enableSelfRefresh = true
    }

    function consul(options, resilient) {
      // Define resilient scope only options 
      defineResilientOptions(params, options)
    
      return {
        // Incoming traffic middleware
        'in': function inHandler(err, res, next) {
          if (err) return next()
          
          if (Array.isArray(res.data)) {
            res.data = mapServers(res.data)
          }

          next()
        },
        // Outgoing traffic middleware
        'out': function outHandler(options, next) {
          options.params = options.params || {}

          if (params.datacenter) {
            options.params.dc = params.datacenter
          }

          if (params.onlyHealthy) {
            options.params.passing = true
          }

          if (params.tag) {
            options.params.tag = params.tag
          }

          next()
        }
      }
    }
     
    // Define middleware type
    consul.type = 'discovery'

    // Expose the middleware function
    return consul

    function mapServersFromHealthEndpoint(list) {
      var protocol = params.protocol || 'http'

      return list.map(function (s) {
        return protocol + '://' + s.Service.Address + ':' + (+s.Service.Port || 80)
      })
    }

    function mapServersFromCatalogEndpoint(list) {
      var protocol = params.protocol || 'http'
      
      return list
      .filter(function (s) {
        return s && s.Address
      })
      .map(function (s) {
        if (s.ServiceAddress) {
          return s.ServiceAddress
        }
        return protocol + '://' + s.Address + ':' + (+s.ServicePort || 80)
      })
    }
  }

  function validateParams(params) {
    var missing = requiredParams.filter(function (key) { 
      return !params[key]
    })

    if (missing.length) {
      throw new TypeError('Missing required params: ' + missing.join(', '))
    }

    return params
  }

  function defineResilientOptions(params, options) {
    Object.keys(params)
    .filter(function (key) {
      return !~consulParams.indexOf(key)
    })
    .forEach(function (key) {
      options.set(key, params[key])
    })
  }
}))
