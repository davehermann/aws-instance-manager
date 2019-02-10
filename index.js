const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { DateTime } = require(`luxon`),
    { Info, InitializeLogging, Warn, Err } = require(`multi-level-logger`),
    { AvailableInstances } = require(`./launchTemplates`);

let _useCredentialProfile = undefined;

function emptyList(itemList, message) {
    if (itemList == 0) {
        Warn(message || `No running instances found`);
        return Promise.resolve();
    } else
        return Promise.resolve(itemList);
}

function selectConfiguration() {
    let instanceNames = [];
    for (let name in AvailableInstances)
        instanceNames.push(name);

    const questions = [
        {
            type: `list`,
            name: `selectedInstance`,
            message: `Select a template to launch:`,
            choices: instanceNames,
        },
        {
            name: `maximumLifetime`,
            message: `How many hours should this instance operate:`,
            default: 4,
        },
        {
            type: `confirm`,
            name: `showRequest`,
            message: `Show the request data?`,
        }
    ];

    return inquirer.prompt(questions);
}

function submitRequest(answers) {
    let ec2 = new aws.EC2({ apiVersion: `2016-11-05`, region: `us-east-1` });

    // Copy the instance configuration
    let launchInstance = JSON.parse(JSON.stringify(AvailableInstances[answers.selectedInstance]));

    // Add an expiration the requested hours in the future (2020-02-09T13:34:20Z)
    if (answers.maximumLifetime > 0) {
        const expirationTime = DateTime.utc().plus({ hours: +answers.maximumLifetime });
        launchInstance.ValidUntil = expirationTime.toISO(); //`${expirationTime.toFormat(`yyyy-LL-dd`)}T${expirationTime.toFormat(`TT`)}Z`;
    }

    if (answers.showRequest)
        Info(launchInstance);

    return ec2.requestSpotInstances(launchInstance).promise();
}

function launchSpot() {
    return selectConfiguration()
        .then(answers => submitRequest(answers))
        .then(data => {
            Warn(`Request initiated`);
            Info(data);
        });
}

function getAllInstances() {
    let ec2 = new aws.EC2({ apiVersion: `2016-11-05`, region: `us-east-1` });

    return ec2.describeInstances().promise()
        // Flatten the list
        .then(data => {
            let instanceList = [];
            data.Reservations.forEach(reservation => {
                instanceList = instanceList.concat(reservation.Instances);
            });

            return instanceList;
        });
}

function instanceSummary() {
    return getAllInstances()
        .then(instances => {
            return instances.map(instance => {
                let name = instance.InstanceId;

                if (!!instance.Tags) {
                    let nameTags = instance.Tags.filter(tag => { return tag.Key == `Name`; });
                    if (nameTags.length > 0)
                        name = `${nameTags[0].Value} (${instance.InstanceId})`;
                }

                return { name, id: instance.InstanceId, data: instance };
            });
        });
}

function listInstances() {
    return instanceSummary()
        .then(instances => {
            return emptyList(instances, `No instances found`);
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

function tagInstance() {
    return instanceSummary()
        .then(instances => {
            let choices = instances
                .filter(instance => { return instance.data.State.Code == 16; })
                .map(instance => { return { name: instance.name, value: instance.id, short: instance.id }; });

            return emptyList(choices.length);
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
                let ec2 = new aws.EC2({ apiVersion: `2016-11-05`, region: `us-east-1` }),
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

function terminateInstance() {
    return instanceSummary()
        .then(instances => {
            let choices = instances
                .filter(instance => { return instance.data.State.Code == 16; })
                .map(instance => { return { name: instance.name, value: instance.id, short: instance.id }; });

            return emptyList(choices);
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
                let ec2 = new aws.EC2({ apiVersion: `2016-11-05`, region: `us-east-1` });

                return ec2.terminateInstances({ InstanceIds: [answers.terminateId] }).promise();
            }
        });
}

function menu() {
    let questions = [
        {
            type: `list`,
            name: `selection`,
            message: `Main Menu`,
            choices: [
                { name: `List Instances`, value: `instanceList` },
                { name: `Tag Running Instance`, value: `tagInstance` },
                { name: `Launch Spot Instance`, value: `launchSpot` },
                { name: `Terminate Instances`, value: `terminate` },
                { name: `Exit`, value: `exit` },
            ],
        },
    ];

    if (_useCredentialProfile === undefined)
        questions.unshift({
            name: `profileName`,
            message: `Profile name for credentials:`,
        });

    return inquirer.prompt(questions)
        .then(answers => {
            if (answers.profileName !== undefined) {
                if (answers.profileName.trim().length > 0)
                    aws.config.credentials = new aws.SharedIniFileCredentials({ profile: answers.profileName });

                _useCredentialProfile = answers.profileName;
            }

            switch (answers.selection) {
                case `exit`:
                    process.exit();
                    break;

                case `instanceList`:
                    return listInstances();

                case `launchSpot`:
                    return launchSpot();

                case `tagInstance`:
                    return tagInstance();

                case `terminate`:
                    return terminateInstance();
            }
        })
        .then(() => menu());
}

InitializeLogging(`info`);

menu()
    .catch(err => {
        Err(err);
    });
