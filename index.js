const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { DateTime } = require(`luxon`),
    { Info, InitializeLogging } = require(`multi-level-logger`),
    { AvailableInstances } = require(`./launchTemplates`);

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
        console.log(JSON.stringify(launchInstance, null, 4));

    return ec2.requestSpotInstances(launchInstance).promise();
}

function launchSpot() {
    return selectConfiguration()
        .then(answers => submitRequest(answers))
        .then(data => {
            console.log(`Request initiated`);
            console.log(data);
        });
}

function listInstances() {
    let ec2 = new aws.EC2({ apiVersion: `2016-11-05`, region: `us-east-1` });

    return ec2.describeInstances().promise()
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

function menu() {
    let questions = [
        {
            type: `list`,
            name: `selection`,
            choices: [
                { name: `List Instances`, value: `instanceList` },
                { name: `Launch Spot Instance`, value: `launchSpot` },
                { name: `Exit`, value: `exit` },
            ],
        },
    ];

    return inquirer.prompt(questions)
        .then(answers => {
            switch (answers.selection) {
                case `exit`:
                    process.exit();
                    break;

                case `instanceList`:
                    return listInstances();

                case `launchSpot`:
                    return launchSpot();
            }
        })
        .then(() => menu());
}

InitializeLogging(`info`);
aws.config.credentials = new aws.SharedIniFileCredentials({ profile: `other_profile` });

menu()
    .catch(err => {
        console.error(err);
    });
