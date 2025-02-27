const appPath = '/';

const appRootPath = {
  path: appPath,
  resolve: function(pathToModule) {
    return appPath + '/' + pathToModule;
  },
  toString: function() {
    return appPath;
  }
};

export default appRootPath;