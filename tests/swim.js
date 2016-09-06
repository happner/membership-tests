/* RUN: LOG_LEVEL=off mocha test/18-exchange-promises.js */

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

  __remotes = {};
  __knownRemotes = {};

  var CLUSTER_SIZE = 10;
  var KNOWN_SEGMENT_SIZE = 2;

  var dataLog = {};

  var handleData = function(data){

    var arrData = data.toString().split(':::');
    var operation = arrData[0];
    var nodeid = arrData[1];
    var data = arrData[2];

    if (!dataLog[nodeid]) dataLog[nodeid] = [];

    try{
      data = JSON.parse(data);
    }catch(e){
      console.log('failed parsing:::', data);
    }

    dataLog[nodeid].push({operation:operation, data:data});

    console.log('arrData:::',arrData);

  };

  var startRemoteProc = function(id, callback){

    var timedOut = setTimeout(function(){
      callback(new Error('remote proc start timed out'));
    },5000);

    // spawn remote mesh in another process
    remote = spawn('node', [libFolder + 'remote.js', id, KNOWN_SEGMENT_SIZE]);

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

    async.times(CLUSTER_SIZE, function(id, nodeCB){

      startRemoteProc(id, nodeCB);

    }, done);

  });

  after(function (done) {

    Object.keys(__remotes).forEach(function(id){
      __remotes[id].kill();
      console.log('killed remote:::', id);
    });

    done();

  });

  it('tests stopping a node and reconnecting it, and that the whole collection is notified of this', function(done){

    this.timeout(6000);

    var lastGuy = CLUSTER_SIZE - 1;

    __remotes[lastGuy].kill();

    var failedPropagationCount = 0;
    var successPropagationCount = 0;

    setTimeout(function(){

      startRemoteProc(lastGuy, function(){

        setTimeout(function(){

          console.log('dataLog:::',JSON.stringify(dataLog, null, 2));

          for (var i = 0; i < CLUSTER_SIZE; i++){

            var itemLog = dataLog[i][dataLog[i].length - 1];//get last item log

            console.log('last log:::', itemLog);

            if (itemLog.data.id == lastGuy && itemLog.state > 0) failedPropagationCount++;
            if (itemLog.data.id == lastGuy && itemLog.state == 0) successPropagationCount++;
          }
          
          if (failedPropagationCount == CLUSTER_SIZE - KNOWN_SEGMENT_SIZE) console.log('all items that are not in hostsToJoin did not receive an UPDATE state 0');


          console.log('failed to propagate:::', failedPropagationCount);
          console.log('succeeded in to propagating:::', failedPropagationCount);

          if (successPropagationCount != CLUSTER_SIZE) done(new Error('propagation failed'));
          else done();

        }, 2000);

      });
    }, 2000)
  });

});
