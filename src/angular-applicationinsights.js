(function (angular) {
/*jshint globalstrict:true*/
'use strict';

	
	var _version='angular-0.0.1';
	var _analyticsServiceUrl = 'https://dc.services.visualstudio.com/v2/track';

	var isDefined = angular.isDefined,
  		isUndefined = angular.isUndefined,
  		isNumber = angular.isNumber,
  		isObject = angular.isObject,
  		isArray = angular.isArray,
  		extend = angular.extend,
  		toJson = angular.toJson,
  		fromJson = angular.fromJson,
  		noop = angular.noop;

  	var	isNullOrUndefined = function(val) {
    	return isUndefined(val) || val === null; 
	};


	var generateGUID = function(){
        var value = [];
        var digits = "0123456789abcdef";
        for (var i = 0; i < 36; i++) {
            value[i] = digits.substr(Math.floor(Math.random() * 0x10), 1);
        }
        value[8] = value[13] = value[18] = value[23] = "-";
        value[14] = "4";
        value[19] = digits.substr((value[19] & 0x3) | 0x8, 1);  
        return value.join("");
	};


	// $log interceptor .. will send log data to application insights, once app insights is 
	// registered. $provide is only available in the config phase, so we need to setup
	// the decorator before app insights is instantiated.
	function LogInterceptor($provide){
		// original functions
		var debugFn,infoFn,warnFn,errorFn,logFn;

		// function to invoke ... initialized to noop
		var interceptFunction = noop;


		this.setInterceptFunction = function(func){
			interceptFunction = func;
		};

		var delegator = function(orignalFn, level){
			return function( ){
				var args    = [].slice.call(arguments);
 
                  // track the call
                  interceptFunction(args[0],level);
                  // Call the original 
                  orignalFn.apply(null, args);
			};
		};

		$provide.decorator( '$log', [ "$delegate", function( $delegate )
        {
                debugFn = $delegate.debug;
 				infoFn = $delegate.info;
 				warnFn = $delegate.warn;
 				errorFn = $delegate.error;
 				logFn = $delegate.log;

                $delegate.debug = delegator(debugFn, 'debug');
                $delegate.info = delegator(infoFn, 'info');
                $delegate.warn = delegator(warnFn, 'warn');
                $delegate.error = delegator(errorFn,'error');
                $delegate.log = delegator(logFn,'log');
 
                return $delegate;
        }]);

	}

	var _logInterceptor;


	var angularAppInsights = angular.module('ApplicationInsightsModule', ['LocalStorageModule']);

	// configure the local storage module 
	angularAppInsights.config(['localStorageServiceProvider','$provide',function (localStorageServiceProvider, $provide) {
  		localStorageServiceProvider
   		 .setPrefix('appInsights')
    	 .setStorageCookie(0,'/');
    	 _logInterceptor = new LogInterceptor($provide);
	}]);


	angularAppInsights.provider('applicationInsightsService', function() {
		// configuration properties for the provider
		var _instrumentationKey = '';
		var _applicationName =''; 
		var _enableAutoPageViewTracking = true;

		// sessionId is generated on initialization 
		// TODO: If non SPA support is needed, then this should have more complex logic
		// otherwise every change of page will generate a new session ID.
		var _sessionId = generateGUID();

		this.configure = function(instrumentationKey, applicationName, enableAutoPageViewTracking){
			_instrumentationKey = instrumentationKey;
			_applicationName = applicationName;
			_enableAutoPageViewTracking = isNullOrUndefined(enableAutoPageViewTracking) ? true : enableAutoPageViewTracking;
		};


		// invoked when the provider is run
		this.$get = ['localStorageService', '$http', '$locale','$window','$location', '$log', function(localStorageService, $http, $locale, $window, $location, $log){	
				return new ApplicationInsights(localStorageService, $http, $locale, $window, $location, $log);
		}];



		// Application Insights implementation
		function ApplicationInsights(localStorage, $http, $locale, $window, $location){

			var _contentType = 'application/json';
			var _namespace = 'Microsoft.ApplicationInsights.';
			var _names = {
  				pageViews: _namespace+'Pageview',
  				traceMessage: _namespace +'Message',
  				events: _namespace +'Event',
  				metrics: _namespace +'Metric'
  			};
  			var _types ={
  				pageViews: _namespace+'PageviewData',
  				traceMessage: _namespace+'MessageData',
  				events: _namespace +'EventData',
  				metrics: _namespace +'MetricData'
  			};

			var getUUID = function(){
				var uuidKey = 'uuid';
				// see if there is already an id stored locally, if not generate a new value
				var uuid =  localStorage.get(uuidKey);
				if(isNullOrUndefined(uuid)){
					uuid = generateGUID();
					localStorage.set(uuidKey, uuid);
				}
				return uuid;
			};

			var sendData = function(data){
				var request = {
					method: 'POST',
					url:_analyticsServiceUrl,
					headers: {
						'Content-Type': _contentType
					},
					data:data
				};

				$http(request);
			};

			var trackPageView = function(pageName){
				var data = generateAppInsightsData(_names.pageViews, 
											_types.pageViews,
											{
												ver: 1,
												url: $location.absUrl(),
												name: isNullOrUndefined(pageName) ? $location.path() : pageName 
											});
				sendData(data);
			};

			var trackEvent = function(eventName){
				var data = generateAppInsightsData(_names.events,
											_types.events,
											{
												ver:1,
												name:eventName
											});
				sendData(data);
			};

			var trackTraceMessage = function(message, level){
				var data = generateAppInsightsData(_names.traceMessage, 
											_types.traceMessage,
											{
												ver: 1,
												message: message,
												severity: level
											});
				sendData(data);
			};

			var trackMetric = function(name, value){
				var data = generateAppInsightsData(_names.metrics, 
												_types.metrics,
												{
													ver: 1,
													metrics: [{name:name,value:value}]
												});
				sendData(data);
			};

			var generateAppInsightsData = function(payloadName, payloadDataType, payloadData){

				return {
					name: payloadName,
					time: new Date().toISOString(),
					ver: 1,
					iKey: _instrumentationKey,
					user: {id: getUUID()},
					session: {
						id: _sessionId
					},
					operation: {
						id: generateGUID()
					},
					device: {
						id: 'browser',
						locale: $locale.id,
						resolution: $window.screen.availWidth +'x'+ $window.screen.availHeight
					},
					internal: {
						sdkVersion: _version
					},
					data:{
						type: payloadDataType,
						item: payloadData
					}
				};
			};

			// set traceTraceMessage as the intercept method of the log decorator
			_logInterceptor.setInterceptFunction(trackTraceMessage);

			// public api surface
			return {
				'trackPageView': trackPageView,
				'trackTraceMessage': trackTraceMessage,
				'trackEvent': trackEvent,
				'trackMetric': trackMetric,
				'applicationName': _applicationName,
				'autoPageViewTracking': _enableAutoPageViewTracking
			};

		}
	})
	// the run block sets up automatic page view tracking
	.run(['$rootScope', '$location', 'applicationInsightsService', function($rootScope,$location,applicationInsightsService){
        $rootScope.$on('$locationChangeSuccess', function() {
           	
           		if(applicationInsightsService.autoPageViewTracking){
                	applicationInsightsService.trackPageView(applicationInsightsService.applicationName + $location.path());
 				}
        });
     }]);

})( window.angular );
