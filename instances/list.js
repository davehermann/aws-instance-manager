// NPM Modules
const inquirer = require(`inquirer`),
    { DateTime } = require(`luxon`),
    { Info } = require(`multi-level-logger`);

// Application Modules
const { EmptyList, InstanceSummary } = require(`./utilities`);

function basicDetails(instance) {
    Info({
        Name: instance.name,
        Launched: `${DateTime.fromJSDate(instance.data.LaunchTime).toRelative()} (${DateTime.fromJSDate(instance.data.LaunchTime).toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS)})`,
        [`Public DNS`]: instance.data.PublicDnsName,
    });
}

function moreDetails(instance) {
    let questions = [
        {
            type: `confirm`,
            name: `fullDetails`,
            message: `Would you like to see the full instance data?`,
            default: false,
        }
    ];

    return inquirer.prompt(questions)
        .then(answers => {
            if (answers.fullDetails)
                Info(instance);
        });
}

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
                            .concat([{ name: `Refresh List`, value: `refresh` }, { name: `Return to Main Menu`, value: null }]),
                    },
                ];
    
                return inquirer.prompt(questions)
                    .then(answers => {
                        if (!!answers.instanceDetail) {
                            if (answers.instanceDetail == `refresh`)
                                return listInstances();
                            else {
                                const instance = instances.find(instance => { return instance.id == answers.instanceDetail; });
                                basicDetails(instance);
    
                                return moreDetails(instance)
                                    .then(() => listInstances());
                            }
                        }
                    });
            }
            return Promise.resolve();
        });
}

module.exports.ListInstances = listInstances;
