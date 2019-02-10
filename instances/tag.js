// NPM Modules
const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`);

// Application Modules
const { EmptyList, InstanceSummary } = require(`./utilities`);

/**
 * Add a tag to a running instance
 */
function tagInstance() {
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
                        name: `tagId`,
                        message: `Select instance to tag:`,
                        choices,
                    },
                    {
                        name: `tagKey`,
                        message: `What key will be used for the tag?`,
                        default: `Name`,
                        when: (answers) => {
                            return !!answers.tagId;
                        },
                    },
                    {
                        name: `tagValue`,
                        message: (answers) => { return `What is the value of "${answers.tagKey}"?`; },
                        when: (answers) => {
                            return !!answers.tagKey;
                        },
                    },
                ];

                return inquirer.prompt(questions)
                    .then(answers => {
                        return !!answers.tagValue ? answers : null;
                    });
            }

            return Promise.resolve();
        })
        .then(answers => {
            if (!!answers) {
                let ec2 = new aws.EC2({ apiVersion: `2016-11-05`, }),
                    taggingParams = {
                        Resources: [answers.tagId],
                        Tags: [
                            { Key: answers.tagKey, Value: answers.tagValue },
                        ],
                    };

                return ec2.createTags(taggingParams).promise();
            }

            return Promise.resolve();
        });
}

module.exports.TagInstance = tagInstance;
