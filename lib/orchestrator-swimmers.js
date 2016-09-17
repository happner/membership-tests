/**
 * Created by nomilous on 2016/09/10.
 */

module.exports = OrchestratorSwimmers;

var Promise = require('bluebird');

var randomInt = require('random-int');

function OrchestratorSwimmers() {
  this.swimmers = {};
  this.members = {};
  this.purgeMembersInterval = null;
  this.purgeSwimmersInterval = null;
}

OrchestratorSwimmers.prototype.start = function($happn, callback) {
  var _this = this;
  this.purgeMembersInterval = setInterval(function() {
    var ts = Date.now();
    Object.keys(_this.members).forEach(function(name) {
      if (_this.members[name].seenAt > ts - 10000) return;
      $happn.log.warn('member %s removed (%d)', name, Object.keys(_this.members).length);
      delete _this.members[name];
    });
  }, 1000);
  this.purgeSwimmersInterval = setInterval(function() {
    var ts = Date.now();
    Object.keys(_this.swimmers).forEach(function(name) {
      if (_this.swimmers[name].startWaiting) return;
      if (_this.swimmers[name].seenAt > ts - 10000) return;
      $happn.log.warn('swimmer %s removed (%d)', name, Object.keys(_this.swimmers).length);
      delete _this.swimmers[name];
    });
  }, 1000);
  callback();
};

OrchestratorSwimmers.prototype.stop = function($happn, callback) {
  clearInterval(this.purgeMembersInterval);
  clearInterval(this.purgeSwimmersInterval);
  callback();
};

OrchestratorSwimmers.prototype.registerMember = function($happn, member, callback) {
  this.members[member.name] = member;
  var ts = Date.now();
  member.swimming = false;
  member.seenAt = ts;
  $happn.log.info('member %s connected (%d)', member.name, Object.keys(this.members).length);
  return callback(null, {opts: {}});
};

OrchestratorSwimmers.prototype.pingMember = function($happn, member, callback) {
  var ts = Date.now();
  if (!this.members[member.name]) return callback(new Error('Missing member'));
  this.members[member.name].seenAt = ts;
  callback();
};

OrchestratorSwimmers.prototype.listMembers = function($happn, callback) {
  callback(null, this.members);
};

OrchestratorSwimmers.prototype.listSwimmers = function($happn, callback) {
  callback(null, this.swimmers);
};

OrchestratorSwimmers.prototype.startSwimmer = function($happn, name, config, callback) {
  var _this = this;
  $happn.log.info('starting swimmer %s', name);

  config = config || this.config;

  var hostsToJoin = [];
  var swimmersHosts = Object.keys(this.swimmers).map(function(name) {
    return _this.swimmers[name].host;
  });

  while (hostsToJoin.length < 3) {
    if (hostsToJoin.length == swimmersHosts.length) break;
    var host = swimmersHosts[randomInt(swimmersHosts.length - 1)];
    if (hostsToJoin.indexOf(host) >= 0) continue;
    hostsToJoin.push(host);
  }

  $happn.emit('cluster/log', {level: 'info', args: ['starting swimmer %s', name]});
  $happn.emit('member/' + name + '/startSwimmer', {
    config: config,
    hostsToJoin: hostsToJoin
  });

  this.members[name].swimmerStartWaiting = function(error) {
    if (error) {
      $happn.log.error('starting swimmer %s', name, error);
      $happn.emit('cluster/log', {level: 'error', args: ['starting swimmer %s', name, error]});
      delete _this.swimmers[name];
      return callback(error);
    }
    $happn.log.info('swimmer %s connected (%d)', name, Object.keys(_this.swimmers).length);
    $happn.emit('cluster/log', {level: 'info', args: ['swimmer %s connected (%d)', name, Object.keys(_this.swimmers).length]});
    delete _this.members[name].swimmerStartWaiting;
    _this.swimmers[name].seenAt = Date.now();
    callback();
  }
};

OrchestratorSwimmers.prototype.pingSwimmer = function($happn, name, data, callback) {
  if (!this.members[name]) return callback();
  if (!this.swimmers[name]) this.swimmers[name] = {
    host: this.members[name].host
  }
  this.swimmers[name].seenAt = Date.now();
  this.swimmers[name].memberList = data.memberList;
  if (!this.members[name].swimmerStartWaiting) return callback();
  this.members[name].swimmerStartWaiting();
  callback();
};

OrchestratorSwimmers.prototype.onIncarnation = function($happn, name, incarnation, callback) {
  $happn.log.warn('swimmer %s updated incarnation %d', name, incarnation);
  $happn.emit('cluster/log', {level: 'warn', args: ['swimmer %s updated incarnation %d', name, incarnation]});
  callback();
};

