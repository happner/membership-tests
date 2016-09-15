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

    if (typeof opts.departWait == 'undefined') opts.departWait = 10000;

    opts.local = {
      incarnation: incarnation,
      host: host,
      meta: {
        name: name
      }
    };

    var swim = new Swim(opts);

    var members = {};

    function listMembers() {
      return Object.keys(members).map(function(name) {
        var member = members[name];
        return {
          meta: {
            name: member.meta.name
          },
          host: member.host,
          state: member.state,
          incarnation: member.incarnation
        }
      });
    }

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

      swim.members().forEach(function(member) {
        members[member.meta.name] = member;
      });

      interval = setInterval(function() {
        var memberList = listMembers();
        orchestrator.exchange.swimmers.pingSwimmer(name, {
          memberList: memberList
        })
          .catch(function() {});
      }, 2000);

      swim.on(Swim.EventType.Change, function (update) {

        if (update.state == 0) {
          if (!members[update.meta.name]) {
            members[update.meta.name] = update;
          } else {
            if (members[update.meta.name].stopWait) {
              clearTimeout(members[update.meta.name].stopWait);
              members[update.meta.name] = update;
              return;
            }
            members[update.meta.name] = update;
          }
        }

        if (update.state == 2) {
          clearTimeout(members[update.meta.name].stopWait);
          members[update.meta.name].stopWait = setTimeout(function() {
            delete members[update.meta.name];
            orchestrator.exchange.swimmers.onUpdate(name, update)
              .catch(function() {});
          }, opts.departWait);
          return;
        }

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
          return;
        }

        if (update.state == 0) {
          if (!members[update.meta.name]) {
            members[update.meta.name] = update;
          } else {
            if (members[update.meta.name].stopWait) {
              clearTimeout(members[update.meta.name].stopWait);
              members[update.meta.name] = update;
              return;
            }
            members[update.meta.name] = update;
          }
        }

        if (update.state == 2) {
          clearTimeout(members[update.meta.name].stopWait);
          members[update.meta.name].stopWait = setTimeout(function() {
            delete members[update.meta.name];
            orchestrator.exchange.swimmers.onUpdate(name, update)
              .catch(function() {});
          }, opts.departWait);
          return;
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
