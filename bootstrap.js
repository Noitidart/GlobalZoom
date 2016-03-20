// Imports
const {classes: Cc, interfaces: Ci, manager: Cm, results: Cr, utils: Cu, Constructor: CC} = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

// Globals
var core = { // core has stuff added into by MainWorker (currently MainWorker) and then it is updated
	addon: {
		name: 'GlobalZoom',
		id: 'GlobalZoom@jetpack',
		// path: {
		// 	name: 'globalzoom',
		// 	content: 'chrome://globalzoom/content/',
		// 	locale: 'chrome://globalzoom/content/locale/'
		// },
		// prefbranch: 'extensions.GlobalZoom@jetpack.',
		// prefs: {},
		// cache_key: Math.random() // set to version on release
	},
	// os: {
	// 	name: OS.Constants.Sys.Name.toLowerCase(),
	// 	toolkit: Services.appinfo.widgetToolkit.toLowerCase(),
	// 	xpcomabi: Services.appinfo.XPCOMABI
	// },
	// firefox: {
	// 	pid: Services.appinfo.processID,
	// 	version: Services.appinfo.version
	// }
};

var BOOTSTRAP = this;
var CPS2;

// start - addon functionalities
//start obs stuff
var gObserves = {
	observers: {
		'browser-fullZoom:zoomReset': function (aSubject, aTopic, aData) {

			
			// have to do this because see link99993
			CPS2.setGlobal('browser.content.full-zoom', 1, null, {
				handleResult: function() {

				},
				handleCompletion: function() {

				}
			});
		},
		'browser-fullZoom:zoomChange': function (aSubject, aTopic, aData) {

			
			var newZoom = Services.wm.getMostRecentWindow(null).ZoomManager.zoom;

			
			CPS2.setGlobal('browser.content.full-zoom', newZoom, null, {
				handleResult: function() {

				},
				handleCompletion: function() {

					removeAllButGlobal(); // i put in the oncomplete, so it doesnt change it to what ever global is then bounce back to this new value
				}
			});
		}
	},
	init: function() {

		for (var o in this.observers) {

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

function removeAllButGlobal() {
	
	var domainsToRemoveFor = [];
	CPS2.getByName('browser.content.full-zoom', null, {
		handleResult: function(aPref) {

			if (aPref.domain) {
				domainsToRemoveFor.push(aPref.domain);
			} // else its null, so that means its the global value
		},
		handleCompletion: function() {

			
			for (var i=0; i<domainsToRemoveFor.length; i++) {

				CPS2.removeByDomainAndName(domainsToRemoveFor[i], 'browser.content.full-zoom', null);
			}
		}
	});
}

// end - addon functionalities


function install() {}
function uninstall(aData, aReason) {

	if (aReason == ADDON_UNINSTALL) {
		// reset the global zoom back to 1, otherwise when user resets zoom, then it will go to whatever was the last global setting
		CPS2.removeByName('browser.content.full-zoom', null, {
			handleResult: function() {

			},
			handleCompletion: function() {

			}
		});
	}
}

function startup(aData, aReason) {
	
	Services.prefs.setBoolPref('browser.zoom.siteSpecific', true);
	Services.prefs.setBoolPref('browser.zoom.updateBackgroundTabs', true); // i dont have to set thsi true, but if i dont then things arent instant, so lets just do it, as users might somehow have a false value
	
	CPS2 = Cc['@mozilla.org/content-pref/service;1'].getService(Ci.nsIContentPrefService2);
	
	// remove all currently site site specific stuff - this will instantly (because observers are setup by the FullZoom module) change zoom to the global value default of 1 per dxr - https://dxr.mozilla.org/mozilla-central/source/browser/base/content/browser-fullZoom.js#281 - `value === undefined ? 1 : value` because value there is the global default value, but this call will remove the global value as well // link99993
	/*
	// i dont do this way anymore, because this will remove the global setting as well. so i get all names and remove all but the global one, which is the one with null for domain in `removeAllButGlobal`
	CPS2.setGlobal('browser.content.full-zoom', 1, null, {
		handleResult: function() {

		},
		handleCompletion: function() {

		}
	});
	*/
	removeAllButGlobal();
	
	/* no need to instantiate it, why do it? because then on next browser startups with this addon installed then it will overwrite the previous value. and it has a default value anyways of 1 when all things of csp are cleared see dxr code on link99993
	// instantitate global zoom at 1, because thats the default value see - link99993
	CPS2.setGlobal('browser.content.full-zoom', 1, null, {
		handleResult: function() {

		},
		handleCompletion: function() {

		}
	});
	*/
	
	// because a reset happens to the global value of CPS2 I have to hack up reset to use 1
	// set up observer so that on user change of zoom, i should put that value to global, and clear the site specific value created
	gObserves.init();
	
	
	
}

function shutdown(aData, aReason) {
	if (aReason == APP_SHUTDOWN) { return }

	gObserves.uninit();
	

	if (aReason == ADDON_DISABLE) {
		// reset the global zoom back to 1, otherwise when user resets zoom, then it will go to whatever was the last global setting
		CPS2.removeByName('browser.content.full-zoom', null, {
			handleResult: function() {

			},
			handleCompletion: function() {

			}
		});
	}
}