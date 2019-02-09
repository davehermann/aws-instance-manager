const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { DateTime } = require(`luxon`),
    { Info, InitializeLogging, Warn, Err } = require(`multi-level-logger`),
    { AvailableInstances } = require(`./launchTemplates`);

let _useCredentialProfile = undefined;

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
    if (answers.maximumLifetime > 0)
        launchInstance.ValidUntil = DateTime.local().plus({ hours: answers.maximumLifetime }).toSeconds();

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

    return ec2.describeInstances().promise();
}

function listInstances() {
    return getAllInstances()
        .then(data => {
            Info(data.Reservations.map(res => {
                return res.Instances.map(instance => {
                    return {
                        ImageId: instance.ImageId,
                        InstanceId: instance.InstanceId,
                        InstanceType: instance.InstanceType,
                        LaunchTime: instance.LaunchTime,
                        IP: instance.PublicIpAddress,
                        DNS: instance.PublicDnsName,
                        State: instance.State,
                        Tags: instance.Tags,
                    };
                });
            }));
        });
}

function terminateInstance() {
    return getAllInstances()
        .then(data => {
            let choices = [];
            data.Reservations.forEach(reservation => {
                reservation.Instances.forEach(instance => {
                    if (instance.State.Code == 16) {
                        let name = instance.InstanceId;

                        if (!!instance.Tags) {
                            let nameTags = instance.Tags.filter(tag => { return tag.Key == `Name`; });
                            if (nameTags.length > 0)
                                name = `${nameTags[0].Value} (${instance.InstanceId})`;
                        }

                        choices.push({ name, value: instance.InstanceId, short: instance.InstanceId, });
                    }
                });
            });

            if (choices.length == 0) {
                Warn(`No running instances to terminate`);
                return Promise.resolve();
            } else {
                let questions = [
                    {
                        name: `terminateId`,
                        message: `Select instance to terminate:`,
                        choices,
                    },
                ];
                return inquirer.prompt(questions);
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
            if (!!answers.profileName !== undefined) {
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
