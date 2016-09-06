var sep = require('path').sep;
var spawn = require('child_process').spawn;
var async = require('async');


describe('tests-remote', function () {

  /**
   * Simon Bishop
   * @type {expect}
   */

  var expect = require('expect.js');
  var libFolder = __dirname + sep + 'lib' + sep;

  this.timeout(120000);

  var __remotes = {};
  var __knownRemotes = {};

  var CLUSTER_SIZE = 10;
  var KNOWN_SEGMENT_SIZE = 2;

  var dataLog = {};

  var handleData = function (data) {

    var arrData = data.toString().split(':::');
    var operation = arrData[0];
    var nodeid = arrData[1];
    var data = arrData[2];

    if (!dataLog[nodeid]) dataLog[nodeid] = [];

    try {
      data = JSON.parse(data);
    } catch (e) {
      console.log('failed parsing:::', data);
    }

    dataLog[nodeid].push({operation: operation, data: data});

  };

  var startRemoteProc = function (id, callback) {

    var timedOut = setTimeout(function () {
      callback(new Error('remote proc start timed out'));
    }, 5000);

    // spawn remote mesh in another process
    var remote = spawn('node', [libFolder + 'remote.js', id, KNOWN_SEGMENT_SIZE]);

    remote.stdout.on('data', handleData);

    remote.stdout.on('data', function (data) {

      if (data.toString().indexOf("READY:::") == 0) {

        clearTimeout(timedOut);

        __remotes[id] = remote;

        if (id < KNOWN_SEGMENT_SIZE) __knownRemotes[id] = remote;

        callback();
      }
    });
  };

  before(function (done) {
    console.log('starting %s swim processes', CLUSTER_SIZE);
    async.times(CLUSTER_SIZE, function (id, nodeCB) {
      startRemoteProc(id, nodeCB);
    }, done);
  });

  after(function (done) {
    Object.keys(__remotes).forEach(function (id) {
      __remotes[id].kill();
    });
    done();
  });

  it('tests stopping a node and reconnecting it, and that the whole collection is notified of this', function (done) {

    this.timeout(6000);

    var lastMember = CLUSTER_SIZE - 1;

    console.log('stopping %sth member', lastMember + 1); // one not in hostsToJoin
    __remotes[lastMember].kill();

    var failedPropagationCount = 0;
    var successPropagationCount = 0;

    setTimeout(function () {
      console.log('verifying all notified of departed %sth member', lastMember + 1);

      var notifiedOfDeparted = [];

      for (var i = 0; i < CLUSTER_SIZE; i++) {
        if (i == lastMember) continue;
        var lastLogItem = dataLog[i][dataLog[i].length - 1];

        if (lastLogItem.operation == 'READY') {
          return done(new Error('member ' + i + ' received no notifications since start (different problem)'));
        }

        if (lastLogItem.data.meta.id == lastMember && lastLogItem.data.state == 2) {
          notifiedOfDeparted.push(i);
        }
      }

      //
      // This **consistently succeeds** with all members
      // receiving last members departure notice
      //
      expect(notifiedOfDeparted).to.eql([0,1,2,3,4,5,6,7,8]);


      console.log('restarting %sth member', lastMember + 1);
      startRemoteProc(lastMember, function () {

        setTimeout(function () {
          console.log('verifying all notified of resumed %sth member', lastMember + 1);

          // list of members notified of last member's return
          var notifiedOfReturned = [];

          for (var i = 0; i < CLUSTER_SIZE; i++) {
            if (i == lastMember) continue;
            var lastLogItem = dataLog[i][dataLog[i].length - 1];

            if (lastLogItem.operation == 'READY') {
              return done(new Error('member ' + i + ' received no notifications since start (different problem)'));
            }

            if (lastLogItem.data.meta.id == lastMember && lastLogItem.data.state == 0) {
              notifiedOfReturned.push(i);
            }
          }

          //
          // This **consistently fails** with **only** members in the
          // "hostsToJoin" list ever receiving the returned notification
          //
          expect(notifiedOfReturned).to.eql([0,1,2,3,4,5,6,7,8]);


        }, 2000);
      });
    }, 2000);

  });

});
