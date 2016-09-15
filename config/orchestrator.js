/**
 * Created by nomilous on 2016/09/10.
 */

require('dotenv').config({file: __dirname + '/../.env'});

module.exports = {
  name: 'orchestrator',

  datalayer: {
    host: process.env.ORCHESTRATOR_HOST,
    port: process.env.ORCHESTRATOR_PORT,
    secure: true,
    adminPassword: process.env.ORCHESTRATOR_PASSWORD,
    transport: {
      mode: 'https',
      keyPath: __dirname + '/example.com.key',
      certPath: __dirname + '/example.com.cert'
    },
    setOptions: {
      timeout: 30000
    }
  },

  modules: {
    'swimmers': {
      path: __dirname + '/../lib/orchestrator-swimmers'
    }
  },

  components: {
    'swimmers': {
      startMethod: 'start',
      stopMethod: 'stop'
    }
  }
};
