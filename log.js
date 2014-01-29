var syslog = require('node-syslog'),
	fs = require('fs'),
	config = fs.readFileSync(__dirname + '/config.json');

	//Config loading
	try {
		config = JSON.parse(config);
	}
	catch (err) {
		console.log('There has been an error parsing config JSON.')
		console.log(err);
		syslog.init("jsapp-OBSERVER", syslog.LOG_PID | syslog.LOG_ODELAY, syslog.LOG_DAEMON);
		syslog.log(syslog.LOG_ERR, 'jsapp-OBSERVER : There has been an error parsing config JSON. [' + err + ']');
		syslog.close();
		process.exit();
	}

/**
* Main logging function
*/
exports.l = function(module, message, level, always_to_console) {
	if (typeof(level) === 'undefined') {
		level = syslog.LOG_INFO;
	}
	if (typeof(always_to_console) === 'undefined') {
		always_to_console = false;
	}
	if (level == syslog.LOG_ERR) {
		always_to_console = true;
	}
	if (module === 'OBSERVER') {
		always_to_console = true;
	}
	if ( (config.environment === 'develop') || (always_to_console)) {
		console.log("["+module+"]:", message);
	}
	syslog.init("jsapp-" + module, syslog.LOG_PID | syslog.LOG_ODELAY, syslog.LOG_DAEMON);
	syslog.log(level, "jsapp-" + module + ' : ' + message);
	syslog.close();
}