// Imports
const {classes: Cc, interfaces: Ci, manager: Cm, results: Cr, utils: Cu, Constructor: CC} = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

// Globals
var BOOTSTRAP = this;
var CPS2;

// start - addon functionalities
//start obs stuff
var gObserves = {
	observers: {
		'browser-fullZoom:zoomReset': function (aSubject, aTopic, aData) {
			console.log('zoom reset!', aSubject, aTopic, aData);
			
			// have to do this because see link99993
			CPS2.setGlobal('browser.content.full-zoom', 1, null);
		},
		'browser-fullZoom:zoomChange': function (aSubject, aTopic, aData) {
			console.log('zoom changed!', aSubject, aTopic, aData);
			
			var newZoom = Services.wm.getMostRecentWindow(null).ZoomManager.zoom;
			console.log('newZoom:', newZoom);
			
			applyZoomToAllDomains(newZoom);
			
		}
	},
	init: function() {
		console.log('this.observers:', this.observers);
		for (var o in this.observers) {
			console.log('initing o:', o);
			// run extra `reg` BEFORE // link3253644144442177
			if (this.observers[o].reg) {
				this.observers[o].reg();
			}
			
			// register it
			// make it an object so i can addObserver and removeObserver to it
			this.observers[o] = {
				observe: this.observers[o]
			};
			Services.obs.addObserver(this.observers[o], o, false);
		}
	},
	uninit: function() {
		for (var o in this.observers) {
			// unregister it
			Services.obs.removeObserver(this.observers[o], o);
			
			// run extra `unreg` AFTER // link3253644144442177
			if (this.observers[o].unreg) {
				this.observers[o].unreg();
			}
		}
	}
}
//end obs stuff
function applyZoomToAllDomains(aNewZoom, boolDontSetGlobal, boolRemoveAll) {
	// sets the zoom level of all currently open domains to aNewZoom
		// including global zoom value
	
	// get all currently open domains, and set site specific for each domain so they update in background, then remove all
	var allDomains = new Set();
	var domWins = Services.wm.getEnumerator('navigator:browser');
	while (domWins.hasMoreElements()) {
		var domWin = domWins.getNext();
		var gbrowser = domWin.gBrowser;
		var cntBrowsers = gbrowser.browsers;
		for (var i=0; i<cntBrowsers; i++) {
			// e10s safe way to check uri of all browsers
			console.log(i, gbrowser.browsers[i].currentURI.spec);
			allDomains.add(CPS2.extractDomain(gbrowser.browsers[i].currentURI.spec));
		}
	}
	
	var promiseAllArr_siteSpecificSet = [];
	allDomains.forEach(function(domain) {
		var deferred_siteSpecificSet = new Deferred();
		promiseAllArr_siteSpecificSet.push(promiseAllArr_siteSpecificSet.promise);
		
		// set zoom for this domain
		CPS2.set(domain, 'browser.content.full-zoom', aNewZoom, null, {
			handleCompletion: function() {
				console.log('ok set for domain', domain, 'args:', arguments[0].domain);
				deferred_siteSpecificSet.resolve();
			}
		});
	});
	
	if (!boolDontSetGlobal) {
		var deferred_globalSet = new Deferred();
		promiseAllArr_siteSpecificSet.push(deferred_globalSet.promise);
		CPS2.setGlobal('browser.content.full-zoom', aNewZoom, null, {
			handleCompletion: function() {
				console.log('ok complete, args:', arguments);
				// remove all site specific so each zoom goes to the global value of the one i just set
				deferred_globalSet.resolve(); // i put in the oncomplete, so it doesnt change it to what ever global is then bounce back to this new value
			}
		});
	}
	
	var promiseAll_siteSpecificSet = Promise.all(promiseAllArr_siteSpecificSet);
	promiseAll_siteSpecificSet.then(
		function(aVal) {
			console.log('Fullfilled - promiseAll_siteSpecificSet - ', aVal);
			
			if (boolRemoveAll) {
				CPS2.removeByName('browser.content.full-zoom', null);
			} else {
				// remove all site specific so each zoom goes to the global value of the one i just set
				removeAllButGlobal(); // i put in the oncomplete, so it doesnt change it to what ever global is then bounce back to this new value
			}
		},
		genericReject.bind(null, 'promiseAll_siteSpecificSet', 0)
	).catch(genericCatch.bind(null, 'promiseAll_siteSpecificSet', 0));
}

