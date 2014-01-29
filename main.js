var child_process = require('child_process'),
	fs = require("fs"),
	sys = require("sys"),
	syslog = require('node-syslog');
	//config = fs.readFileSync('./config.json');
var	log = require("./log");


/**
*
*	Function loads config file.
*	If live loading, then it kills needed modules.
*
*/
function load_config(callback) {
	//We need to set reloading flag
	//To stop auto-reload of killed here modules
	observer.config_reloading = true;

	//Config loading
	var conf = fs.readFileSync('./config.json');
	try {
		conf = JSON.parse(conf); //Will fail here if config file contents error

		observer.config = conf;
		
		log.l('OBSERVER', 'Current config: ' + sys.inspect(conf));

		//If it isn't first launch and we have already forked processes
		if (observer.processes !== null) {
				//tprocesses - temporary processes
				var tprocesses = observer.config.processes;
				for (child in tprocesses) {
					//If there is a running process
					if ( (child in observer.processes) && (observer.processes[child].instance !== null) ) {
						//Copy it's instance
						tprocesses[child].instance = observer.processes[child].instance;
					}
				}
				for (child in observer.processes) {
					//If new config doesn't have an already runnind process, we need to kill it
					//Live module stopping by deleting from config file
					if (!(child in tprocesses)) {
						observer.processes[child].instance.kill();
					}
				}
				//And replace processes with new set.
				observer.processes = tprocesses;
		} else {
			//First launch only.
			observer.processes = observer.config.processes;
		}

		observer.config_reloading = false;
	}
	catch (err) {
		log.l('OBSERVER', 'There has been an error parsing config JSON. ' + sys.inspect(err), syslog.LOG_ERR);
	}
	if (typeof (callback) === 'function') {
			callback();
	}
}
	

Array.prototype.remove = function(from, to) {
  var rest = this.slice((to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};

isEmptyObject = function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	}

//Main observer object
observer = {

	processes: null,
	message_queue : [],
	saved_states: {},
	//Array of files that watched by observer for live reload
	files: [],
	config: null,
	config_reloading: false,

	"start" : function() {

		load_config( function() {
			for (child in observer.processes) {
				//Starting not started children
				if (observer.processes[child].instance === null) {
					observer.start_child(child);
				}
			}
		
		//Send request for saving data for all children
		setInterval(function() {
			for (child in observer.processes) {
				var message = {
					sender: "observer",
					receiver: child,
					m: {action: "requestSaveData"}
				}
				observer.processes[child].instance.send(message);
			}
		}, 1000 * 60);

		//File watching binding
		for (child in observer.processes) {
			if (observer.processes[child].instance !== null) {
		        child_process.exec('find ' + observer.config.modules_folder + observer.processes[child].file + "/" + ' | grep "\.js$"', function(error, stdout, stderr) {
		            var files = stdout.trim().split("\n");
		            bindWatchFile(child, observer, files);
		        });
		    }
    	}

		fs.unwatchFile("./config.json");
    	fs.watchFile("./config.json", {interval : 500}, function(curr, prev) {
	        if (curr.mtime.valueOf() != prev.mtime.valueOf() || curr.ctime.valueOf() != prev.ctime.valueOf()) {
	            log.l('OBSERVER', 'Deploying new config file', syslog.LOG_INFO, true);
	  			observer.start();
	        }
	    });
	});
		
		
	},
	"start_child" : function(child) {
			var that = this;
			this.processes[child].instance = child_process.fork([observer.config.modules_folder + observer.processes[child].file + "/" + observer.processes[child].file + ".js"]);
			log.l('OBSERVER' , 'Starting child: ' + child, syslog.LOG_INFO, true );

			//Loading module state
			var message = {
				sender: 'OBSERVER',
				receiver: child,
				m: {
					action: 'loadState',
					data: observer.saved_states[child]
				}
			}

			observer.processes[child].instance.send(message);

	        observer.processes[child].instance.addListener('exit', function (code) {
	        	if (!observer.config_reloading ) {
	        		log.l('OBSERVER', 'Child process exited: ' + code);
	        		if (child in observer.config.processes) {
	        			observer.processes[child].instance = null;
	        			observer.start_child(child);
	        		} else {
	        			log.l('OBSERVER', 'Module undeployed: ' + child);
	        		}
	        	}
	        });

	        observer.processes[child].instance.on('message', function(m) {

	        	if (!observer.config_reloading) {
					log.l('OBSERVER', 'got message: ' + sys.inspect(m));
					observer.process_message(m, child, object);
				}
			});
	},
	"process_message" : function(message, sender) {
		message.sender = sender;

		var receiver = message.receiver;

		if (receiver == 'observer') {
			log.l('OBSERVER', 'processing self message: ' + sys.inspect(message));

			//Module request for messages from message queue
			if (message.m.action === 'getMessages') {
				for (var i=0; i<this.message_queue.length; i++) {
					if (this.message_queue[i].receiver === sender) {
						observer.processes[observer.message_queue[i].receiver].instance.send(observer.message_queue[i]);
						observer.message_queue.remove(i);
					}
				}
			}

			//Module request for saving state.
			if (message.m.action === 'saveState') {
				observer.saved_states[message.sender] = message.m.data;
				log.l('OBSERVER', 'SAVESTATE: ' + sys.inspect(message));
			}

		} else {

			//Redirecting message to needed module
			if (message.receiver in observer.processes) {
				var method = observer.processes[message.receiver].message_processing;
				log.l('OBSERVER', 'Sending message: ' + sys.inspect(message), syslog.LOG_INFO);
				switch (method) {
				case "queue":
					observer.message_queue.push(message);
					break;
				case "straight":
				default:
					observer.processes[message.receiver].instance.send(message, object);
					break;
				}
			} else {
				log.l('OBSERVER', 'Sending message to unexistant module', syslog.LOG_ERR);
			}
		}
	}

}

observer.start();


//TODO: rewrite this. We need an autoreload of modules with many files.
function bindWatchFile(_child, _that, _files) {
	var c = _child,
	that = _that,
	files = _files;
	files.forEach(function(file) {

	    observer.files.push(file);

	    fs.watchFile(file, {interval : 500}, function(curr, prev) {
	        if (curr.mtime.valueOf() != prev.mtime.valueOf() || curr.ctime.valueOf() != prev.ctime.valueOf()) {
	            log.l('OBSERVER', 'Restarting because of changed file at ' + file, syslog.LOG_INFO, true);
	            var filename = file.replace(/^.*[\\\/]/, '');

	            filename = filename.replace(".js", "");
	            console.log(c);
	            observer.processes[filename].instance.kill();
	        }
	    });
	});
}

process.on('exit', function() {

	log.l('OBSERVER', 'KILL signal received. Killing children.');

	for (child in observer.processes) {
		log.l('OBSERVER', child + 'killed.');
		observer.processes[child].instance.kill();
	}
});