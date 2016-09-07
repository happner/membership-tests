
var id = process.argv[2];
var known = process.argv[3];

var PORT = 11000 + parseInt(id);

var hostsToJoin = [];

for (i = 0; i < known; i++){
  hostsToJoin.push('127.0.0.1:' + (11000 + i));
}

var Swim = require('swim');

var opts = {
  local: {
    host: '127.0.0.1:' + PORT,
    meta: {'id': id}, // optional,
    incarnation:Date.now()
  },
  codec: 'msgpack', // optional
  disseminationFactor: 15, // optional
  interval: 100, // optional
  joinTimeout: 200, // optional
  pingTimeout: 20, // optional
  pingReqTimeout: 60, // optional
  pingReqGroupSize: 10, // optional
  udp: {maxDgramSize: 512} // optional
};

//
// var opts = {
//   local: {
//     host: '127.0.0.1:' + PORT,
//     meta: {'id': id} // optional
//   },
//   codec: 'msgpack', // optional
//   disseminationFactor: 15, // optional
//   interval: 100, // optional
//   joinTimeout: 200, // optional
//   pingTimeout: 20, // optional
//   pingReqTimeout: 60, // optional
//   pingReqGroupSize: 3, // optional
//   udp: {maxDgramSize: 512} // optional
// };

var swim = new Swim(opts);


swim.bootstrap(hostsToJoin, function onBootstrap(err) {

  if (err) {
    // error handling
    //console.log('ERROR');;
  }

  // change on membership, e.g. new node or node died/left
  swim.on(Swim.EventType.Change, function onChange(update) {
    console.log('CHANGE:::' + id + ':::' + JSON.stringify(update));
  });
  // update on membership, e.g. node recovered or update on meta data
  swim.on(Swim.EventType.Update, function onUpdate(update) {
    console.log('UPDATE:::' + id + ':::' + JSON.stringify(update));
  });

  console.log('READY:::' + id + ':::{}');

  // shutdown
  //swim.leave();
});

