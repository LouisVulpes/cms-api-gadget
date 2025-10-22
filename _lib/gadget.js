/* gadget.js (gadgetlib.js) */

(function (gadgetWindow) {

    function getEnvironment() {

      return sendMessageToTop('get-environment');

    }

    function getDataFromUrl() {

      var data = {};

      var split = location.href.split(/[\?&]/);

      var paramArray = split.splice(1);

      data.url = split[0];

      for (var param of paramArray) {

        var parts = param.split('=');

        data[parts[0]] = parts[1];

      }

      return data;

    }

    function sendMessageToTop(name, payload) {

      var deferred = null;

      var msgid = Math.random().toString().slice(2);

      var message = {

        name : name, 
        gid : gadget.gid,
        origin : gadget.url,
        token : gadget.token,
        place : gadget.place,
        payload : payload,
        callback : msgid,

      };

      deferred = new $.Deferred();

      var _messageHandler = function (event) {

        if (event.origin != gadget.msghost) return;

        var message = event.data;

        if (typeof message == 'string') {

          try {

            message = JSON.parse(message);

          }

          catch (e) {

            console.log('Cannot parse message from OU Campus app : ', message);

            return;

          }

        }

        if (message.callback == msgid) {

          window.removeEventListener('message', _messageHandler, false);

          deferred.resolve(message.payload);

        }

      };

      window.addEventListener('message', _messageHandler, false);

      window.top.postMessage(JSON.stringify(message), gadget.msghost);

      return deferred;

    }

    function messageHandler(event) {
        
      if (event.origin != gadget.msghost) return;

      var message = event.data;

      if (typeof message == 'string') {

        try {

          message = JSON.parse(message);

        }

        catch (e) {

          console.log('Cannot parse message from OU Campus app : ', message);

          return;

        }

      }

      if (message.callback) return; // the message listener in sendMessageToTop will handle this message

      if (message.name == 'configuration') gadget.setConfig(message.payload);

      $(gadget).trigger(message.name, message.payload);

    }

    var gadget = {

      ready : function (callback) {

        var deferred = new $.Deferred();

        if (this.isReady) {

          callback && callback();

          deferred.resolve();

        }

        else {

          $(this).one('ready', function () {

            callback && callback();

            deferred.resolve();

          });

        }

        return deferred;

      },

      get : function (propName) { // Get the value of a property of the gadget.
            
        if (typeof this[propName] == 'object') return JSON.parse(JSON.stringify(this[propName]));

        else return this[propName];

      },

      set : function (arg0, arg1) {

        // Set a property of the gadget. You can pass either a single property name and value
        // as two arguments, e.g.:
        //     gadget.set('favoriteColor', 'blue');
        // or several properties in a plain object, e.g.:
        //     gadget.set({ favoriteColor: 'blue', favoriteFlavor: 'vanilla' });

        if (typeof arg0 == 'string') this[arg0] = arg1;

        else for (var key in arg0) if (arg0.hasOwnProperty(key)) this[key] = arg0[key];
  
      },

      resizeGadget : function (height) {

        if (gadget.place != 'sidebar') return;

        if (height == 'max') height = 300;

        $(window.frameElement.parentElement).height(height || document.body.offsetHeight);

      },

      getConfig : function (propName) {

        // Same as the `get` method, but returns a subproperty of the gadget's `config`
        // property, which is set by the `fetch` method.

        if (typeof this.config[propName] == 'object') return JSON.parse(JSON.stringify(this.config[propName]));

        else return this.config[propName];

      },

      setConfig : function (arg0, arg1) {

        // Same as the `set` method, but sets a subproperty of the gadget's `config` property.

        if (typeof arg0 == 'string') this.config[arg0] = arg1;

        else for (var key in arg0) if (arg0.hasOwnProperty(key)) this.config[key] = arg0[key];

      },

      collectUrlData : function () {

      },

      fetch : function () {

        // A convenience method to get the gadget's configuration as stored in the OU Campus
        // database by calling the /gadgets/view API. On a successful API call, the method
        // saves the config into the Gadget instance; you can then use `getConfig` to get
        // specific properties of the configuration.
        //
        // The method returns a jQuery Deferred object, so you can use methods like `then` to
        // do stuff once the API call has received a response.

        var self = this;
        var endpoint = self.apihost + '/gadgets/view';
        var params = {

          authorization_token : self.token,
          account : self.account,
          gadget : self.gid

        };

        return $.ajax({

          type    : 'GET',
          url     : endpoint, 
          data    : params, 
          success : function (data) {

            self.config = {};

            for (var key in data.config) if (data.config.hasOwnProperty(key)) self.config[key] = data.config[key].value;

          },
          error : function (xhr, status, error) {

            console.log('Fetch error:', status, error);

            displayConnectionError();

          },

        });

      },

      save : function (arg0, arg1) {

        // A convenience method to set one or more properties of the gadget's configuration
        // back to the OU Campus database by calling /gadgets/configure.
        //
        // The method returns a jQuery Deferred object, so you can use methods like `then`
        // to do stuff once the API call has received a response.

        if (arg0) this.setConfig(arg0, arg1);


        var self = this;
        var endpoint = self.apihost + '/gadgets/configure';
        var params = self.config;

        params.authorization_token = self.token;
        params.account = self.account;
        params.gadget = self.gid;

        return $.ajax({

          type    : 'POST',
          url     : endpoint, 
          data    : params, 
          success : function (data) {},
          error : function (xhr, status, error) { console.log('Save error:', status, error) },

        });

      },

      // for backward compatibility with pre-1.0.4 versions of gadgetlib.js
      //_sendMessageToTop : sendMessageToTop,

      oucGetCurrentFileInfo : () => sendMessageToTop('get-current-file-info'),

      oucGetCurrentLocation : () => sendMessageToTop('get-location'),

      oucGetSourceContent : () => sendMessageToTop('get-source-content'),

      oucGetWYSIWYGContent : () => sendMessageToTop('get-wysiwyg-content'),

      oucGetWYSIWYGSelection : () => sendMessageToTop('get-wysiwyg-selection'),   

      oucInsertAtCursor : (content) => sendMessageToTop('insert-at-cursor', content),

      oucRefreshLocation : () => sendMessageToTop('refresh-location'),

      oucSetCurrentLocation : (route) => sendMessageToTop('set-location', route),

    };
    
    for (var method in gadget) gadget[method] = gadget[method].bind(gadget); // bind all methods
    
    gadget.set(getDataFromUrl());

    getEnvironment()

      .then(response => {

        if (response != 'Unrecognized message.') gadget.set(response);

        gadget.isReady = true;

        $(gadget).trigger('ready');

      });
    
    window.addEventListener('message', messageHandler, false);
    
    // make the gadget object available as a global variable
    window.gadget = gadget;
    
})();