function removeAllButGlobal() {
	
	var domainsToRemoveFor = [];
	CPS2.getByName('browser.content.full-zoom', null, {
		handleResult: function(aPref) {
			console.log('in handle result, args:', arguments)
			if (aPref.domain) {
				domainsToRemoveFor.push(aPref.domain);
			} // else its null, so that means its the global value
		},
		handleCompletion: function() {
			console.log('ok complete, args:', arguments)
			
			for (var i=0; i<domainsToRemoveFor.length; i++) {
				console.log('removing for domain:', domainsToRemoveFor[i]);
				CPS2.removeByDomainAndName(domainsToRemoveFor[i], 'browser.content.full-zoom', null);
			}
		}
	});
}

// end - addon functionalities


function install() {}
function uninstall(aData, aReason) {
	console.log('uninstall aReason:', aReason);
	if (aReason == ADDON_UNINSTALL) {
		// reset the global zoom back to 1, otherwise when user resets zoom, then it will go to whatever was the last global setting
		applyZoomToAllDomains(1, true, true);
	}
}

function startup(aData, aReason) {
	
	Services.prefs.setBoolPref('browser.zoom.siteSpecific', true);
	Services.prefs.setBoolPref('browser.zoom.updateBackgroundTabs', true); // i dont have to to this, if i dont, then things will update on tab focus. but its better for users, its what they expect. some novices might have this not set and will wonder why a window in the background didnt change zoom, even on focus, until they chagne tab then change back
	
	CPS2 = Cc['@mozilla.org/content-pref/service;1'].getService(Ci.nsIContentPrefService2);
	
	// remove all currently site site specific stuff - this will instantly (because observers are setup by the FullZoom module) change zoom to the global value default of 1 per dxr - https://dxr.mozilla.org/mozilla-central/source/browser/base/content/browser-fullZoom.js#281 - `value === undefined ? 1 : value` because value there is the global default value // link99993
	removeAllButGlobal();
	
	// because a reset happens to the global value of CPS2 I have to hack up reset to use 1
	// set up observer so that on user change of zoom, i should put that value to global, and clear the site specific value created
	gObserves.init();
	
	
	
}

function shutdown(aData, aReason) {
	if (aReason == APP_SHUTDOWN) { return }

	gObserves.uninit();
	
	console.log('shutdown aReason:', aReason);
	if (aReason == ADDON_DISABLE) {
		// reset the global zoom back to 1, otherwise when user resets zoom, then it will go to whatever was the last global setting
		applyZoomToAllDomains(1, true, true);
	}
}

// start - common helper functions
function Deferred() { // rev3 - https://gist.github.com/Noitidart/326f1282c780e3cb7390
	// update 062115 for typeof
	if (typeof(Promise) != 'undefined' && Promise.defer) {
		//need import of Promise.jsm for example: Cu.import('resource:/gree/modules/Promise.jsm');
		return Promise.defer();
	} else if (typeof(PromiseUtils) != 'undefined'  && PromiseUtils.defer) {
		//need import of PromiseUtils.jsm for example: Cu.import('resource:/gree/modules/PromiseUtils.jsm');
		return PromiseUtils.defer();
	} else {
		/* A method to resolve the associated Promise with the value passed.
		 * If the promise is already settled it does nothing.
		 *
		 * @param {anything} value : This value is used to resolve the promise
		 * If the value is a Promise then the associated promise assumes the state
		 * of Promise passed as value.
		 */
		this.resolve = null;

		/* A method to reject the assocaited Promise with the value passed.
		 * If the promise is already settled it does nothing.
		 *
		 * @param {anything} reason: The reason for the rejection of the Promise.
		 * Generally its an Error object. If however a Promise is passed, then the Promise
		 * itself will be the reason for rejection no matter the state of the Promise.
		 */
		this.reject = null;

		/* A newly created Pomise object.
		 * Initially in pending state.
		 */
		this.promise = new Promise(function(resolve, reject) {
			this.resolve = resolve;
			this.reject = reject;
		}.bind(this));
		Object.freeze(this);
	}
}
function genericReject(aPromiseName, aPromiseToReject, aReason) {
	var rejObj = {
		name: aPromiseName,
		aReason: aReason
	};
	console.error('Rejected - ' + aPromiseName + ' - ', rejObj);
	if (aPromiseToReject) {
		aPromiseToReject.reject(rejObj);
	}
}
function genericCatch(aPromiseName, aPromiseToReject, aCaught) {
	var rejObj = {
		name: aPromiseName,
		aCaught: aCaught
	};
	console.error('Caught - ' + aPromiseName + ' - ', rejObj);
	if (aPromiseToReject) {
		aPromiseToReject.reject(rejObj);
	}
}
// end - common helper functions