// NPM Modules
const inquirer = require(`inquirer`),
    { Info } = require(`multi-level-logger`);

// Application Modules
const { EmptyList, InstanceSummary } = require(`./utilities`);

/**
 * List all instances, and provide more detail when selected
 */
function listInstances() {
    return InstanceSummary()
        .then(instances => {
            return EmptyList(instances, `No instances found`);
        })
        .then(instances => {
            if (!!instances) {
                let questions = [
                    {
                        type: `list`,
                        name: `instanceDetail`,
                        message: `Select an instance for more details`,
                        choices: instances
                            .map(instance => { return { name: `${instance.name} - ${instance.data.State.Name}[${instance.data.State.Code}]`, value: instance.id, short: instance.id }; })
                            .concat([{ name: `Return to Main Menu`, value: null }]),
                    },
                ];
    
                return inquirer.prompt(questions)
                    .then(answers => {
                        if (!!answers.instanceDetail)
                            Info(instances.find(instance => { return instance.id == answers.instanceDetail; }));
                    });
            }
            return Promise.resolve();
        });
}

module.exports.ListInstances = listInstances;
