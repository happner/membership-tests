/**
 * Created by nomilous on 2016/09/11.
 */

var os = require('os');
var getAddress = require('./get-address');
var basePort = parseInt(process.env.SWIMMER_BASEPORT);
var randomInt = require('random-int');
var child_process = require('child_process');

module.exports.run = function(orchestrator) {
  return function() {

    var child;
    var opts;
    var hostname = os.hostname().replace(/\./g, '_');
    var name = hostname + '_' + process.pid;
    var ip = getAddress(process.env.SWIMMER_IFACE);
    var port = randomInt(basePort, basePort + 1000);
    var host = ip + ':' + port;

    process.on('exit', function() {
      if (child) child.kill();
    });

    return orchestrator.exchange.swimmers.registerMember({
      name: name,
      host: host
    })

      .then(function(swimmer) {
        opts = swimmer.opts;
        orchestrator.log.info('started member %s', name);
      })

      .then(function() {
        setInterval(function() {
          orchestrator.exchange.swimmers.pingMember({
            name: name
          }).catch(function(error) {
            if (error.toString() == 'Error: Missing member') {
              if (child) child.kill();
              child = null;
              orchestrator.exchange.swimmers.registerMember({
                name: name,
                host: host
              }).catch(function(error) {
                orchestrator.log.error('ping-re-registering', error);
              });
              return;
            }
            orchestrator.log.error('ping', error);
          });
        }, 2000);
      })

      .then(function() {
        orchestrator.on('reconnect/successful', function() {
          orchestrator.log.warn('killing swimmer on reconnect');
          if (child) child.kill();
          child = null;
          orchestrator.exchange.swimmers.registerMember({
            name: name,
            host: host
          })
            .then(function(swimmer) {
              opts = swimmer.opts;
            })
            .catch(function(error) {
              orchestrator.log.error('re-registering', error);
            })
        });
      })

      .then(function() {
        orchestrator.event.swimmers.on('member/' + name + '/*', function(data, meta) {
          var action = meta.path.split('/').pop();
          if (action == 'startSwimmer') return startSwimmer(data.config, data.hostsToJoin);
          console.error('unknown action');
        })
      })

      .catch(function(error) {
        console.error(error);
        process.exit(1);
      });

    function startSwimmer(config, hostsToJoin) {
      var swimopts = config.swimopts || {};

      child = child_process.spawn(__dirname + '/../bin/swimmer', [
        name,
        host,
        JSON.stringify(swimopts),
        JSON.stringify(hostsToJoin)
      ]);

      orchestrator.log.info('started swimmer at pid: %s', child.pid);

      child.on('exit', function(code) {
        child = null;
        if (code == 0) {
          orchestrator.log.warn('swimmer %s exited', name);
        }
        if (code == 1) {
          orchestrator.exchange.swimmers.failedSwimmer(name, 'exited code 1')
            .catch(function() {});
        }
      });

      child.stdout.on('data', function(buf) {
        console._stdout.write(buf.toString());
      });

      child.stderr.on('data', function(buf) {
        console._stderr.write(buf.toString());
      });

    }

  }


};
