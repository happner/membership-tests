/**
 * Created by nomilous on 2016/09/11.
 */

var path = require('path');
var fs = require('fs');
var Swim = require('swim');

module.exports.run = function(orchestrator) {
  return function() {

    var name = process.argv[2];
    var host = process.argv[3];
    var opts = JSON.parse(process.argv[4]);
    var hostsToJoin = JSON.parse(process.argv[5]);
    var incarnation = getIncarnation(host);
    var interval;

    if (typeof opts.codec == 'undefined') opts.codec = 'msgpack';
    if (typeof opts.disseminationFactor == 'undefined') opts.disseminationFactor = 15;
    if (typeof opts.interval == 'undefined') opts.interval = 100;
    if (typeof opts.joinTimeout == 'undefined') opts.joinTimeout = 200;
    if (typeof opts.pingTimeout == 'undefined') opts.pingTimeout = 20;
    if (typeof opts.pingReqTimeout == 'undefined') opts.pingReqTimeout = 60;
    if (typeof opts.pingReqGroupSize == 'undefined') opts.pingReqGroupSize = 3;
    if (typeof opts.udp == 'undefined') opts.udp = {};
    if (typeof opts.udp.maxDgramSize == 'undefined') opts.udp.maxDgramSize = 512;

    opts.local = {
      incarnation: incarnation,
      host: host,
      meta: {
        name: name
      }
    };

    var swim = new Swim(opts);

    swim.bootstrap(hostsToJoin, function(error) {
      if (error) {
        console.error(error.stack);
        return orchestrator.exchange.swimmers.failedSwimmer(name, error.toString())
          .then(function() {
            process.exit(0);
          })
          .catch(function() {
            process.exit(0);
          });
      }

      interval = setInterval(function() {
        orchestrator.exchange.swimmers.pingSwimmer(name, {
          memberList: swim.members()
        })
          .catch(function() {});
      }, 2000);

      swim.on(Swim.EventType.Change, function (update) {
        orchestrator.exchange.swimmers.onChange(name, update)
          .catch(function() {});
      });
      swim.on(Swim.EventType.Update, function (update) {
        if (update.meta.name == name) {
          if (update.incarnation > incarnation) {
            incarnation = update.incarnation;
            saveIncarnation(incarnation);
            orchestrator.exchange.swimmers.onIncarnation(name, incarnation)
              .catch(function() {});
          }
        }
        orchestrator.exchange.swimmers.onUpdate(name, update)
          .catch(function() {});
      });
    });

    orchestrator.event.swimmers.on('swimmer/' + name + '/stop', function() {
      clearInterval(interval);
      setTimeout(function() {
        orchestrator.exchange.swimmers.stoppedSwimmer(name)
          .then(function() {
            process.exit(0);
          })
          .catch(function(error) {
            console.error(error.stack);
            process.exit(0);
          })
      }, 1000);
    });


    function getIncarnation() {
      var filename = path.dirname(__dirname) + '/.incarnation.' + host;
      var incarnation = 0;
      try {
        incarnation = parseInt(fs.readFileSync(filename));
        incarnation++;
      } catch (e) {
        incarnation++;
      }
      saveIncarnation(incarnation);
      return incarnation;
    }

    function saveIncarnation(incarnation) {
      var filename = path.dirname(__dirname) + '/.incarnation.' + host;
      fs.writeFileSync(filename, incarnation);
    }

  }
};
