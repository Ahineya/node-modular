var //express = require('express'),
    //app = express(),
    http = require('http'),
    sys = require("sys"),
    server = http.createServer(),
    io = require('socket.io').listen(server),
    fs = require('fs');
    var syslog = require('node-syslog');
    var log = require("../../log");
    var config = fs.readFileSync(__dirname + '/../../config.json');
    clients = [];

	//Config loading 
	try {
        config = JSON.parse(config);
    }
    catch (err) {
        log.l('Router', 'There has been an error parsing config JSON. ' + sys.inspect(err), syslog.LOG_ERR);
        process.exit();
    }

    /*app.configure(function() {
	    app.use(express.methodOverride());
	    app.use(express.bodyParser());
	    app.use(app.router);
	});*/

    //dbUrl = config.dburl;


Array.prototype.remove = function(from, to) {
  var rest = this.slice((to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};

//Starting server on specified port
server.listen(config.port);
/*server.on('connection', function (socket) {
    //socket.end('handled by router');
  console.log('handled by router');
});
process.send('server', io);*/

//console.log('Started on port ' + config.port);
log.l('Router', 'Started on port ' + config.port);

//app.post('/ajax/:module/:action', ajax.process);

//sockets.process(io);

    io.set('transports', [
        , 'flashsocket'
        , 'htmlfile'
        , 'xhr-polling'
        , 'jsonp-polling'
    ]);

    io.set('log level', 1);

    io.sockets.on('connection', function (socket) {
        
        var timeSpent = 0;

        setInterval(function() {
            timeSpent++;
        }, 1000);

        log.l('Router', 'Client connected:'+socket.id);
		clients[socket.id] = socket;
        clients[socket.id]['receivers'] = [];
        var action = [];

    	for (child in config.processes) {
            log.l('Router', 'Child: ' + child, syslog.LOG_DEBUG)
    		for (var i = 0; i<config.processes[child].actions.length; i++) {
                //Binding socket actions to modules
                bindSocketAction(config.processes[child].actions[i], child);
    		}
    	}

        //We need to send disconnect message to all used by socket modules
        clients[socket.id].on('disconnect', function() {
            for (var i = 0; i<clients[socket.id]['receivers'].length; i++) {
                var message = {
                        sender : "",
                        receiver : clients[socket.id]['receivers'][i],
                        m : {action : "disconnect", socket: socket.id}
                }
                process.send(message);
            } 
            delete clients[socket.id];
        });
 
        function bindSocketAction(ac, rec) {
            var action = ac;
            var receiver = rec;

            clients[socket.id].on(action, function(data) {
                var message = {
                        sender : "",
                        receiver : rec,
                        m : {action : action, data: data, socket: socket.id}
                }
                clients[socket.id]['receivers'].push(rec);
                //console.log(message);
                //console.log("Sockets executing: ", action);
                log.l('Router', "Sockets executing: " + action);
                process.send(message);
            });
        }
    });


process.on('message', function(message) {
    log.l('Router', 'received message from ' + message.sender + ': ' + sys.inspect(message));
	if (message.m.action === "emit") {
        if ( (typeof (message.m.socket) !== 'undefined'))  {

            if (message.m.socket in clients) {
                clients[message.m.socket].emit(message.m.data.action, message.m.data.data);
            } else {
                log.l('Router', 'Trying emit into unexistant socket: '+sys.inspect(message),syslog.LOG_ERR);
            }

        } else {
            for (client in clients) {
                if ('emit' in clients[client]) 
                    clients[client].emit(message.m.data.action, message.m.data.data);
            }
        }
	}
});