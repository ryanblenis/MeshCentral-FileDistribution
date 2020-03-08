/** 
* @description MeshCentral FileDistribution plugin
* @author Ryan Blenis
* @copyright 
* @license Apache-2.0
*/

"use strict";
var mesh;
var obj = this;
var _sessionid;
var isWsconnection = false;
var wscon = null;
var db = require('SimpleDataStore').Shared();
var debug_flag = false;
var periodicFileIntegrityTimer = null;
var fileMaps = {};

var fs = require('fs');
var os = require('os');
var net = require('net');
var http = require('http');
var fileBuffer = {};
var lastRun = null;

var dbg = function(str) {
    if (debug_flag !== true) return;
    var fs = require('fs');
    var logStream = fs.createWriteStream('filedist.txt', {'flags': 'a'});
    // use {'flags': 'a'} to append and {'flags': 'w'} to erase and write a new file
    logStream.write('\n'+new Date().toLocaleString()+': '+ str);
    logStream.end('\n');
}

if (periodicFileIntegrityTimer == null) { periodicFileIntegrityTimer = setInterval(verifyFiles, 1*60*1000*20); } // 20 minute(s)

Array.prototype.remove = function(from, to) {
  var rest = this.slice((to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};

function consoleaction(args, rights, sessionid, parent) {
    isWsconnection = false;
    wscon = parent;
    _sessionid = sessionid;
    if (typeof args['_'] == 'undefined') {
      args['_'] = [];
      args['_'][1] = args.pluginaction;
      args['_'][2] = null;
      args['_'][3] = null;
      args['_'][4] = null;
      isWsconnection = true;
    }
    
    var fnname = args['_'][1];
    mesh = parent;
    
    switch (fnname) {
        case 'setMaps':
            dbg('resetting maps');
            var maps = args.maps;
            maps.forEach(function(m) {
                saveFileVerification({ clientpath: m.clientpath, filesize: m.filesize });
            });
            verifyFiles();
        break;
        case 'addMap':
            dbg('adding map '+ JSON.stringify(args.map));
            var m = args.map;
            saveFileVerification({ clientpath: m.clientpath, filesize: m.filesize });
            fetchFile(m.clientpath);
        break;
        case 'sendFile':
            try {
                var fn = args.clientpath;
                if (args.data == 'END') {
                    //dbg('ending');
                    if (fileBuffer[fn] != null) {
                        //dbg('nnending');
                        fileBuffer[fn].end(); 
                        fileBuffer[fn] = null;
                    }
                    delete fileBuffer[fn];
                    return;
                }
                if (fileBuffer[fn] == null) {
                    fileBuffer[fn] = fs.createWriteStream(fn, { flags: 'wb' });
                }
                
                var buf = Buffer.from(args.data, "hex");
                fileBuffer[fn].write(buf);
                
            } catch(e) {
                dbg('Couldnt do it' + e.stack);
            }
        break;
        default:
            dbg('Unknown action: '+ fnname + ' with data ' + JSON.stringify(args));
        break;
    }
}
function fetchFile(cPath) {
    mesh.SendCommand({ 
        "action": "plugin", 
        "plugin": "filedist",
        "pluginaction": "fetchFile",
        "clientpath": cPath,
        "sessionid": _sessionid,
        "tag": "console"
    });
}
function saveFileVerification(fObj) {
    fileMaps[fObj.clientpath] = fObj.filesize;
}
function verifyFiles() {
    dbg('verifying files')
    var now = Math.floor(new Date() / 1000);
    if (lastRun == null || ((now - lastRun) > 10)) {
        lastRun = now;
    } else return;
    if (fileMaps == null || fileMaps == false || fileMaps == {}) return;
    var configs = fileMaps;
    //if (configs == false) return;
    
    Object.getOwnPropertyNames(configs).forEach(function(file) {
      var size = configs[file];
      verifyFile(file, size);
    });
}
function verifyFile(fn, sz) {
    // we're using size of file here because hashing doesn't appear easily available in the MeshAgent
    dbg('verfying file '+ fn);
    var z = 0;
    try {
        var fs = require('fs');
        z = fs.statSync(fn);
    } catch (e) { 
        z = null;
    }
    try {
        if (z.size == sz) {
            dbg('verified'); // ok, do nothing
        } else {
            dbg('size not right, get again'); // get latest file
            fetchFile(fn);
        }
    } catch (e) {
        dbg('file does not exist, getting');
        fetchFile(fn);
    }
}
function sendConsoleText(text, sessionid) {
    if (typeof text == 'object') { text = JSON.stringify(text); }
    mesh.SendCommand({ "action": "msg", "type": "console", "value": text, "sessionid": sessionid });
}

module.exports = { consoleaction : consoleaction };