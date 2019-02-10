// NPM Modules
const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`);

// Application Modules
const { EmptyList, InstanceSummary } = require(`./utilities`);

/**
 * Terminate a running instance
 */
function terminateInstance() {
    return InstanceSummary()
        .then(instances => {
            let choices = instances
                .filter(instance => { return instance.data.State.Code == 16; })
                .map(instance => { return { name: instance.name, value: instance.id, short: instance.id }; });

            return EmptyList(choices);
        })
        .then(choices => {
            if (!!choices) {
                choices = choices
                    .concat([{ name: `Return to Main Menu`, value: null }]);

                let questions = [
                    {
                        type: `list`,
                        name: `terminateId`,
                        message: `Select instance to terminate:`,
                        choices,
                    },
                ];
                return inquirer.prompt(questions)
                    .then(answers => {
                        return !!answers.terminateId ? answers : null;
                    });
            }

            return Promise.resolve();
        })
        .then(answers => {
            if (!!answers) {
                let ec2 = new aws.EC2({ apiVersion: `2016-11-05`, });

                return ec2.terminateInstances({ InstanceIds: [answers.terminateId] }).promise();
            }
        });
}

module.exports.TerminateInstance = terminateInstance;
