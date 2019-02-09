const configuredInstances = require(`./myInstances.json`);

function AvailableInstances() {
    let instances = {};

    configuredInstances.forEach(config => {
        instances[config.name] = config.configuration;
    });

    return instances;
}

module.exports.AvailableInstances = AvailableInstances();
