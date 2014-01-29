var syslog = require('node-syslog');
var	log = require("../../log");
var	sys = require("sys");

var state_loaded = false;


setInterval(function() {

	if(state_loaded)
		log.l('test', 'Testing module');


}, 5000);


process.on('message', function(m) {
	console.log('Test received message from ', m.sender, ': ' , m);

	//This action can be accessed by sockets,
	//because it has a declaration in config
	if (m.m.action === 'test-example') {
		console.log("Example action processing.");
	}

	if (m.m.action === 'loadState') {
		log.l('test', 'State loaded: ' + sys.inspect(m.m.data));
		state_loaded = true;
	}

	//If module have this action, it can send it's data to observer to store it.
	if (m.m.action === 'requestSaveData') {
		var message = {  
			sender: null,
			receiver: 'observer',  
			m: {
				action: 'saveState',
				data: {
					test: "test" 
				}
			}
		}

		process.send(message);
		log.l('test', 'Save data request');
	}

	//Every module that works with sockets, can implement 'disconnect' action.
	//It will execute when the client disconnects.
	if (m.m.action === 'disconnect') {
		log.l('test', 'on socket disconnected');
	}


});