OrchestratorSwimmers.prototype.onChange = function($happn, name, update, callback) {
  var subject = update.meta.name;
  var level = 'warn';
  // var expected = typeof this.swimmers[subject] == 'undefined';
  // if (!expected) level = 'error';
  if (update.state == 0) {
    $happn.log[level]('(change) %s added %s', name, subject);
    // if (level == 'error') {
      $happn.emit('cluster/log', {level: level, args: ['(change) %s added %s', name, subject]});
    // }
    $happn.emit('swimmer/arrives', {
      at: name,
      subject: subject
    });
  }
  if (update.state == 2) {
    $happn.log[level]('(change) %s removed %s', name, subject);
    // if (level == 'error') {
      $happn.emit('cluster/log', {level: level, args: ['(change) %s removed %s', name, subject]});
    // }
    $happn.emit('swimmer/departs', {
      at: name,
      subject: subject
    });
  }
  callback();
};

OrchestratorSwimmers.prototype.onUpdate = function($happn, name, update, callback) {
  var subject = update.meta.name;
  var level = 'warn';
  // var expected = typeof this.swimmers[subject] == 'undefined';
  // if (!expected) level = 'error';
  if (update.state == 0) {
    $happn.log[level]('(update) %s added %s', name, subject);
    // if (level == 'error') {
      $happn.emit('cluster/log', {level: level, args: ['(update) %s added %s', name, subject]});
    // }
    $happn.emit('swimmer/arrives', {
      at: name,
      subject: subject
    });
  }
  if (update.state == 2) {
    $happn.log[level]('(update) %s removed %s', name, subject);
    // if (level == 'error') {
      $happn.emit('cluster/log', {level: level, args: ['(update) %s removed %s', name, subject]});
    // }
    $happn.emit('swimmer/departs', {
      at: name,
      subject: subject
    });
  }
  callback();
};

OrchestratorSwimmers.prototype.failedSwimmer = function(name, error, callback) {
  if (!this.members[name]) return callback();
  if (!this.members[name].swimmerStartWaiting) return callback();
  this.members[name].swimmerStartWaiting(error);
  delete this.swimmers[name];
  callback();
};

OrchestratorSwimmers.prototype.startCluster = function($happn, config, callback) {
  var memberList = Object.keys(this.members), _this = this;
  if (memberList.length < 3) {
    return callback(new Error('insufficient members for cluster'));
  }

  this.config = config;

  // start happens in background
  // use isClusterSynchronized() to know when all running
  callback();

  // start first 3 one at a time
  Promise.resolve(memberList.slice(0, 3)).map(function(name) {
    return new Promise(function(resolve, reject) {
      _this.startSwimmer($happn, name, config, function(error) {
        if (error) return reject(error);
        resolve();
      });
    });
  }, {concurrency: 1})
    .then(function() {
      return Promise.resolve(memberList.slice(3)).map(function(name) {
        return new Promise(function(resolve, reject) {
          _this.startSwimmer($happn, name, config, function(error) {
            if (error) return reject(error);
            resolve();
          });
        });
      }, {concurrency: 5})
    })
    .catch(function(error) {
      $happn.emit('cluster/log', {level: 'error', args: ['starting cluster: %s', error.toString()]});
    });
};

OrchestratorSwimmers.prototype.isClusterSynchronized = function($happn, callback) {
  var members = Object.keys(this.members), _this = this;
  var synchronized = true;

  members.forEach(function(name) {
    var swimmer = _this.swimmers[name];
    if (!swimmer) {
      synchronized = false;
      return;
    }
    var memberList = swimmer.memberList;
    if (!memberList) {
      synchronized = false;
      return;
    }
    var swimmers = memberList.filter(function(swimmer) {
      return swimmer.state == 0;
    }).map(function(swimmer) {
      return swimmer.meta.name;
    });
    members.forEach(function(gotName) {
      if (gotName == name) return; // self
      if (swimmers.indexOf(gotName) < 0) synchronized = false;
    });
  });

  callback(null, synchronized);
};

OrchestratorSwimmers.prototype.stopCluster = function($happn, callback) {
  var swimmers = Object.keys(this.swimmers), _this = this;
  Promise.resolve(swimmers).map(function(name) {
    return new Promise(function(resolve, reject) {
      _this.stopSwimmer($happn, name, function(error) {
        if (error) return reject(error);
        resolve();
      })
    });
  })
    .then(function() {
      callback();
    })
    .catch(callback);
};

OrchestratorSwimmers.prototype.stopSwimmer = function($happn, name, callback) {
  var member = this.members[name], _this = this;
  if (!member) return callback();
  member.stopSwimmerWaiting = callback;
  $happn.emit('swimmer/' + name + '/stop');
};

OrchestratorSwimmers.prototype.stoppedSwimmer = function($happn, name, callback) {
  delete this.swimmers[name];
  if (this.members[name] && this.members[name].stopSwimmerWaiting) {
    this.members[name].stopSwimmerWaiting();
  }
  callback();
};
