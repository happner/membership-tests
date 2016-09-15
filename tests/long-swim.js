/**
 * Created by nomilous on 2016/09/10.
 */

// first start bin/orchestrator separately on selected orchestrator member
// then start bin/member on each member

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require('dotenv').config({file: __dirname + '/../.env'});

var Promise = require('bluebird');
var Happner = require('happner');
var randomInt = require('random-int');
var orchestrator;
var stopWaiting = {};
var startWaiting = {};
var swimopts = {

};

describe('distributed swim test', function() {

  before('connect to orchestrator', function(done) {
    orchestrator = new Happner.MeshClient({
      hostname: process.env.ORCHESTRATOR_HOST,
      port: process.env.ORCHESTRATOR_PORT,
      protocol: 'https'
    });

    orchestrator.login({
      username: '_ADMIN',
      password: process.env.ORCHESTRATOR_PASSWORD
    })

      .then(function() {
        orchestrator.event.swimmers.on('cluster/log', function(data) {
          orchestrator.log[data.level || 'info'].apply(orchestrator.log, data.args);
        });
        done();
      })
      .catch(done);
  });

  before('clear previous cluster', function(done) {
    this.timeout(100000);
    orchestrator.exchange.swimmers.stopCluster()
      .then(function() {
        done();
      })
      .catch(done);
  });

  before('start cluster', function(done) {
    this.timeout(0);
    orchestrator.exchange.swimmers.listMembers()
      .then(function(members) {
        orchestrator.log.info('starting %d cluster members', Object.keys(members).length);
        return orchestrator.exchange.swimmers.startCluster({
          swimopts: swimopts
        })
      })
      .then(function() {
        var running = false;
        var interval = setInterval(function() {
          if (running) return;
          running = true;
          orchestrator.exchange.swimmers.isClusterSynchronized()
            .then(function(result) {
              if (result == true) {
                clearInterval(interval);
                running = false;
                return done();
              }
              running = false;
            })
            .catch(function(error) {
              orchestrator.log.error('isClusterSynchronized', error);
              clearInterval(interval);
              running = false;
              done(error);
            })
        }, 100);
      })
      .catch(done);
  });

  before(function(done) {
    orchestrator.event.swimmers.on('swimmer/arrives', function(data) {
      // console.log('swimmer/arrives', data);
      if (!startWaiting[data.at]) return;
      if (startWaiting[data.at].target != data.subject) return;
      if (startWaiting[data.at].done) return;
      startWaiting[data.at].done = Date.now() - startWaiting[data.at].start;
    });
    orchestrator.event.swimmers.on('swimmer/departs', function(data) {
      // console.log('swimmer/departs', data);
      if (!stopWaiting[data.at]) return;
      if (stopWaiting[data.at].target != data.subject) return;
      if (stopWaiting[data.at].done) return;
      stopWaiting[data.at].done = Date.now() - stopWaiting[data.at].start;

    });
    setTimeout(done, 1000);
  });

  after('stop cluster', function(done) {
    this.timeout(100000);
    orchestrator.exchange.swimmers.stopCluster()
      .then(function() {
        done();
      })
      .catch(done);
  });

  it('repeat stop and start random swimmer confirming full replication of state changes', function(done) {
    this.timeout(0);

    var iteration = 0;
    var iterations = 1000;
    var start = Date.now();

    function setDepartures(target, swimmers) {
      return new Promise(function(resolve, reject) {
        var ts = Date.now();
        stopWaiting = {};
        Object.keys(swimmers)
          .forEach(function(name) {
            if (name == target) return;
            stopWaiting[name] = {
              target: target,
              start: ts,
              done: null
            };
          });
        resolve();
      });
    }

    function stopSwimmer(target) {
      return new Promise(function(resolve, reject) {
        orchestrator.exchange.swimmers.stopSwimmer(target)
          .then(function() {
            var interval = setInterval(function() {
              Object.keys(stopWaiting)
                .forEach(function(name) {
                  var waiting = stopWaiting[name];
                  if (!waiting.done) return;
                  orchestrator.log.info('%s detected departed in %d (ms)', name, waiting.done);
                  delete stopWaiting[name];
                  if (Object.keys(stopWaiting).length > 0) return;
                  clearInterval(interval);
                  resolve();
                });
            }, 100);
          })
          .catch(reject);
      });
    }

    function setArrivals(target, swimmers) {
      return new Promise(function(resolve, reject) {
        var ts = Date.now();
        startWaiting = {};
        Object.keys(swimmers)
          .forEach(function(name) {
            if (name == target) return;
            startWaiting[name] = {
              target: target,
              start: ts,
              done: null
            };
          });
       resolve();
      });
    }

    function startSwimmer(target) {
      return new Promise(function(resolve, reject) {
        orchestrator.exchange.swimmers.startSwimmer(target, null)
          .then(function() {
            var interval = setInterval(function() {
              Object.keys(startWaiting)
                .forEach(function(name) {
                  var waiting = startWaiting[name];
                  if (!waiting.done) return;
                  orchestrator.log.info('%s detected arrived in %d (ms)', name, waiting.done);
                  delete startWaiting[name];
                  if (Object.keys(startWaiting).length > 0) return;
                  clearInterval(interval);
                  resolve();
                });
            }, 100);
          })
          .catch(reject);
      });
    }

    function iterate() {
      return new Promise(function(resolve, reject) {
        return orchestrator.exchange.swimmers.listSwimmers()
          .then(function(swimmers) {

            // ?? each swimmer has member list, opportunity to verify sync
            console.log();
            orchestrator.log.info('----> starting iteration %d of %d after %d (ms)', iteration++, iterations, Date.now() - start);
            start = Date.now();

            // randomly select swimmer to stop/start
            var names = Object.keys(swimmers);
            var target = names[randomInt(names.length - 1)];

            return setDepartures(target, swimmers)

              .then(function() {
                return stopSwimmer(target);
              })

              .then(function() {
                return setArrivals(target, swimmers);
              })

              .then(function() {
                return startSwimmer(target);
              })

              .then(resolve)

              .catch(reject)

          })
          .catch(reject);
      });
    }

    Promise.resolve(new Array(iterations)).map(iterate, {concurrency: 1})
      .then(function() {
        done();
      })
      .catch(done);

  });

  // it('endlessly watches for reconnections', function(done) {
  //   console.log();
  //   orchestrator.log.info('----> starting endless wait for stray reconnects');
  //   this.timeout(0);
  // });

});
