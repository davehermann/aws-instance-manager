// NPM Modules
const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { DateTime } = require(`luxon`),
    { Info, Warn } = require(`multi-level-logger`);

// Application Modules
const { AvailableInstances } = require(`./launchTemplates`);

/**
 * Series of options for configuring a spot request
 */
function selectConfiguration() {
    let instanceNames = [];
    for (let name in AvailableInstances)
        instanceNames.push(name);

    instanceNames.push({ name: `Return to Main Menu`, value: null });

    const questions = [
        {
            type: `list`,
            name: `selectedInstance`,
            message: `Select a template to launch:`,
            choices: instanceNames,
        },
        {
            name: `maximumLifetime`,
            message: `How many hours should this request be active:`,
            default: 1,
            when: answers => {
                return !!answers.selectedInstance;
            },
        },
        {
            type: `confirm`,
            name: `showRequest`,
            message: `Show the request data?`,
            when: answers => {
                return !!answers.selectedInstance;
            },
        }
    ];

    return inquirer.prompt(questions);
}

function selectImage(instanceConfiguration) {
    const ec2 = new aws.EC2({ apiVersion: `2016-11-05` });

    return ec2.describeImages({ Owners:[`self`] }).promise()
        .then(data => {
            let imageList = data.Images.map(ami => {
                return {
                    name: `${ami.Name} [${ami.Platform}] (${ami.ImageId}) - ${DateTime.fromISO(ami.CreationDate).toRelative()}`,
                    value: JSON.parse(JSON.stringify(ami)),
                    short: ami.ImageId,
                };
            });

            let questions = [
                {
                    type: `list`,
                    name: `ami`,
                    message: `Select AMI from a list of your images`,
                    choices: imageList,
                }
            ];

            return inquirer.prompt(questions)
                .then(answers => {
                    instanceConfiguration.LaunchSpecification.ImageId = answers.ami.ImageId;
                    answers.ami.BlockDeviceMappings.forEach(device => {
                        delete device.Ebs.Encrypted;
                    });
                    instanceConfiguration.LaunchSpecification.BlockDeviceMappings = answers.ami.BlockDeviceMappings;
                });
        })
        .then(() => { return instanceConfiguration; });
}

function selectAvailabilityZone(instanceConfiguration) {
    const hoursBack = 48,
        ec2 = new aws.EC2({ apiVersion: `2016-11-05`, }),
        priceHistoryParams = {
            InstanceTypes: [instanceConfiguration.LaunchSpecification.InstanceType],
            StartTime: DateTime.utc().plus({ hours: -hoursBack }).toJSDate(),
            EndTime: DateTime.utc().toJSDate()
        };

    return ec2.describeSpotPriceHistory(priceHistoryParams).promise()
        .then(data => {
            // Filter by ProductDescription - ask the user
            let pricing = {};

            data.SpotPriceHistory.forEach(price => {
                if (!pricing[price.ProductDescription])
                    pricing[price.ProductDescription] = {};

                if (!pricing[price.ProductDescription][price.AvailabilityZone])
                    pricing[price.ProductDescription][price.AvailabilityZone] = [];

                pricing[price.ProductDescription][price.AvailabilityZone].push(price);
            });

            let names = [];
            for (let desc in pricing)
                names.push(desc);
            names.sort();

            let questions = [
                {
                    type: `list`,
                    name: `instanceType`,
                    message: `Select the instance type you're running to see pricing history for the last ${hoursBack} hours`,
                    choices: names,
                },
            ];

            return inquirer.prompt(questions)
                .then(answers => {
                    return pricing[answers.instanceType];
                });
        })
        .then(instancePricing => {
            // Sort zones by name
            let zones = [];
            for (let zone in instancePricing)
                zones.push(zone);
            zones.sort();

            zones.forEach(zone => {
                // Sort by time
                instancePricing[zone].sort((a, b) => {
                    return a.Timestamp.getTime() > b.Timestamp.getTime() ? -1 : 1;
                });

                // Show the price as hours/minutes ago
                let zonePrices = [];
                instancePricing[zone].forEach(price => {
                    zonePrices.push(`${price.SpotPrice} (${DateTime.fromJSDate(price.Timestamp).toRelative({ unit: `hours` })})`);
                });
                Warn(`${zone}: ${zonePrices.join(` - `)}`);
            });

            return zones;
        })
        .then(zones => {
            return ec2.describeSubnets({ Filters: [{ Name: `availability-zone`, Values: zones }] }).promise()
                .then(data => {
                    let mySubnets = data.Subnets.map(subnet => { return { zone: subnet.AvailabilityZone, subnet: subnet }; });

                    let questions = [
                        {
                            type: `list`,
                            name: `subnet`,
                            message: `Available subnets to launch in:`,
                            choices: mySubnets.map(subnet => { return subnet.zone; }).sort(),
                        }
                    ];

                    return inquirer.prompt(questions)
                        .then(answers => {
                            let selectedSubnet = mySubnets.find(subnet => { return subnet.zone == answers.subnet; });

                            return selectedSubnet.subnet;
                        });
                });
        })
        .then(launchSubnet => {
            instanceConfiguration.LaunchSpecification.NetworkInterfaces[0].SubnetId = launchSubnet.SubnetId;
        })
        .then(() => {
            return Promise.resolve(instanceConfiguration);
        });
}

/**
 * Trigger a new EC2 spot request
 * @param {Object} answers - Answers to the spot configuration questions
 */
function submitRequest(answers) {
    if (answers.selectedInstance == null)
        return Promise.resolve();

    // Copy the instance configuration
    let instanceConfiguration = JSON.parse(JSON.stringify(AvailableInstances[answers.selectedInstance]));

    return Promise.resolve(instanceConfiguration)
        .then(instanceConfiguration => { return (instanceConfiguration.LaunchSpecification.ImageId == `SELECT`) ? selectImage(instanceConfiguration) : instanceConfiguration; })
        .then(instanceConfiguration => { return (instanceConfiguration.LaunchSpecification.NetworkInterfaces[0].SubnetId == `SELECT`) ? selectAvailabilityZone(instanceConfiguration) : instanceConfiguration; })
        .then(launchInstance => {
            const ec2 = new aws.EC2({ apiVersion: `2016-11-05`, });

            // Add an expiration the requested hours in the future (2020-02-09T13:34:20Z)
            if (answers.maximumLifetime > 0) {
                const expirationTime = DateTime.utc().plus({ hours: +answers.maximumLifetime });
                launchInstance.ValidUntil = expirationTime.toISO(); //`${expirationTime.toFormat(`yyyy-LL-dd`)}T${expirationTime.toFormat(`TT`)}Z`;
            }

            if (answers.showRequest)
                Info(launchInstance);

            return ec2.requestSpotInstances(launchInstance).promise();
        });
}

/**
 * Launch a new spot request via a series of configuration options
 */
function launchSpot() {
    return selectConfiguration()
        .then(answers => submitRequest(answers))
        .then(data => {
            if (!!data) {
                Warn(`Request initiated`);
                Info(data);
            }
        });
}

module.exports.NewSpotRequest = launchSpot;
