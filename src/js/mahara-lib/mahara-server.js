/*jshint esnext: true */
import httpLib      from './http-lib.js';
import {LOGIN_TYPE} from './constants.js';

class MaharaServer {
  restore = (state) => {
    if(state.url){
      this.protocol = state.url.protocol;
      this.domain = state.url.domain;
    }
    this.ssoUrl = state.ssoUrl;
    this.loginTypes = state.loginTypes;
    this.token = state.token;
    this.user = state.user;
  }
  setUrl = (url, callback) => {
    var previousDomain = this.domain;
    this.domain = url.replace(/^.*?\:\/\//, '').replace(/\/.*?$/, ''); //remove any protocol and any path but leave any port numbers
    this.autoDetectProtocolAndLoginMethod(callback, previousDomain);
  }
  getServerProtocolAndDomain = () => {
    if(!this.protocol) return console.log("Error no protocol chosen yet. Run autoDetectProtocolAndLoginMethod(callback) first.");
    if(!this.domain)   return console.log("Error no domain chosen yet. Run autoDetectProtocolAndLoginMethod(callback) first.");
    return this.protocol + "://" + this.domain;
  }
  loginPath = "/";
  logoutPath = "/?logout";
  autoDetectProtocolAndLoginMethod = (callback, previousDomain) => {
    var that = this,
        checkedProtocols = {"https": undefined, "http": undefined},
        successFrom = function(protocol){
          return function(response){
            var LOCALs = ["login_username", '"token"'], // scrape html for these fragments to indicate support for features. Not happy with this but necessary until we get API support (see README.md SERVER-TODO)
                SSOs   = ['>SSO<', 'saml'],
                LOGGEDIN = [/\?logout/],
                ssoUrl,
                matches;

            if(!response || !response.target || !response.target.response){
              // nothing to scrape... presume at least a U/P login
              checkedProtocols[protocol] = [LOGIN_TYPE.LOCAL];
              console.log("Odd...nothing to scrape from " + that.domain, response.target.response);
              next();
              return;
            }

            if(response.target.response.match(LOGGEDIN[0])){
              if(that.domain === previousDomain && that.protocol && that.loginTypes){
                console.log("They're already logged in so we can't scrape for login details, assume previous details were ok", that);
                checkedProtocols[that.protocol] = that.loginTypes;
                next();
                return;
              }
            }

            if(response.target.response.match(LOCALs[0]) || response.target.response.match(LOCALs[1])){
              if(!checkedProtocols[protocol]) checkedProtocols[protocol] = [];
              checkedProtocols[protocol].push(LOGIN_TYPE.LOCAL);
            } else {
              checkedProtocols[protocol] = false;
            }

            if(response.target.response.match(SSOs[0]) || response.target.response.match(SSOs[1])){
              matches = response.target.response.match(/http[^'"]*?saml[^'"]+/gi);
              if(matches.length > 0){
                ssoUrl = matches[0].replace(/\\$/, ''); // because sometimes there's a trailing \
                while(ssoUrl.match(/^https?\:\\\//)){ // sometimes Url is JavaScript string escaped so a URL might start with "http:\/" so if it does then we need to decode it
                  try {
                    ssoUrl = JSON.parse("[\"" + ssoUrl + "\"]")[0];
                  } catch(e){
                    console.log("Problem decoding ssoUrl. ssoUrl=", ssoUrl, e);
                  }
                }
                if(!checkedProtocols[protocol]) checkedProtocols[protocol] = [];
                checkedProtocols[protocol].push(LOGIN_TYPE.SINGLE_SIGN_ON);
                that.ssoUrl = ssoUrl;
              }
            }
            next();
          }
        },
        failureFrom = function(protocol){
          return function(response){
            checkedProtocols[protocol] = false;
            next();
          }
        },
        next = function(){
          var allResponsesReceived = true;
          for(var protocol in checkedProtocols){
            if(checkedProtocols[protocol] === undefined) allResponsesReceived = false;
          }
          if(allResponsesReceived){
            if(checkedProtocols.http !== false && checkedProtocols.http !== undefined) {
              that.protocol = "http";
              that.loginTypes = checkedProtocols.http;
            }
            if(checkedProtocols.https !== false && checkedProtocols.https !== undefined) { // https is preferred
              that.protocol = "https";
              that.loginTypes = checkedProtocols.https;
            }
            if(callback) callback();
          }
        };

    for(var protocol in checkedProtocols){
      httpLib.get(protocol + "://" + this.domain + this.loginPath, undefined, successFrom(protocol), failureFrom(protocol));
    }
  }
  usernamePasswordLogin = (username, password, successCallback, errorCallback) => {
    var that = this,
        protocolAndDomain = this.getServerProtocolAndDomain();

    if(!protocolAndDomain) return errorCallback();

    httpLib.post(protocolAndDomain + this.loginPath, undefined, {
      login_username:username,
      login_password:password,
      submit:"Login",
      login_submitted: 1,
      sesskey: "",
      pieform_login: "",
    }, scrapeFromResponse(successCallback), errorCallback);

    function scrapeFromResponse(fn){
      return function(response){
        var responseData,
            login;

        if(!response.target || !response.target.response || !response.target.response.match('{"token":"') || !response.target.response.match("</script>")){
          console.log("Unable to scrape session from response so can't login (1). Response was", responseData);
          return errorCallback();
        }
        responseData = response.target.response,
        responseData = responseData.substr(responseData.indexOf("</script>") + "</script>".length);
        try {
          login = JSON.parse(responseData);
        } catch(e){
          console.log("Unable to scrape session from response so can't login (2). Response was", responseData);
          return errorCallback();
        }
        if(login.token) that.token = login.token;
        if(login.user)  that.user  = login.user;
        var args = Array.prototype.slice.call(arguments);
        args.unshift(login);
        fn.apply(this, args);
      }
    }
  };
  checkIfLoggedIn = (callback) => {
    var protocolAndDomain = this.getServerProtocolAndDomain();
    if(!protocolAndDomain){
      callback(undefined);
      return;
    }

    var successFrom = function(callback){
      return function(response){
        var LOGGEDIN = [/\?logout/];

        if(!response || !response.target || !response.target.response){
          callback(undefined);
          return;
        }

        callback(!!response.target.response.match(LOGGEDIN[0]));
      }
    };

    var failureFrom = function(callback){
      return function(response){
        callback(undefined);
      }
    };

    httpLib.get(protocolAndDomain, undefined, successFrom(callback), failureFrom(callback));
  }
  logout = (callback) => {
    var protocolAndDomain = this.getServerProtocolAndDomain();
    if(!protocolAndDomain){
      callback(undefined);
      return;
    }

    var successFrom = function(callback){
      return function(response){
        var LOGGEDIN = [/\?logout/];

        if(!response || !response.target || !response.target.response){
          callback(undefined);
          return;
        }

        callback(!!response.target.response.match(LOGGEDIN[0]));
      }
    };

    var failureFrom = function(callback){
      return function(response){
        callback(undefined);
      }
    };

    httpLib.get(protocolAndDomain + this.logoutPath, undefined, successFrom(callback), failureFrom(callback));
  }
  uploadFilePath = "/api/mobile/upload.php";
  uploadFile = (path) => {
    
  }
}

const maharaServer = new MaharaServer();

export default maharaServer
