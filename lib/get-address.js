/**
 * Created by nomilous on 2016/09/11.
 */

var os = require('os');

// spec = eth0/IPv4/0
// ie. first IPv4 address on eth0

module.exports = function(spec) {

  var parts = spec.split('/');
  var iface = parts[0];
  var ipVersion = parts[1];
  var addressSeq = parseInt(parts[2]);

  if (ipVersion.toLowerCase() !== 'ipv4' && ipVersion.toLowerCase() !== 'ipv6') {
    throw new Error('no such ip version: ' + ipVersion);
  }

  var interfaces = os.networkInterfaces();

  if (!interfaces.hasOwnProperty(iface)) {
    throw new Error('no such interface: ' + iface);
  }

  var iterSeq = 0;
  for (var i = 0; i < interfaces[iface].length; i++) {
    var address = interfaces[iface][i];
    if (address.family.toLowerCase() !== ipVersion.toLowerCase()) continue;
    if (iterSeq == addressSeq) return address.address;
    iterSeq++;
  }

  throw new Error('no such interface: ' + spec);
};
