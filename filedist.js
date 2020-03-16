/** 
* @description MeshCentral File Distribution Plugin
* @author Ryan Blenis
* @copyright 
* @license Apache-2.0
*/

"use strict";

module.exports.filedist = function (parent) {
    var obj = {};
    obj.parent = parent; // keep a reference to the parent
    obj.meshServer = parent.parent;
    obj.debug = obj.meshServer.debug;
    obj.db = null;
    obj.VIEWS = __dirname + '/views/';
    obj.path = require('path');
    obj.intervalTimer = null;
    obj.exports = [
      'onDeviceRefreshEnd',
      'mapData'
    ];
    var PLUGIN_L = 'filedist';
    var PLUGIN_C = 'FileDist';
    
    obj.sendAllMaps = function(comp, maps) {
        const command = {
            action: 'plugin',
            plugin: 'filedist',
            pluginaction: 'setMaps',
            maps: maps
        };
        try { 
            obj.debug('PLUGIN', PLUGIN_C, 'Sending file maps to ' + comp);
            obj.meshServer.webserver.wsagents[comp].send(JSON.stringify(command)); 
        } catch (e) { 
            obj.debug('PLUGIN', PLUGIN_C, 'Could not send file maps to ' + comp); 
        }
    };
    
    obj.sendMap = function(comp, map) {
        const command = {
            action: 'plugin',
            plugin: 'filedist',
            pluginaction: 'addMap',
            map: map
        };
        try { 
            obj.debug('PLUGIN', PLUGIN_C, 'Sending file map to ' + comp);
            obj.meshServer.webserver.wsagents[comp].send(JSON.stringify(command)); 
        } catch (e) { 
            obj.debug('PLUGIN', PLUGIN_C, 'Could not send file map to ' + comp); 
        }
    };
    
    obj.hook_agentCoreIsStable = function(myparent, gp) { // check for remaps when an agent logs in
        obj.db.getFileMapsForNode(myparent.dbNodeKey)
        .then((maps) => {
            if (maps.length) {
                obj.sendAllMaps(myparent.dbNodeKey, maps);
            }
        })
    };
    
    obj.checkFileSizes = function() {
        // check files to see if they've changed for linked maps
        var onlineAgents = Object.keys(obj.meshServer.webserver.wsagents);
        var checked = [];
        obj.db.getServerFiles()
        .then((maps) => {
            if (maps.length) {
                maps.forEach(function(m) {
                    //console.log('about to check', m.serverpath);
                    if (checked.indexOf(m.serverpath) == -1) {
                        //console.log('actually checking', m.serverpath);
                        var path = obj.getServerFilePath(m.serverpath).fullpath;
                        var sz = 0;
                        try {
                            var fs = require('fs');
                            sz = fs.statSync(path).size;
                        } catch (e) { 
                            sz = null;
                        }
                        if (m.filesize != sz) {
                            //console.log('update filesize for records and re-send maps to nodes', m.filesize, sz)
                            obj.db.updateMany({ type: 'map', serverpath: m.serverpath }, { filesize: sz })
                            .then(() => {
                                // get nodes to send updates to... only online nodes, because offline ones will get new maps when they come online
                                obj.db.getNodesForServerPath(m.serverpath, onlineAgents)
                                .then((maps) => {
                                    if (maps.length) {
                                        maps.forEach(function(ma) {
                                            //console.log('file changed. sending to node');
                                            obj.sendMap(ma.node, ma);
                                        });
                                    }
                                });
                            })
                        }
                        checked.push(m.serverpath);
                    }
                })
            }
        })
    };
    
    obj.resetQueueTimer = function() {
        clearTimeout(obj.intervalTimer);
        obj.intervalTimer = setInterval(obj.checkFileSizes, 1 * 60 * 1000 * 20); // every 20 minutes
    };
    
    obj.server_startup = function() {
        obj.meshServer.pluginHandler.filedist_db = require (__dirname + '/db.js').CreateDB(obj.meshServer);
        obj.db = obj.meshServer.pluginHandler.filedist_db;
        obj.resetQueueTimer();
    };

    obj.onDeviceRefreshEnd = function() {
        pluginHandler.registerPluginTab({
            tabTitle: 'File Distribution ',
            tabId: 'pluginFileDist'
        });
        QA('pluginFileDist', '<iframe id="pluginIframeFileDist" style="width: 100%; height: 800px;" scrolling="no" frameBorder=0 src="/pluginadmin.ashx?pin=filedist&user=1&node='+ currentNode._id +'" />');
    };
    
    obj.mapData = function (message) {
        if (typeof pluginHandler.filedist.loadMaps == 'function') pluginHandler.filedist.loadMaps(message);
    };
    
    obj.handleAdminReq = function(req, res, user) {
        if ((user.siteadmin & 0xFFFFFFFF) == 1 && req.query.admin == 1) 
        {
            // admin wants admin, grant
            var vars = {};
            res.render(obj.VIEWS + 'admin', vars);
            return;
        } else if (req.query.admin == 1 && (user.siteadmin & 0xFFFFFFFF) == 0) {
            // regular user wants admin
            res.sendStatus(401); 
            return;
        } else if (req.query.user == 1) { 
            // regular user wants regular access, grant
            var vars = {};

            // default user view (file maps)
            vars.filemaps = 'null';
            obj.db.getFileMapsForNode(req.query.node)
            .then(maps => {
              vars.filemaps = JSON.stringify(maps);
              res.render(obj.VIEWS + 'user', vars);
            });
            return;
        } else if (req.query.include == 1) {
            switch (req.query.path.split('/').pop().split('.').pop()) {
                case 'css':     res.contentType('text/css'); break;
                case 'js':      res.contentType('text/javascript'); break;
            }
            res.sendFile(__dirname + '/includes/' + req.query.path); // don't freak out. Express covers any path issues.
            return;
        }
        res.sendStatus(401); 
        return;
    };
    
    obj.getServerFilePath = function (path) {
        var splitpath = path.split('/'), serverpath = obj.meshServer.path.join(obj.meshServer.filespath, 'domain'), filename = '';
        var objid = splitpath[0] + '/' + splitpath[1] + '/' + splitpath[2];
        if (splitpath[1] != '') { serverpath += '-' + splitpath[1]; } // Add the domain if needed
        serverpath += ('/' + splitpath[0] + '-' + splitpath[2]);
        for (var i = 3; i < splitpath.length; i++) { if (obj.meshServer.common.IsFilenameValid(splitpath[i]) == true) { serverpath += '/' + splitpath[i]; filename = splitpath[i]; } else { return null; } } // Check that each folder is correct
        return { fullpath: obj.meshServer.path.resolve(obj.meshServer.filespath, serverpath), path: serverpath, name: filename };
    };
    
    obj.sendFile = function(comp, serverpath, clientpath, size) {
        const command = {
            action: 'plugin',
            plugin: PLUGIN_L,
            pluginaction: 'sendFile',
            clientpath: clientpath
        };
        var realPath = obj.getServerFilePath(serverpath);
        try { 
            obj.debug('PLUGIN', PLUGIN_C, 'Sending file to ' + comp);
            var fs = require('fs');
            var path = realPath.fullpath;
            try {
                fs.statSync(path);
                var readStream = fs.createReadStream(path, { encoding: "hex" });
                readStream.on('data', function (chunk) {
                    command.data = chunk;
                    obj.meshServer.webserver.wsagents[comp].send(JSON.stringify(command)); 
                })
                readStream.on('end', function (chunk) {
                    command.data = 'END';
                    obj.meshServer.webserver.wsagents[comp].send(JSON.stringify(command)); 
                })
            } catch (e) {
                obj.debug('PLUGIN', PLUGIN_C, 'Could not send file (' + serverpath + ') to ' + comp + '. File may be missing. Info: ' + e.stack);
            }
        } catch (e) { 
            obj.debug('PLUGIN', PLUGIN_C, 'Could not send file to ' + comp + e.stack); 
        }
    };
    
    obj.updateFrontEnd = async function(ids){
        if (ids.maps != null) {
            obj.db.getFileMapsForNode(ids.nodeId)
            .then((nodeMaps) => {
                var targets = ['*', 'server-users'];
                obj.meshServer.DispatchEvent(targets, obj, { nolog: true, action: 'plugin', plugin: PLUGIN_L, pluginaction: 'mapData', nodeId: ids.nodeId, mapData: nodeMaps });
            });
        }
    };
    
    obj.serveraction = function(command, myparent, grandparent) {
        switch (command.pluginaction) {
            case 'addFileMap':
                var realPath = obj.getServerFilePath(command.spath);
                var sz = 0;
                try {
                    var fs = require('fs');
                    sz = fs.statSync(realPath.fullpath).size;
                } catch (e) { 
                    sz = null;
                }
                obj.db.addFileMap(command.currentNodeId, command.spath, command.cpath, sz)
                .then(() => obj.updateFrontEnd({ maps: true, nodeId: command.currentNodeId }))
                .then(() => {
                    obj.sendMap(command.currentNodeId, { clientpath: command.cpath, filesize: sz });
                })
                .catch(e => console.log('PLUGIN: FileDistribution: Unable to send map'))
            break;
            case 'deleteMap':
                obj.db.delete(command.id)
                .then(() => {
                    obj.updateFrontEnd( { maps: true, nodeId: command.currentNodeId } );
                })
                .catch(e => console.log('PLUGIN: FileDistribution: Unable to delete map'))
            break;
            case 'fetchFile':
                obj.db.findFileForNode(myparent.dbNodeKey, command.clientpath)
                .then(maps => {
                    var map = maps[0];
                    obj.sendFile(map.node, map.serverpath, map.clientpath, map.filesize);
                })
                .catch(e => console.log('PLUGIN: FileDistribution: Could not complete fetchFile', e.stack))
            break;
            default:
                console.log('PLUGIN: FileDistribution: unknown action');
            break;
        }
    };
    
    return obj;
}