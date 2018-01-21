import syrup = require('./syrup');

let opts: syrup.SyrupOpts = { apiDir: __dirname };

// syrup.go('serverconfig.json', undefined, opts);
syrup.go();
